import { configureWorkerState, dispatchApiRequest, exportWorkerState } from './api.mjs';

const stateChunkCharacters = 300_000;

function responseAdapter() {
  let status = 200;
  let headers = new Headers();
  let body;
  let ended = false;
  let headersSent = false;

  return {
    get headersSent() { return headersSent; },
    get writableEnded() { return ended; },
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      headers = new Headers(nextHeaders);
      headersSent = true;
      return this;
    },
    end(nextBody) {
      body = nextBody;
      ended = true;
    },
    destroy() {
      status = 500;
      body = 'Internal server error.';
      ended = true;
    },
    toResponse() {
      return new Response(body, { status, headers });
    },
  };
}

function requestAdapter(request) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers);
  return {
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    socket: {
      encrypted: url.protocol === 'https:',
      remoteAddress: request.headers.get('cf-connecting-ip') || 'unknown',
    },
    async *[Symbol.asyncIterator]() {
      const bytes = Buffer.from(await request.arrayBuffer());
      if (bytes.length) yield bytes;
    },
  };
}

export class AppState {
  constructor(state, environment) {
    this.state = state;
    this.environment = environment;
    this.queue = Promise.resolve();
    this.state.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS state_chunks (chunk_index INTEGER PRIMARY KEY, payload TEXT NOT NULL)',
    );
  }

  fetch(request) {
    const result = this.queue.then(() => this.handle(request));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async readState() {
    const chunks = this.state.storage.sql
      .exec('SELECT payload FROM state_chunks ORDER BY chunk_index')
      .toArray();
    if (!chunks.length) return undefined;
    return JSON.parse(chunks.map((row) => row.payload).join(''));
  }

  writeState = async (state) => {
    const serialized = JSON.stringify(state);
    const chunks = [];
    for (let offset = 0; offset < serialized.length;) {
      let end = Math.min(offset + stateChunkCharacters, serialized.length);
      if (end < serialized.length && /[\uD800-\uDBFF]/.test(serialized[end - 1])) end -= 1;
      chunks.push(serialized.slice(offset, end));
      offset = end;
    }
    if (!chunks.length) chunks.push('{}');
    const previousCount = this.state.storage.sql
      .exec('SELECT COUNT(*) AS count FROM state_chunks')
      .one().count;

    for (let index = 0; index < chunks.length; index += 1) {
      this.state.storage.sql.exec(
        `INSERT INTO state_chunks (chunk_index, payload) VALUES (?, ?)
         ON CONFLICT(chunk_index) DO UPDATE SET payload = excluded.payload
         WHERE payload != excluded.payload`,
        index,
        chunks[index],
      );
    }
    if (previousCount > chunks.length) {
      this.state.storage.sql.exec(
        'DELETE FROM state_chunks WHERE chunk_index >= ?',
        chunks.length,
      );
    }
  };

  async handle(request) {
    try {
      const persisted = await this.readState();
      configureWorkerState(this.environment, persisted, this.writeState);
      const adapter = responseAdapter();
      const nodeRequest = requestAdapter(request);
      await dispatchApiRequest(nodeRequest, adapter, new URL(request.url));
      await this.writeState(exportWorkerState());
      return adapter.toResponse();
    } catch (error) {
      console.error('Xspec API request failed.', error);
      return Response.json(
        { error: 'The Xspec service could not complete this request. Please try again.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }
}

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return environment.ASSETS.fetch(request);
    }
    const id = environment.APP_STATE.idFromName('xspec-global-state');
    return environment.APP_STATE.get(id).fetch(request);
  },
};
