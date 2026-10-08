import { createServer } from 'node:http';
import { initializeLocalStore, dispatchApiRequest, serveProduction } from './api.mjs';

const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || '127.0.0.1';
let vite;

await initializeLocalStore();

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    await dispatchApiRequest(request, response, url);
    return;
  }
  if (production) return serveProduction(request, response, url);
  if (!vite) { response.writeHead(503); response.end('Development server is starting.'); return; }
  vite.middlewares(request, response, (error) => {
    if (error) {
      if (!response.headersSent) { response.writeHead(500); response.end('Development server error.'); }
      else response.destroy();
    } else if (!response.writableEnded) {
      response.writeHead(404); response.end('Not found');
    }
  });
});

if (!production) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ configLoader: 'native', server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
}

server.listen(port, host, () => {
  const appName = process.env.AUTH_APP_NAME || 'Xspec';
  console.log(`${appName} ${production ? 'production server' : 'development server'} running at http://${host}:${port}`);
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_FROM_EMAIL) {
    console.log('Email sign-in is disabled until RESEND_API_KEY and AUTH_FROM_EMAIL are configured.');
  }
});

async function shutdown() {
  await vite?.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
