import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { standardRaceTracks } from './race-courses.js';
import { displayUsername, usernameError } from './username-policy.js';

const isLocalServer = Array.isArray(process.argv) && path.basename(process.argv[1] || '') === 'server.mjs';
if (isLocalServer && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '.env')); } catch { /* The environment file is optional. */ }
}
const projectRoot = isLocalServer ? path.dirname(fileURLToPath(import.meta.url)) : '';
const dataDirectory = path.join(projectRoot, '.data');
const accountFile = path.join(dataDirectory, 'accounts.json');
const distDirectory = path.join(projectRoot, 'dist');
const production = (process.argv || []).includes('--production') || process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || '127.0.0.1';
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const codeLifetimeMs = 10 * 60 * 1000;
const maxCodeAttempts = 5;
let runtimeEnvironment = process.env;
let codeSecret = process.env.AUTH_CODE_SECRET || '';
let persistOverride = null;
let challenges = new Map();
let pendingAccountSetups = new Map();
let rateWindows = new Map();
let friendPresence = new Map();
const communityTrackGameModes = new Set(['4v4', 'relay-race', 'prop-hunt']);
let store = { users: [], sessions: [], lobbies: [], friendships: [], friendRequests: [], teams: [], communityTracks: [] };

function setting(name) {
  return runtimeEnvironment[name] ?? '';
}

function normalizeStore(saved = {}) {
  return {
    users: Array.isArray(saved.users) ? saved.users : [],
    sessions: Array.isArray(saved.sessions) ? saved.sessions.filter((session) => session.expiresAt > Date.now()) : [],
    lobbies: Array.isArray(saved.lobbies) ? saved.lobbies : [],
    friendships: Array.isArray(saved.friendships) ? saved.friendships.filter((friendship) => Array.isArray(friendship.userIds) && friendship.userIds.length === 2) : [],
    friendRequests: Array.isArray(saved.friendRequests) ? saved.friendRequests.filter((request) => request.id && request.fromUserId && request.toUserId) : [],
    teams: Array.isArray(saved.teams) ? saved.teams.filter((team) => team.id && team.name && Array.isArray(team.members)) : [],
    communityTracks: Array.isArray(saved.communityTracks)
      ? saved.communityTracks
        .filter((track) => track.id && track.name && track.biomeId && Array.isArray(track.points) && typeof track.imageDataUrl === 'string')
        .map((track) => ({ ...track, gameMode: communityTrackGameModes.has(track.gameMode) ? track.gameMode : '4v4' }))
      : [],
  };
}

export async function initializeLocalStore() {
  runtimeEnvironment = process.env;
  codeSecret = setting('AUTH_CODE_SECRET') || codeSecret || randomBytes(32).toString('hex');
  await mkdir(dataDirectory, { recursive: true });
  try {
    store = normalizeStore(JSON.parse(await readFile(accountFile, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Could not load account data at ${accountFile}: ${error.message}`);
  }
}

export function configureWorkerState(environment, state, persist) {
  runtimeEnvironment = environment;
  codeSecret = environment.AUTH_CODE_SECRET || '';
  store = normalizeStore(state?.store);
  challenges = new Map(state?.challenges || []);
  pendingAccountSetups = new Map(state?.pendingAccountSetups || []);
  rateWindows = new Map(state?.rateWindows || []);
  friendPresence = new Map(state?.friendPresence || []);
  persistOverride = persist;
}

export function exportWorkerState() {
  return {
    store,
    challenges: [...challenges],
    pendingAccountSetups: [...pendingAccountSetups],
    rateWindows: [...rateWindows],
    friendPresence: [...friendPresence],
  };
}

async function saveStore() {
  if (persistOverride) {
    await persistOverride(exportWorkerState());
    return;
  }
  const temporaryFile = `${accountFile}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
  await rename(temporaryFile, accountFile);
}

function json(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function cookieValue(request, name) {
  const cookieHeader = request.headers.cookie || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function sessionCookie(request, token, clear = false) {
  const secure = setting('COOKIE_SECURE') === 'true' || Boolean(request.socket.encrypted);
  const securePart = secure ? '; Secure' : '';
  if (clear) return `aerframe_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${securePart}`;
  return `aerframe_session=${token}; Path=/; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}; HttpOnly; SameSite=Lax${securePart}`;
}

function hashSession(token) {
  return createHash('sha256').update(token).digest('hex');
}

function currentUser(request) {
  const token = cookieValue(request, 'aerframe_session');
  if (!token) return null;
  const tokenHash = hashSession(token);
  const session = store.sessions.find((candidate) => candidate.tokenHash === tokenHash && candidate.expiresAt > Date.now());
  if (!session) return null;
  return store.users.find((user) => user.id === session.userId) || null;
}

async function readJson(request, limit = 4096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: displayUsername(user.username),
    createdAt: user.createdAt,
    xp: Math.max(0, Math.floor(Number(user.xp) || 0)),
    firstPlaces: Math.max(0, Math.floor(Number(user.firstPlaces) || 0)),
  };
}

function nextTournament(now = Date.now()) {
  const startsAtValue = setting('XSPEC_TOURNAMENT_STARTS_AT').trim();
  const title = setting('XSPEC_TOURNAMENT_TITLE').trim().slice(0, 80) || 'XSPEC Tournament';
  if (!startsAtValue) return null;
  const startsAt = Date.parse(startsAtValue);
  if (!Number.isFinite(startsAt) || startsAt <= now) return null;
  return { title, startsAt: new Date(startsAt).toISOString(), cadence: 'Scheduled' };
}

function handleLeaderboard(request, response) {
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  const leaders = store.users
    .map((user) => ({ username: displayUsername(user.username), xp: Math.max(0, Math.floor(Number(user.xp) || 0)) }))
    .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username))
    .slice(0, 5);
  return json(response, 200, { leaders, nextTournament: nextTournament() });
}

function allowRate(key, limit, intervalMs) {
  const now = Date.now();
  const recent = (rateWindows.get(key) || []).filter((time) => now - time < intervalMs);
  if (recent.length >= limit) {
    rateWindows.set(key, recent);
    return false;
  }
  recent.push(now);
  rateWindows.set(key, recent);
  if (rateWindows.size > 2500) {
    for (const [rateKey, times] of rateWindows) {
      if (!times.length || now - times[times.length - 1] > intervalMs) rateWindows.delete(rateKey);
    }
  }
  return true;
}

function digestCode(email, code) {
  return createHmac('sha256', codeSecret).update(`${email}:${code}`).digest('hex');
}

function codeMatches(email, code, expectedHash) {
  const provided = Buffer.from(digestCode(email, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function sendEmailCode(email, code, intent) {
  const apiKey = setting('RESEND_API_KEY');
  const from = setting('AUTH_FROM_EMAIL');
  if (!apiKey || !from || !codeSecret) {
    throw Object.assign(new Error('Email sign-in is not configured. Set RESEND_API_KEY, AUTH_FROM_EMAIL, and AUTH_CODE_SECRET in the deployment environment.'), { status: 503 });
  }
  const purpose = intent === 'create' ? 'create your pilot account' : 'sign in to your pilot account';
  const appName = setting('AUTH_APP_NAME') || 'Xspec';
  const text = `Your ${appName} code is ${code}. Use it to ${purpose}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#eef2f6;font-family:Arial,sans-serif;color:#17202a"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #d7e0e8"><p style="font-size:12px;font-weight:bold;letter-spacing:3px;color:#ef7100">${appName}</p><h1 style="font-size:24px">Your sign-in code</h1><p>Use this code to ${purpose}.</p><p style="padding:16px;background:#f2f5f8;text-align:center;font:700 32px monospace;letter-spacing:10px">${code}</p><p style="font-size:13px;color:#5e6b75">This code expires in 10 minutes. If you did not request it, ignore this email.</p></div></body></html>`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: `${appName} email verification code`, html, text }),
    });
    if (!response.ok) {
      throw Object.assign(new Error('Email delivery failed. Check the server API key and verified sender address.'), { status: 502 });
    }
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('Email delivery timed out. Please try again.'), { status: 502 });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function verifySameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; }
  catch { return false; }
}

async function handleAuth(request, response, url) {
  if (!verifySameOrigin(request)) return json(response, 403, { error: 'This account request was rejected.' });
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const user = currentUser(request);
    return json(response, 200, { user: user ? publicUser(user) : null });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });

  let body;
  try { body = await readJson(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }

  if (url.pathname === '/api/auth/request-code') {
    const email = normalizeEmail(body.email);
    if (!email) return json(response, 400, { error: 'Enter a valid email address.' });
    const intent = store.users.some((user) => user.email === email) ? 'signin' : 'create';
    const ip = request.socket.remoteAddress || 'unknown';
    if (!allowRate(`send-ip:${ip}`, 18, 15 * 60_000) || !allowRate(`send-email:${email}`, 5, 15 * 60_000)) {
      return json(response, 429, { error: 'Too many code requests. Wait a little before trying again.' });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await sendEmailCode(email, code, intent);
      challenges.set(email, { hash: digestCode(email, code), intent, expiresAt: Date.now() + codeLifetimeMs, attempts: 0 });
      return json(response, 200, { message: 'If this address can continue, a code has been sent. Check your inbox.' });
    } catch (error) {
      return json(response, error.status || 502, { error: error.message || 'Could not send the email code.' });
    }
  }

  if (url.pathname === '/api/auth/verify-code') {
    const email = normalizeEmail(body.email);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!email || !/^\d{6}$/.test(code)) return json(response, 400, { error: 'Enter the 6-digit code from your email.' });
    const challenge = challenges.get(email);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      challenges.delete(email);
      return json(response, 400, { error: 'That code expired or is no longer active. Request a new code.' });
    }
    challenge.attempts += 1;
    if (challenge.attempts > maxCodeAttempts) {
      challenges.delete(email);
      return json(response, 429, { error: 'Too many incorrect codes. Request a fresh code.' });
    }
    if (!codeMatches(email, code, challenge.hash)) return json(response, 400, { error: 'That code does not match. Check it and try again.' });

    let user = store.users.find((candidate) => candidate.email === email);
    if (!user) {
      challenges.delete(email);
      const setupToken = randomBytes(32).toString('base64url');
      pendingAccountSetups.set(hashSession(setupToken), { email, expiresAt: Date.now() + codeLifetimeMs, attempts: 0 });
      return json(response, 200, { needsUsername: true, setupToken, message: 'Email verified. Choose a username for your pilot account.' });
    }
    challenges.delete(email);
    const token = randomBytes(32).toString('base64url');
    store.sessions = store.sessions.filter((session) => session.expiresAt > Date.now());
    store.sessions.push({ tokenHash: hashSession(token), userId: user.id, expiresAt: Date.now() + sessionLifetimeMs });
    try { await saveStore(); }
    catch { return json(response, 500, { error: 'Could not save your account session. Please try again.' }); }
    return json(response, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(request, token) });
  }

  if (url.pathname === '/api/auth/complete-signup') {
    const setupToken = typeof body.setupToken === 'string' ? body.setupToken : '';
    const setupKey = setupToken ? hashSession(setupToken) : '';
    const setup = pendingAccountSetups.get(setupKey);
    if (!setup || setup.expiresAt <= Date.now()) {
      pendingAccountSetups.delete(setupKey);
      return json(response, 400, { error: 'Your verified email step expired. Request a new code to continue.' });
    }
    setup.attempts += 1;
    if (setup.attempts > maxCodeAttempts) {
      pendingAccountSetups.delete(setupKey);
      return json(response, 429, { error: 'Too many username attempts. Request a new email code to try again.' });
    }

    const validationError = usernameError(body.username);
    if (validationError) return json(response, 400, { error: validationError });
    const username = body.username.trim();
    if (store.users.some((candidate) => candidate.email === setup.email)) {
      pendingAccountSetups.delete(setupKey);
      return json(response, 409, { error: 'An account was already created for this email. Sign in to continue.' });
    }
    const usernameTaken = store.users.some((candidate) => typeof candidate.username === 'string' && candidate.username.toLowerCase() === username.toLowerCase());
    if (usernameTaken) return json(response, 409, { error: 'That username is already taken. Choose another.' });

    const user = { id: randomUUID(), email: setup.email, username, createdAt: new Date().toISOString(), xp: 0, firstPlaces: 0 };
    const token = randomBytes(32).toString('base64url');
    store.users.push(user);
    store.sessions = store.sessions.filter((session) => session.expiresAt > Date.now());
    store.sessions.push({ tokenHash: hashSession(token), userId: user.id, expiresAt: Date.now() + sessionLifetimeMs });
    try { await saveStore(); }
    catch {
      store.users = store.users.filter((candidate) => candidate.id !== user.id);
      store.sessions = store.sessions.filter((session) => session.tokenHash !== hashSession(token));
      return json(response, 500, { error: 'Could not save your pilot account. Please try again.' });
    }
    pendingAccountSetups.delete(setupKey);
    return json(response, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(request, token) });
  }

  if (url.pathname === '/api/auth/logout') {
    const user = currentUser(request);
    if (user) {
      const lobby = lobbyForUser(user.id);
      if (lobby) removeLobbyMember(lobby, user.id);
      friendPresence.delete(user.id);
    }
    const token = cookieValue(request, 'aerframe_session');
    const tokenHash = token ? hashSession(token) : '';
    store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash);
    try { await saveStore(); } catch { /* The browser cookie is still cleared. */ }
    return json(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie(request, '', true) });
  }

  return json(response, 404, { error: 'Account endpoint not found.' });
}

const friendPresenceLifetimeMs = 45_000;
const friendMaxCount = 200;

function usersAreFriends(firstId, secondId) {
  return store.friendships.some((friendship) => friendship.userIds.includes(firstId) && friendship.userIds.includes(secondId));
}

function friendSnapshot(userId) {
  const now = Date.now();
  const friends = store.friendships
    .filter((friendship) => friendship.userIds.includes(userId))
    .map((friendship) => {
      const friendId = friendship.userIds.find((id) => id !== userId);
      const friend = store.users.find((candidate) => candidate.id === friendId);
      if (!friend) return null;
      const lastSeen = friendPresence.get(friendId) || 0;
      return { id: friend.id, username: displayUsername(friend.username), online: now - lastSeen < friendPresenceLifetimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  const incomingRequests = store.friendRequests
    .filter((request) => request.toUserId === userId)
    .map((request) => {
      const sender = store.users.find((candidate) => candidate.id === request.fromUserId);
      return sender ? { requestId: request.id, id: sender.id, username: displayUsername(sender.username) } : null;
    })
    .filter(Boolean);
  const outgoingRequests = store.friendRequests
    .filter((request) => request.fromUserId === userId)
    .map((request) => {
      const recipient = store.users.find((candidate) => candidate.id === request.toUserId);
      return recipient ? { requestId: request.id, id: recipient.id, username: displayUsername(recipient.username) } : null;
    })
    .filter(Boolean);
  return { friends, incomingRequests, outgoingRequests, onlineCount: friends.filter((friend) => friend.online).length };
}

async function handleFriends(request, response, url) {
  if (!verifySameOrigin(request)) return json(response, 403, { error: 'This friends request was rejected.' });
  const user = currentUser(request);
  if (!user) return json(response, 401, { error: 'Sign in to use friends.' });
  friendPresence.set(user.id, Date.now());

  if (request.method === 'GET' && url.pathname === '/api/friends') {
    return json(response, 200, friendSnapshot(user.id));
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });

  let body;
  try { body = await readJson(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }

  if (url.pathname === '/api/friends/request') {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json(response, 400, { error: 'Enter a username with 3 to 20 letters, numbers, or underscores.' });
    if (!allowRate(`friend-request:${user.id}`, 24, 10 * 60_000)) return json(response, 429, { error: 'Too many friend requests. Wait a little and try again.' });
    const target = store.users.find((candidate) => candidate.username?.toLowerCase() === username.toLowerCase());
    if (!target) return json(response, 404, { error: 'No pilot has that username.' });
    if (target.id === user.id) return json(response, 400, { error: 'You cannot add yourself.' });
    if (usersAreFriends(user.id, target.id)) return json(response, 409, { error: 'You are already friends.' });

    const incoming = store.friendRequests.find((item) => item.fromUserId === target.id && item.toUserId === user.id);
    const outgoing = store.friendRequests.find((item) => item.fromUserId === user.id && item.toUserId === target.id);
    if (incoming) {
      if (friendSnapshot(user.id).friends.length >= friendMaxCount || friendSnapshot(target.id).friends.length >= friendMaxCount) {
        return json(response, 409, { error: 'One of these friend lists is full.' });
      }
      const oldFriendships = store.friendships;
      const oldRequests = store.friendRequests;
      store.friendships = [...store.friendships, { userIds: [user.id, target.id], createdAt: Date.now() }];
      store.friendRequests = store.friendRequests.filter((item) => !(
        (item.fromUserId === user.id && item.toUserId === target.id)
        || (item.fromUserId === target.id && item.toUserId === user.id)
      ));
      try { await saveStore(); }
      catch {
        store.friendships = oldFriendships;
        store.friendRequests = oldRequests;
        return json(response, 500, { error: 'Could not save this friendship. Please try again.' });
      }
      return json(response, 200, { ...friendSnapshot(user.id), message: `You and ${displayUsername(target.username)} are now friends.` });
    }
    if (outgoing) return json(response, 409, { error: 'You already sent a request to this pilot.' });
    if (friendSnapshot(user.id).outgoingRequests.length >= 200) return json(response, 409, { error: 'You have too many pending requests.' });

    const friendRequest = { id: randomUUID(), fromUserId: user.id, toUserId: target.id, createdAt: Date.now() };
    store.friendRequests.push(friendRequest);
    try { await saveStore(); }
    catch {
      store.friendRequests = store.friendRequests.filter((item) => item.id !== friendRequest.id);
      return json(response, 500, { error: 'Could not save the friend request. Please try again.' });
    }
    return json(response, 200, { ...friendSnapshot(user.id), message: `Friend request sent to ${displayUsername(target.username)}.` });
  }

  if (url.pathname === '/api/friends/accept' || url.pathname === '/api/friends/decline' || url.pathname === '/api/friends/cancel') {
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const requestIndex = store.friendRequests.findIndex((item) => item.id === requestId
      && (url.pathname === '/api/friends/cancel' ? item.fromUserId === user.id : item.toUserId === user.id));
    if (requestIndex < 0) return json(response, 404, { error: 'That friend request is no longer available.' });
    const friendRequest = store.friendRequests[requestIndex];
    const oldFriendships = store.friendships;
    const oldRequests = store.friendRequests;
    store.friendRequests = store.friendRequests.filter((item) => item.id !== friendRequest.id);
    if (url.pathname === '/api/friends/accept') {
      if (friendSnapshot(user.id).friends.length >= friendMaxCount || friendSnapshot(friendRequest.fromUserId).friends.length >= friendMaxCount) {
        store.friendRequests = oldRequests;
        return json(response, 409, { error: 'One of these friend lists is full.' });
      }
      if (!usersAreFriends(user.id, friendRequest.fromUserId)) {
        store.friendships = [...store.friendships, { userIds: [user.id, friendRequest.fromUserId], createdAt: Date.now() }];
      }
      store.friendRequests = store.friendRequests.filter((item) => !(
        (item.fromUserId === user.id && item.toUserId === friendRequest.fromUserId)
        || (item.fromUserId === friendRequest.fromUserId && item.toUserId === user.id)
      ));
    }
    try { await saveStore(); }
    catch {
      store.friendships = oldFriendships;
      store.friendRequests = oldRequests;
      return json(response, 500, { error: 'Could not update this friend request. Please try again.' });
    }
    return json(response, 200, { ...friendSnapshot(user.id), message: url.pathname.endsWith('/accept') ? 'Friend added.' : 'Friend request dismissed.' });
  }

  if (url.pathname === '/api/friends/remove') {
    const friendId = typeof body.friendId === 'string' ? body.friendId : '';
    if (!usersAreFriends(user.id, friendId)) return json(response, 404, { error: 'That pilot is not on your friends list.' });
    const oldFriendships = store.friendships;
    store.friendships = store.friendships.filter((friendship) => !(friendship.userIds.includes(user.id) && friendship.userIds.includes(friendId)));
    try { await saveStore(); }
    catch {
      store.friendships = oldFriendships;
      return json(response, 500, { error: 'Could not remove this friend. Please try again.' });
    }
    return json(response, 200, { ...friendSnapshot(user.id), message: 'Friend removed.' });
  }

  return json(response, 404, { error: 'Friends endpoint not found.' });
}

const teamCapacity = 16;
const teamNamePattern = /^[A-Za-z0-9][A-Za-z0-9 _-]{2,23}$/;

function teamForUser(userId) {
  return store.teams.find((team) => team.members.some((member) => member.userId === userId)) || null;
}

function rankedTeams() {
  return store.teams
    .filter((team) => Array.isArray(team.members) && team.members.length > 0)
    .map((team) => ({
      id: team.id,
      name: team.name,
      xp: Math.max(0, Math.floor(Number(team.xp) || 0)),
      memberCount: team.members.length,
    }))
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function publicTeam(team) {
  if (!team) return null;
  const ranking = rankedTeams().find((entry) => entry.id === team.id);
  return {
    id: team.id,
    name: team.name,
    code: team.code,
    xp: Math.max(0, Math.floor(Number(team.xp) || 0)),
    rank: ranking?.rank || null,
    captainId: team.captainId,
    maxMembers: teamCapacity,
    members: team.members.map((member) => {
      const user = store.users.find((candidate) => candidate.id === member.userId);
      return {
        id: member.userId,
        username: displayUsername(user?.username),
        xp: Math.max(0, Math.floor(Number(user?.xp) || 0)),
        isCaptain: member.userId === team.captainId,
      };
    }),
  };
}

async function persistTeams(response, previousTeams) {
  try { await saveStore(); return true; }
  catch {
    store.teams = previousTeams;
    json(response, 500, { error: 'Could not save the team update. Please try again.' });
    return false;
  }
}

async function handleTeams(request, response, url) {
  if (!verifySameOrigin(request)) return json(response, 403, { error: 'This team request was rejected.' });
  if (request.method === 'GET' && url.pathname === '/api/teams') {
    const user = currentUser(request);
    return json(response, 200, {
      team: user ? publicTeam(teamForUser(user.id)) : null,
      leaders: rankedTeams().slice(0, 10),
    });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });

  const user = currentUser(request);
  if (!user) return json(response, 401, { error: 'Sign in to create or join a team.' });
  let body;
  try { body = await readJson(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }

  if (url.pathname === '/api/teams/create') {
    if (teamForUser(user.id)) return json(response, 409, { error: 'Leave your current team before creating another.' });
    const name = typeof body.name === 'string'
      ? body.name.replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ')
      : '';
    if (!teamNamePattern.test(name)) return json(response, 400, { error: 'Team names must be 3–24 characters using letters, numbers, spaces, _ or -.' });
    if (store.teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) {
      return json(response, 409, { error: 'That team name is already in use.' });
    }
    let code = createLobbyCode();
    while (store.teams.some((team) => team.code === code)) code = createLobbyCode();
    const team = {
      id: randomUUID(),
      name,
      code,
      captainId: user.id,
      xp: 0,
      createdAt: new Date().toISOString(),
      members: [{ userId: user.id, joinedAt: Date.now() }],
    };
    const previousTeams = store.teams;
    store.teams = [...store.teams, team];
    if (!await persistTeams(response, previousTeams)) return;
    return json(response, 200, { team: publicTeam(team), leaders: rankedTeams().slice(0, 10), message: `${name} is ready. Invite pilots with code ${code}.` });
  }

  if (url.pathname === '/api/teams/join') {
    if (teamForUser(user.id)) return json(response, 409, { error: 'Leave your current team before joining another.' });
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return json(response, 400, { error: 'Enter a valid 6-character team invite code.' });
    const team = store.teams.find((candidate) => candidate.code === code);
    if (!team) return json(response, 404, { error: 'No team uses that invite code.' });
    if (team.members.length >= teamCapacity) return json(response, 409, { error: 'That team is full.' });
    const previousMembers = team.members;
    team.members = [...team.members, { userId: user.id, joinedAt: Date.now() }];
    if (!await persistTeams(response, store.teams)) {
      team.members = previousMembers;
      return;
    }
    return json(response, 200, { team: publicTeam(team), leaders: rankedTeams().slice(0, 10), message: `Joined ${team.name}.` });
  }

  if (url.pathname === '/api/teams/leave') {
    const team = teamForUser(user.id);
    if (!team) return json(response, 404, { error: 'You are not in a team.' });
    const previousTeams = store.teams.map((candidate) => ({ ...candidate, members: [...candidate.members] }));
    team.members = team.members.filter((member) => member.userId !== user.id);
    if (!team.members.length) {
      store.teams = store.teams.filter((candidate) => candidate.id !== team.id);
    } else if (team.captainId === user.id) {
      team.captainId = team.members[0].userId;
    }
    if (!await persistTeams(response, previousTeams)) return;
    return json(response, 200, {
      team: null,
      leaders: rankedTeams().slice(0, 10),
      message: team.members.length ? `You left ${team.name}. The captain role passed to another pilot.` : `You left ${team.name}; the empty team was closed.`,
    });
  }

  return json(response, 404, { error: 'Team endpoint not found.' });
}

const communityTrackBiomes = new Set(['neon-docks', 'neon-city', 'pine-basin', 'cinder-quarry']);
const communityTrackPropTypes = new Set(['podium', 'relay-podium-gate', 'house', 'warehouse', 'tower', 'container', 'barrier']);
const redRacePodiumTopOffset = 3.1325;
const redRacePodiumHeadingOffset = Math.PI / 2;
function publicCommunityTrack(track) {
  return {
    id: track.id,
    name: track.name,
    gameMode: communityTrackGameModes.has(track.gameMode) ? track.gameMode : '4v4',
    biomeId: track.biomeId,
    environmentId: track.biomeId,
    points: track.points,
    startFinishIndex: Number.isSafeInteger(track.startFinishIndex) && track.startFinishIndex >= 0 && track.startFinishIndex < track.points.length ? track.startFinishIndex : 0,
    gateRotations: Array.isArray(track.gateRotations) ? track.gateRotations : [],
    laps: Number.isSafeInteger(track.laps) && track.laps >= 1 && track.laps <= 5 ? track.laps : 1,
    objects: Array.isArray(track.objects) ? track.objects : [],
    imageDataUrl: track.imageDataUrl,
    ownerName: track.ownerName,
    createdAt: track.createdAt,
  };
}

async function handleCommunityTracks(request, response) {
  if (!verifySameOrigin(request)) return json(response, 403, { error: 'This community track request was rejected.' });
  if (request.method === 'GET') {
    return json(response, 200, { tracks: store.communityTracks.slice(-100).reverse().map(publicCommunityTrack) });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });

  const user = currentUser(request);
  let body;
  try { body = await readJson(request, 1_000_000); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(response, 400, { error: 'Track details are missing.' });

  const name = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ') : '';
  if (Array.from(name).length < 2 || Array.from(name).length > 32) return json(response, 400, { error: 'Track names must be 2–32 characters.' });
  if (!communityTrackBiomes.has(body.biomeId)) return json(response, 400, { error: 'Choose a valid track environment.' });
  const gameMode = body.gameMode === undefined ? '4v4' : body.gameMode;
  if (!communityTrackGameModes.has(gameMode)) return json(response, 400, { error: 'Choose a valid track game mode.' });
  if (!Array.isArray(body.points) || body.points.length < 2 || body.points.length > 80) return json(response, 400, { error: 'A published track needs 2–80 gates.' });
  const laps = Number.isSafeInteger(body.laps) && body.laps >= 1 && body.laps <= 5 ? body.laps : 1;
  const points = [];
  for (const point of body.points) {
    if (!Array.isArray(point) || point.length !== 3 || point.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      return json(response, 400, { error: 'Track gates contain invalid positions.' });
    }
    const [x, y, z] = point;
    if (Math.abs(x) > 330 || y < -15 || y > 60 || Math.abs(z) > 330) return json(response, 400, { error: 'A track gate is outside the builder bounds.' });
    points.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100]);
  }
  const startFinishIndex = Number.isSafeInteger(body.startFinishIndex) && body.startFinishIndex >= 0 && body.startFinishIndex < points.length
    ? body.startFinishIndex
    : 0;
  const submittedRotations = body.gateRotations;
  if (submittedRotations !== undefined && (!Array.isArray(submittedRotations) || submittedRotations.length !== points.length
    || submittedRotations.some((rotation) => typeof rotation !== 'number' || !Number.isFinite(rotation) || Math.abs(rotation) > 360))) {
    return json(response, 400, { error: 'Track gate directions are invalid.' });
  }
  const gateRotations = Array.isArray(submittedRotations)
    ? submittedRotations.map((rotation) => Math.round((((rotation % 360) + 360) % 360) * 100) / 100)
    : [];

  const requestedObjects = body.objects ?? [];
  if (!Array.isArray(requestedObjects) || requestedObjects.length > 100) return json(response, 400, { error: 'A track can include up to 100 environment objects.' });
  const objects = [];
  for (const object of requestedObjects) {
    if (!object || typeof object !== 'object' || Array.isArray(object) || !communityTrackPropTypes.has(object.type)) {
      return json(response, 400, { error: 'A track includes an unsupported environment object.' });
    }
    const { x, y, z } = object;
    if (![x, y, z].every((value) => typeof value === 'number' && Number.isFinite(value))
      || Math.abs(x) > 330 || y < -15 || y > 60 || Math.abs(z) > 330) {
      return json(response, 400, { error: 'An environment object is outside the builder bounds.' });
    }
    const rotation = typeof object.rotation === 'number' && Number.isFinite(object.rotation) ? object.rotation : 0;
    const rotationX = object.rotationX === undefined ? 0 : object.rotationX;
    const rotationY = object.rotationY === undefined ? rotation : object.rotationY;
    const rotationZ = object.rotationZ === undefined ? 0 : object.rotationZ;
    if (![rotationX, rotationY, rotationZ].every((value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 360)) {
      return json(response, 400, { error: 'An environment object has an invalid rotation.' });
    }
    const scale = typeof object.scale === 'number' && Number.isFinite(object.scale) ? object.scale : 1;
    const scaleX = object.scaleX === undefined ? scale : object.scaleX;
    const scaleY = object.scaleY === undefined ? scale : object.scaleY;
    const scaleZ = object.scaleZ === undefined ? scale : object.scaleZ;
    if (![scaleX, scaleY, scaleZ].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 2)) {
      return json(response, 400, { error: 'An environment object has an invalid size.' });
    }
    objects.push({
      type: object.type,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.round(z * 100) / 100,
      rotation: ((Math.round(rotation) % 360) + 360) % 360,
      rotationX: ((Math.round(rotationX) % 360) + 360) % 360,
      rotationY: ((Math.round(rotationY) % 360) + 360) % 360,
      rotationZ: ((Math.round(rotationZ) % 360) + 360) % 360,
      scale: Math.round(scale * 100) / 100,
      scaleX: Math.round(scaleX * 100) / 100,
      scaleY: Math.round(scaleY * 100) / 100,
      scaleZ: Math.round(scaleZ * 100) / 100,
      isLaunchPodium: object.type === 'podium' && object.isLaunchPodium === true,
    });
  }
  const podiumCount = objects.filter((object) => object.type === 'podium').length;
  const relayPodiumGateCount = objects.filter((object) => object.type === 'relay-podium-gate').length;
  if (gameMode === 'relay-race') {
    if (relayPodiumGateCount !== relayStationCount || podiumCount > 0) {
      return json(response, 400, { error: 'A Relay track needs exactly four Relay podium gates and no separate podiums.' });
    }
    if (!relayStationPodiums({ points, startFinishIndex, objects }) || points.length !== relayStationCount) {
      return json(response, 400, { error: 'A Relay track needs exactly four route gates, each paired with a different Relay podium gate within 8 m.' });
    }
  } else if (podiumCount < 8) {
    return json(response, 400, { error: `A viable track needs 8 red race podiums (${podiumCount}/8 provided).` });
  }

  const imageMatch = typeof body.imageDataUrl === 'string' ? body.imageDataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/) : null;
  if (!imageMatch || imageMatch[1].length > 426_700) return json(response, 400, { error: 'Take a new track picture under 320 KB before publishing.' });
  const imageBytes = Buffer.from(imageMatch[1], 'base64');
  if (!imageBytes.length || imageBytes.length > 320_000 || imageBytes.toString('base64') !== imageMatch[1] || imageBytes[0] !== 0xff || imageBytes[1] !== 0xd8 || imageBytes[2] !== 0xff) {
    return json(response, 400, { error: 'The track picture must be a valid JPEG under 320 KB.' });
  }
  const savedImageBytes = store.communityTracks.reduce((total, track) => total + Math.floor(String(track.imageDataUrl || '').length * 0.75), 0);
  if (store.communityTracks.length >= 200 || savedImageBytes + imageBytes.length > 24_000_000) return json(response, 409, { error: 'The community track library is full.' });
  const publisherKey = user?.id || request.socket.remoteAddress || 'guest';
  if (!allowRate(`community-track:${publisherKey}`, user ? 10 : 3, 60 * 60_000)) return json(response, 429, { error: 'You have published several tracks recently. Try again later.' });

  const track = {
    id: `community-${randomUUID()}`,
    name,
    gameMode,
    biomeId: body.biomeId,
    points,
    startFinishIndex,
    gateRotations,
    laps,
    objects,
    imageDataUrl: body.imageDataUrl,
    ownerName: user ? displayUsername(user.username) : 'Guest Pilot',
    createdAt: new Date().toISOString(),
  };
  const previousTracks = store.communityTracks;
  store.communityTracks = [...previousTracks, track];
  try { await saveStore(); }
  catch {
    store.communityTracks = previousTracks;
    return json(response, 500, { error: 'Could not save this community track. Please try again.' });
  }
  return json(response, 201, { track: publicCommunityTrack(track) });
}

const lobbyBiomes = new Set(['neon-docks', 'neon-city', 'pine-basin', 'cinder-quarry']);
const minimumCrewRaceDurationMs = 2500;
const minimumCheckpointIntervalMs = 180;
const minimumFirstCheckpointDelayMs = 350;
const maximumCheckpointSegmentLength = 20;
const maximumRaceSpeed = 90;
const lobbyServerRegions = new Set(['auto', 'north-america', 'europe', 'asia-pacific']);
const lobbyGameModes = new Set(['competitive-4v4', '4v4', 'relay-race', 'prop-hunt']);
const lobbyCodeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const lobbyHeartbeatMs = 35_000;
const lobbyLifetimeMs = 3 * 60 * 60_000;
const relayStationCount = 4;
const relayGatePodiumDistance = 8;

function raceTrackRecord(lobby) {
  return lobby.trackSource === 'community'
    ? store.communityTracks.find((track) => track.id === lobby.trackId && track.biomeId === lobby.biome) || null
    : standardRaceTracks[lobby.biome]?.find((track) => track.id === lobby.trackId) || null;
}

function relayStationPodiums(track) {
  if (!track || !Array.isArray(track.points) || track.points.length !== relayStationCount
    || !Array.isArray(track.objects)) return null;
  const startIndex = Number.isSafeInteger(track.startFinishIndex) && track.startFinishIndex >= 0 && track.startFinishIndex < track.points.length
    ? track.startFinishIndex
    : 0;
  const routePoints = [track.points[startIndex], ...track.points.filter((_, index) => index !== startIndex)];
  const availablePodiums = track.objects.filter((object) => object.type === 'relay-podium-gate').slice();
  if (availablePodiums.length !== relayStationCount || track.objects.some((object) => object.type === 'podium')) return null;
  const stations = [];
  for (const point of routePoints) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    availablePodiums.forEach((podium, index) => {
      const distance = Math.hypot(point[0] - podium.x, point[2] - podium.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex < 0 || nearestDistance > relayGatePodiumDistance) return null;
    stations.push(availablePodiums.splice(nearestIndex, 1)[0]);
  }
  return stations;
}

function lobbyHasCompatibleTrack(lobby) {
  const track = raceTrackRecord(lobby);
  if (!track || !lobbyGameModes.has(lobby.gameMode || '4v4')) return false;
  const trackMode = communityTrackGameModes.has(track.gameMode) ? track.gameMode : '4v4';
  const lobbyMode = lobby.gameMode === 'competitive-4v4' ? '4v4' : (lobby.gameMode || '4v4');
  return trackMode === lobbyMode && (lobbyMode !== 'relay-race' || Boolean(relayStationPodiums(track)));
}

function lobbyTrackModeError(gameMode) {
  const labels = { 'competitive-4v4': 'Tournament', '4v4': '4v4', 'relay-race': 'Relay', 'prop-hunt': 'Prop Hunt' };
  const label = labels[gameMode] || 'selected game mode';
  return 'That track is not saved for ' + label + '. Choose a ' + label + ' track in Track Builder.';
}

function raceTrackPoints(lobby) {
  return raceTrackRecord(lobby)?.points || null;
}

function raceTrackSequenceIndices(lobby) {
  const points = raceTrackPoints(lobby);
  if (!points?.length) return [];
  const track = raceTrackRecord(lobby);
  const startIndex = Number.isSafeInteger(track?.startFinishIndex) && track.startFinishIndex >= 0 && track.startFinishIndex < points.length
    ? track.startFinishIndex
    : 0;
  const checkpoints = points.map((_, index) => index).filter((index) => index !== startIndex);
  const laps = Number.isSafeInteger(track?.laps) && track.laps >= 1 && track.laps <= 5 ? track.laps : 1;
  return [startIndex, ...Array.from({ length: laps }, () => [...checkpoints, startIndex]).flat()];
}

function raceGateCount(lobby) {
  return raceTrackSequenceIndices(lobby).length;
}

function beginLobbyRace(lobby, now = Date.now()) {
  if (lobby.status !== 'open'
    || lobby.members.length < (lobby.maxPlayers || 8)
    || !lobby.members.every((member) => member.readyAt)
    || !lobbyHasCompatibleTrack(lobby)
    || raceGateCount(lobby) < 2) return false;
  lobby.status = 'starting';
  lobby.startAt = now + 10_000;
  lobby.raceAt = lobby.startAt + 5000;
  lobby.results = [];
  const relayTeamMemberIds = lobby.gameMode === 'relay-race'
    ? Array.from({ length: 2 }, (_, teamIndex) => {
      const memberIds = lobby.members.slice(teamIndex * 4, teamIndex * 4 + 4).map((member) => member.userId);
      for (let index = memberIds.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(0, index + 1);
        [memberIds[index], memberIds[swapIndex]] = [memberIds[swapIndex], memberIds[index]];
      }
      return memberIds;
    })
    : [];
  lobby.relayTeams = lobby.gameMode === 'relay-race'
    ? Array.from({ length: 2 }, (_, teamIndex) => ({
      teamIndex,
      memberIds: relayTeamMemberIds[teamIndex],
      currentStation: 0,
      nextGateIndex: 1,
      currentLap: 1,
      lapCount: Number(raceTrackRecord(lobby)?.laps) || 1,
      segmentStartedAt: null,
      lapStartedAt: null,
      lapTimes: [],
      splits: [],
      finishedAt: null,
    }))
    : null;
  lobby.members.forEach((member) => {
    member.finishedAt = null;
    member.didNotFinish = false;
    member.nextGateIndex = 0;
    member.lastCheckpointAt = null;
    member.lastCheckpointPosition = null;
    member.raceStartedAt = null;
    member.relayTeam = lobby.gameMode === 'relay-race' ? Math.floor(lobby.members.indexOf(member) / 4) : null;
    member.relayStation = lobby.gameMode === 'relay-race'
      ? relayTeamMemberIds[member.relayTeam].indexOf(member.userId)
      : null;
  });
  lobby.updatedAt = now;
  return true;
}

function raceGateFrame(lobby, gateIndex) {
  const points = raceTrackPoints(lobby);
  if (!points || gateIndex < 0 || gateIndex >= raceGateCount(lobby)) return null;
  const sequence = raceTrackSequenceIndices(lobby);
  const pointIndex = sequence[gateIndex];
  const track = raceTrackRecord(lobby);
  const spread = lobby.trackSource === 'community' ? 1 : 1.7;
  const scaledPoint = ([x, y, z]) => [x * spread, y, z * spread];
  const center = scaledPoint(points[pointIndex]);
  const startIndex = sequence[0];
  const routeIndices = [startIndex, ...points.map((_, index) => index).filter((index) => index !== startIndex)];
  const routeIndex = routeIndices.indexOf(pointIndex);
  const submittedRotation = track?.gateRotations?.[pointIndex];
  let yaw;
  if (lobby.trackSource === 'community' && Number.isFinite(submittedRotation)) {
    yaw = submittedRotation * Math.PI / 180;
  } else if (pointIndex === startIndex) {
    const next = scaledPoint(points[routeIndices[1]] || points[startIndex]);
    yaw = Math.atan2(center[0] - next[0], center[2] - next[2]);
  } else {
    const previousIndex = routeIndices[Math.max(0, routeIndex - 1)];
    const previous = scaledPoint(points[previousIndex]);
    yaw = Math.atan2(previous[0] - center[0], previous[2] - center[2]);
  }
  return {
    center,
    normal: [Math.sin(yaw), 0, Math.cos(yaw)],
    right: [Math.cos(yaw), 0, -Math.sin(yaw)],
  };
}

function raceLaunchAnchor(lobby, gridSlot = 0) {
  const track = raceTrackRecord(lobby);
  const podiums = lobby.trackSource === 'community'
    ? (lobby.gameMode === 'relay-race'
      ? relayStationPodiums(track) || []
      : (track?.objects || []).filter((object) => object.type === 'podium')
      .sort((a, b) => Number(b.isLaunchPodium) - Number(a.isLaunchPodium))
    )
    : [];
  const stationIndex = lobby.gameMode === 'relay-race' ? gridSlot % relayStationCount : gridSlot;
  const launchPodium = podiums[stationIndex];
  if (launchPodium) {
    const scale = Number.isFinite(launchPodium.scale) ? launchPodium.scale : 1;
    return [launchPodium.x, launchPodium.y + redRacePodiumTopOffset * scale + 0.68, launchPodium.z];
  }
  let center;
  let yaw;
  let scale = 0.85;
  if (podiums.length) {
    const base = podiums[0];
    scale = 0.85;
    center = [base.x, base.y, base.z];
    yaw = Number(base.rotation || 0) * Math.PI / 180 + redRacePodiumHeadingOffset;
  } else {
    const frame = raceGateFrame(lobby, 0);
    if (!frame) return null;
    center = [
      frame.center[0] + frame.normal[0] * 12,
      frame.center[1],
      frame.center[2] + frame.normal[2] * 12,
    ];
    yaw = Math.atan2(frame.normal[0], frame.normal[2]);
  }
  const extraSlot = podiums.length
    ? Math.max(0, gridSlot - podiums.length + 1)
    : Math.max(0, gridSlot);
  const offset = extraSlot * 5.5;
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  return [
    center[0] + rightX * offset,
    center[1] + redRacePodiumTopOffset * scale + 0.68,
    center[2] + rightZ * offset,
  ];
}

function validPosition(value) {
  return Array.isArray(value) && value.length === 3
    && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate) && Math.abs(coordinate) <= 1200);
}

function verifyRaceCheckpoint(lobby, gateIndex, crossing, member, now) {
  const frame = raceGateFrame(lobby, gateIndex);
  if (!frame || !validPosition(crossing?.previous) || !validPosition(crossing?.current)) return null;
  const previous = crossing.previous;
  const current = crossing.current;
  const segment = current.map((coordinate, axis) => coordinate - previous[axis]);
  if (Math.hypot(...segment) > maximumCheckpointSegmentLength) return null;
  const previousDistance = previous.reduce((sum, coordinate, axis) => sum + (coordinate - frame.center[axis]) * frame.normal[axis], 0);
  const currentDistance = current.reduce((sum, coordinate, axis) => sum + (coordinate - frame.center[axis]) * frame.normal[axis], 0);
  const repeatedStartFinish = gateIndex > 0
    && raceTrackSequenceIndices(lobby)[gateIndex] === raceTrackSequenceIndices(lobby)[0];
  const correctDirection = repeatedStartFinish
    ? previousDistance < 0 && currentDistance >= 0
    : previousDistance > 0 && currentDistance <= 0;
  if (!correctDirection) return null;
  const amount = previousDistance / (previousDistance - currentDistance);
  const intersection = previous.map((coordinate, axis) => coordinate + segment[axis] * amount);
  const lateral = intersection.reduce((sum, coordinate, axis) => sum + (coordinate - frame.center[axis]) * frame.right[axis], 0);
  const vertical = intersection[1] - frame.center[1];
  if (lateral * lateral + vertical * vertical > 2.05 * 2.05) return null;

  if (gateIndex > 0 && validPosition(member.lastCheckpointPosition)) {
    const distance = Math.hypot(...intersection.map((coordinate, axis) => coordinate - member.lastCheckpointPosition[axis]));
    const elapsed = Math.max(0, now - Number(member.lastCheckpointAt || now)) / 1000;
    if (distance > maximumRaceSpeed * elapsed + 4) return null;
  }
  return intersection;
}

function cleanLobbies() {
  const now = Date.now();
  store.lobbies = store.lobbies.filter((lobby) => now - lobby.updatedAt < lobbyLifetimeMs);
  for (const lobby of store.lobbies) {
    lobby.members = lobby.members.filter((member) => now - member.lastSeenAt < lobbyHeartbeatMs);
    if (!lobby.members.length) continue;
    if (lobby.gameMode === 'relay-race') lobby.maxPlayers = 8;
    if (lobby.startAt && !Number.isFinite(lobby.raceAt)) lobby.raceAt = lobby.startAt + 5000;
    if (!lobby.members.some((member) => member.userId === lobby.hostId)) lobby.hostId = lobby.members[0].userId;
    if (['starting', 'grid'].includes(lobby.status) && lobby.members.length < (lobby.maxPlayers || 8)) {
      lobby.status = 'open';
      lobby.startAt = null;
      lobby.raceAt = null;
    }
    if (lobby.status === 'starting' && now >= lobby.startAt) lobby.status = 'grid';
    if (lobby.status === 'grid' && now >= lobby.raceAt) lobby.status = 'racing';
    const raceAt = Number(lobby.raceAt || lobby.startAt || 0);
    if (lobby.status === 'racing' && now - raceAt > 25 * 60_000) {
      lobby.status = 'open';
      lobby.startAt = null;
      lobby.raceAt = null;
    }
    settleLobbyRace(lobby);
  }
  store.lobbies = store.lobbies.filter((lobby) => lobby.members.length > 0);
}

function lobbyForUser(userId) {
  return store.lobbies.find((lobby) => lobby.members.some((member) => member.userId === userId)) || null;
}

function settleLobbyRace(lobby) {
  if (!['starting', 'grid', 'racing'].includes(lobby.status) || !lobby.members.length || !lobby.members.every((member) => member.finishedAt)) return;
  lobby.results = lobby.gameMode === 'relay-race'
    ? (lobby.relayTeams || []).map((team) => ({
      userId: team.memberIds[0],
      username: `Team ${team.teamIndex === 0 ? 'Cyan' : 'Coral'}`,
      timeMs: team.lapTimes.reduce((total, lapTime) => total + lapTime, 0),
      didNotFinish: !team.finishedAt || team.memberIds.some((memberId) => lobby.members.find((member) => member.userId === memberId)?.didNotFinish),
    }))
    : lobby.members
      .map((member) => {
        const user = store.users.find((candidate) => candidate.id === member.userId);
        return {
          userId: member.userId,
          username: displayUsername(user?.username),
          timeMs: Math.max(0, member.finishedAt - Number(member.raceStartedAt || lobby.startAt)),
          didNotFinish: Boolean(member.didNotFinish),
        };
      });
  lobby.results.sort((a, b) => Number(a.didNotFinish) - Number(b.didNotFinish) || a.timeMs - b.timeMs);
  const winner = lobby.results.find((result) => !result.didNotFinish);
  if (winner) {
    const winnerIds = lobby.gameMode === 'relay-race'
      ? lobby.relayTeams?.find((team) => team.memberIds.includes(winner.userId))?.memberIds || []
      : [winner.userId];
    winnerIds.forEach((userId) => {
      const user = store.users.find((candidate) => candidate.id === userId);
      if (user) user.firstPlaces = Math.max(0, Math.floor(Number(user.firstPlaces) || 0)) + 1;
    });
  }
  lobby.results = lobby.results.map(({ userId, ...result }) => result);
  lobby.status = 'open';
  lobby.startAt = null;
  lobby.raceAt = null;
}

function removeLobbyMember(lobby, userId) {
  const leavingMember = lobby.members.find((member) => member.userId === userId);
  if (leavingMember && ['starting', 'grid', 'racing'].includes(lobby.status)) {
    const relayTeam = lobby.gameMode === 'relay-race' ? lobby.relayTeams?.[leavingMember.relayTeam] : null;
    const finishedAt = Date.now();
    if (relayTeam) {
      if (!relayTeam.finishedAt) {
        relayTeam.finishedAt = finishedAt;
        relayTeam.memberIds.forEach((memberId) => {
          const teammate = lobby.members.find((member) => member.userId === memberId);
          if (teammate) {
            teammate.finishedAt ||= finishedAt;
            teammate.didNotFinish = true;
          }
        });
      }
    } else {
      leavingMember.finishedAt ||= finishedAt;
      leavingMember.didNotFinish = true;
    }
  }
  lobby.members = lobby.members.filter((member) => member.userId !== userId);
  lobby.updatedAt = Date.now();
  if (lobby.hostId === userId && lobby.members.length) lobby.hostId = lobby.members[0].userId;
  settleLobbyRace(lobby);
  if (!lobby.members.length) store.lobbies = store.lobbies.filter((candidate) => candidate.id !== lobby.id);
}

function createLobbyCode() {
  return Array.from({ length: 6 }, () => lobbyCodeChars[randomInt(0, lobbyCodeChars.length)]).join('');
}

function safeLobbyConfig(body = {}, fallback = {}) {
  const biome = lobbyBiomes.has(body.biome) ? body.biome : lobbyBiomes.has(fallback.biome) ? fallback.biome : 'neon-docks';
  const trackId = typeof body.trackId === 'string' && /^[a-z0-9-]{1,64}$/.test(body.trackId) ? body.trackId : fallback.trackId || '';
  const serverRegion = lobbyServerRegions.has(body.serverRegion) ? body.serverRegion : fallback.serverRegion || 'auto';
  const gameMode = lobbyGameModes.has(body.gameMode) ? body.gameMode : fallback.gameMode || '4v4';
  const trackSource = body.trackSource === 'community' || body.trackSource === 'game' ? body.trackSource : fallback.trackSource || 'game';
  const requestedCapacity = Number(body.maxPlayers);
  const maxPlayers = gameMode === 'relay-race'
    ? 8
    : Number.isInteger(requestedCapacity) && requestedCapacity >= 1 && requestedCapacity <= 8 ? requestedCapacity : fallback.maxPlayers || 8;
  const requestedName = typeof body.serverName === 'string' ? body.serverName.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 32) : '';
  const serverName = requestedName || fallback.serverName || 'Open Flight Server';
  return { biome, trackId, serverRegion, gameMode, trackSource, maxPlayers, serverName };
}

function publicLobby(lobby) {
  const now = Date.now();
  const relayTeams = Array.isArray(lobby.relayTeams) ? lobby.relayTeams.map((team) => ({
    teamIndex: team.teamIndex,
    currentStation: team.currentStation,
    currentPilotId: team.memberIds[team.currentStation] || null,
    nextGateIndex: team.nextGateIndex,
    currentLap: team.currentLap,
    lapCount: team.lapCount,
    segmentStartedAt: team.segmentStartedAt || null,
    lapStartedAt: team.lapStartedAt || null,
    lapTimes: team.lapTimes || [],
    splits: (team.splits || []).map((split) => ({
      ...split,
      username: displayUsername(store.users.find((user) => user.id === split.userId)?.username),
    })),
    finishedAt: team.finishedAt || null,
  })) : null;
  return {
    code: lobby.code,
    serverName: lobby.serverName || 'Open Flight Server',
    isPublic: lobby.isPublic,
    hostId: lobby.hostId,
    biome: lobby.biome,
    trackId: lobby.trackId,
    gameMode: lobby.gameMode || '4v4',
    trackSource: lobby.trackSource || 'game',
    maxPlayers: lobby.maxPlayers || 8,
    serverRegion: lobby.serverRegion || 'auto',
    status: lobby.status,
    startAt: lobby.startAt,
    raceAt: lobby.raceAt || null,
    relayTeams,
    members: lobby.members.map((member) => {
      const user = store.users.find((candidate) => candidate.id === member.userId);
      const relayTeam = Number.isSafeInteger(member.relayTeam) ? lobby.relayTeams?.[member.relayTeam] : null;
      return {
        id: member.userId,
        username: displayUsername(user?.username),
        xp: Math.max(0, Math.floor(Number(user?.xp) || 0)),
        isHost: member.userId === lobby.hostId,
        online: now - member.lastSeenAt < lobbyHeartbeatMs,
        ready: Boolean(member.readyAt),
        nextGateIndex: Number.isSafeInteger(member.nextGateIndex) ? member.nextGateIndex : 0,
        lastCheckpointAt: member.lastCheckpointAt || null,
        finishedAt: member.finishedAt || null,
        didNotFinish: Boolean(member.didNotFinish),
        relayTeam: Number.isSafeInteger(member.relayTeam) ? member.relayTeam : null,
        relayStation: Number.isSafeInteger(member.relayStation) ? member.relayStation : null,
        relayActive: Boolean(relayTeam && !relayTeam.finishedAt && relayTeam.memberIds[relayTeam.currentStation] === member.userId),
      };
    }),
    results: lobby.results || [],
  };
}

function makeLobby(user, isPublic, body) {
  const now = Date.now();
  const fallbackName = `${displayUsername(user.username)}'s Server`;
  const { biome, trackId, serverRegion, gameMode, trackSource, maxPlayers, serverName } = safeLobbyConfig(body, { serverName: fallbackName });
  let code = createLobbyCode();
  while (store.lobbies.some((lobby) => lobby.code === code)) code = createLobbyCode();
  return {
    id: randomUUID(), code, isPublic, hostId: user.id, biome, trackId, trackSource, serverRegion, gameMode, serverName, maxPlayers,
    status: 'open', startAt: null, raceAt: null, updatedAt: now, results: [],
    members: [{ userId: user.id, joinedAt: now, lastSeenAt: now, readyAt: null, finishedAt: null, didNotFinish: false, nextGateIndex: 0, lastCheckpointAt: null, lastCheckpointPosition: null, raceStartedAt: null }],
  };
}

async function persistLobby(response) {
  try { await saveStore(); return true; }
  catch { json(response, 500, { error: 'Could not save the flight party. Please try again.' }); return false; }
}

async function handleLobby(request, response, url) {
  if (!verifySameOrigin(request)) return json(response, 403, { error: 'This party request was rejected.' });
  cleanLobbies();
  if (request.method === 'GET' && url.pathname === '/api/lobby/browse') {
    const requestedRegion = url.searchParams.get('region') || 'auto';
    const region = lobbyServerRegions.has(requestedRegion) ? requestedRegion : 'auto';
    const servers = store.lobbies
      .filter((lobby) => lobby.isPublic && ['open', 'starting', 'racing'].includes(lobby.status))
      .filter(lobbyHasCompatibleTrack)
      .filter((lobby) => region === 'auto' || lobby.serverRegion === 'auto' || lobby.serverRegion === region)
      .sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || (a.members.length / (a.maxPlayers || 8)) - (b.members.length / (b.maxPlayers || 8)))
      .slice(0, 48)
      .map(publicLobby);
    return json(response, 200, { region, servers });
  }
  const user = currentUser(request);
  if (!user) return json(response, 401, { error: 'Sign in to join a flight party.' });

  if (request.method === 'GET' && url.pathname === '/api/lobby/current') {
    const lobby = lobbyForUser(user.id);
    if (lobby) {
      const member = lobby.members.find((candidate) => candidate.userId === user.id);
      member.lastSeenAt = Date.now();
      lobby.updatedAt = Date.now();
    }
    return json(response, 200, { lobby: lobby ? publicLobby(lobby) : null, user: publicUser(user) });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });

  let body;
  try { body = await readJson(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }

  if (url.pathname === '/api/lobby/create') {
    if (body.gameMode === 'competitive-4v4' && !nextTournament()) {
      return json(response, 409, { error: 'Tournament mode is locked until a future tournament is scheduled.' });
    }
    const config = safeLobbyConfig(body);
    if (!lobbyHasCompatibleTrack(config)) return json(response, 409, { error: lobbyTrackModeError(config.gameMode) });
    const previous = lobbyForUser(user.id);
    if (previous) removeLobbyMember(previous, user.id);
    const lobby = makeLobby(user, body.isPublic === true, body);
    store.lobbies.push(lobby);
    if (!await persistLobby(response)) return;
    return json(response, 200, { lobby: publicLobby(lobby) });
  }

  if (url.pathname === '/api/lobby/join') {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return json(response, 400, { error: 'Enter the 6-character party code.' });
    const lobby = store.lobbies.find((candidate) => candidate.code === code);
    if (!lobby) return json(response, 404, { error: 'No open party uses that code.' });
    if (lobby.status !== 'open') return json(response, 409, { error: 'That race has already started. Ask the host for a new party.' });
    if (!lobbyHasCompatibleTrack(lobby)) return json(response, 409, { error: lobbyTrackModeError(lobby.gameMode || '4v4') });
    const alreadyJoined = lobby.members.some((member) => member.userId === user.id);
    if (!alreadyJoined && lobby.members.length >= (lobby.maxPlayers || 8)) return json(response, 409, { error: 'That server is full.' });
    const previous = lobbyForUser(user.id);
    if (previous && previous.id !== lobby.id) removeLobbyMember(previous, user.id);
    if (!alreadyJoined) lobby.members.push({ userId: user.id, joinedAt: Date.now(), lastSeenAt: Date.now(), readyAt: null, finishedAt: null, didNotFinish: false, nextGateIndex: 0, lastCheckpointAt: null, lastCheckpointPosition: null, raceStartedAt: null });
    lobby.updatedAt = Date.now();
    if (!await persistLobby(response)) return;
    return json(response, 200, { lobby: publicLobby(lobby) });
  }

  if (url.pathname === '/api/lobby/matchmake') {
    if (body.gameMode === 'competitive-4v4' && !nextTournament()) {
      return json(response, 409, { error: 'Tournament mode is locked until a future tournament is scheduled.' });
    }
    const config = safeLobbyConfig(body);
    if (!lobbyHasCompatibleTrack(config)) return json(response, 409, { error: lobbyTrackModeError(config.gameMode) });
    let lobby = lobbyForUser(user.id);
    const { serverRegion, gameMode } = config;
    const currentLobbyMatches = lobby?.isPublic && lobby.status === 'open'
      && lobbyHasCompatibleTrack(lobby)
      && (lobby.gameMode || '4v4') === gameMode
      && (serverRegion === 'auto' || (lobby.serverRegion || 'auto') === 'auto' || lobby.serverRegion === serverRegion);
    if (currentLobbyMatches) {
      const now = Date.now();
      lobby.members.find((member) => member.userId === user.id).lastSeenAt = now;
      lobby.updatedAt = now;
      if (!await persistLobby(response)) return;
      return json(response, 200, { lobby: publicLobby(lobby) });
    }
    if (lobby) removeLobbyMember(lobby, user.id);
    lobby = store.lobbies.find((candidate) => candidate.isPublic
      && candidate.status === 'open'
      && candidate.members.length < (candidate.maxPlayers || 8)
      && lobbyHasCompatibleTrack(candidate)
      && (candidate.gameMode || '4v4') === gameMode
      && (serverRegion === 'auto' || (candidate.serverRegion || 'auto') === 'auto' || candidate.serverRegion === serverRegion)) || null;
    if (!lobby) {
      lobby = makeLobby(user, true, body);
      store.lobbies.push(lobby);
    } else {
      lobby.members.push({ userId: user.id, joinedAt: Date.now(), lastSeenAt: Date.now(), readyAt: null, finishedAt: null, didNotFinish: false, nextGateIndex: 0, lastCheckpointAt: null, lastCheckpointPosition: null, raceStartedAt: null });
      lobby.updatedAt = Date.now();
    }
    if (!await persistLobby(response)) return;
    const lobbyStatusMessage = `Match found. Loading lobby ${lobby.members.length}/${lobby.maxPlayers}; free fly while pilots join.`;
    return json(response, 200, { lobby: publicLobby(lobby), message: lobbyStatusMessage });
  }

  if (url.pathname === '/api/lobby/leave') {
    const lobby = lobbyForUser(user.id);
    if (lobby) removeLobbyMember(lobby, user.id);
    if (!await persistLobby(response)) return;
    return json(response, 200, { lobby: null });
  }

  if (url.pathname === '/api/lobby/config') {
    const lobby = lobbyForUser(user.id);
    if (!lobby) return json(response, 404, { error: 'Create or join a party first.' });
    if (lobby.hostId !== user.id) return json(response, 403, { error: 'Only the party host can change the race setup.' });
    if (lobby.status !== 'open') return json(response, 409, { error: 'The course cannot change after a race has started.' });
    if (body.gameMode === 'competitive-4v4' && !nextTournament()) {
      return json(response, 409, { error: 'Tournament mode is locked until a future tournament is scheduled.' });
    }
    const config = safeLobbyConfig(body, {
      biome: lobby.biome, trackId: lobby.trackId, serverRegion: lobby.serverRegion || 'auto',
      gameMode: lobby.gameMode || '4v4',
      trackSource: lobby.trackSource || 'game', maxPlayers: lobby.maxPlayers || 8,
      serverName: lobby.serverName || 'Open Flight Server',
    });
    if (!lobbyHasCompatibleTrack(config)) return json(response, 409, { error: lobbyTrackModeError(config.gameMode) });
    Object.assign(lobby, config);
    lobby.updatedAt = Date.now();
    if (!await persistLobby(response)) return;
    return json(response, 200, { lobby: publicLobby(lobby) });
  }

  if (url.pathname === '/api/lobby/ready') {
    const lobby = lobbyForUser(user.id);
    if (!lobby) return json(response, 404, { error: 'Join a flight lobby before marking yourself ready.' });
    const member = lobby.members.find((candidate) => candidate.userId === user.id);
    const now = Date.now();
    member.readyAt ||= now;
    member.lastSeenAt = now;
    if (lobby.status === 'open'
      && lobby.members.length >= (lobby.maxPlayers || 8)
      && lobby.members.every((candidate) => candidate.readyAt)) {
      beginLobbyRace(lobby, now);
    }
    lobby.updatedAt = now;
    if (!await persistLobby(response)) return;
    return json(response, 200, { lobby: publicLobby(lobby) });
  }

  if (url.pathname === '/api/lobby/race/start') {
    const lobby = lobbyForUser(user.id);
    if (!lobby) return json(response, 404, { error: 'Create or join a party first.' });
    if (lobby.hostId !== user.id) return json(response, 403, { error: 'Only the party host can start a crew race.' });
    if (lobby.status !== 'open') return json(response, 409, { error: 'A crew race is already in progress.' });
    if (!beginLobbyRace(lobby)) return json(response, 409, { error: 'Wait for a full, loaded lobby and choose a supported course before starting.' });
    if (!await persistLobby(response)) return;
    return json(response, 200, { lobby: publicLobby(lobby) });
  }

  if (url.pathname === '/api/lobby/race/launch') {
    const lobby = lobbyForUser(user.id);
    if (!lobby) return json(response, 404, { error: 'Join a flight party before launching the race.' });
    if (body.startAt !== lobby.startAt) return json(response, 409, { error: 'That race has changed. Refresh the flight party and try again.' });
    if (lobby.status !== 'racing' || !lobby.raceAt || Date.now() < lobby.raceAt) {
      return json(response, 409, { error: 'Wait for the race countdown before launching.' });
    }
    const member = lobby.members.find((candidate) => candidate.userId === user.id);
    if (!member || member.finishedAt) return json(response, 409, { error: 'Your race result has already been recorded.' });
    const relayMode = lobby.gameMode === 'relay-race';
    const relayTeam = relayMode ? lobby.relayTeams?.[member.relayTeam] : null;
    if (relayMode && (!relayTeam || relayTeam.memberIds[relayTeam.currentStation] !== member.userId || relayTeam.finishedAt)) {
      return json(response, 409, { error: 'Wait for your teammate to hand off the Relay station before launching.' });
    }
    if (!relayMode && member.raceStartedAt) return json(response, 200, { lobby: publicLobby(lobby) });
    if ((!relayMode && member.nextGateIndex !== 0) || !validPosition(body.previous) || !validPosition(body.current)) {
      return json(response, 409, { error: 'Launch from the marked podium before reporting a race start.' });
    }
    const gridSlot = relayMode ? member.relayStation : lobby.members.findIndex((candidate) => candidate.userId === user.id);
    const anchor = raceLaunchAnchor(lobby, gridSlot);
    if (!anchor) return json(response, 409, { error: 'The course launch podium could not be verified.' });
    const previous = body.previous;
    const current = body.current;
    const segmentLength = Math.hypot(...current.map((coordinate, axis) => coordinate - previous[axis]));
    const launchOffset = Math.hypot(previous[0] - anchor[0], previous[2] - anchor[2]);
    const launched = current[1] > previous[1] + 0.015
      || Math.hypot(current[0] - previous[0], current[2] - previous[2]) > 0.025;
    if (segmentLength > 8 || segmentLength < 0.01 || launchOffset > 6.5 || Math.abs(previous[1] - anchor[1]) > 8 || !launched) {
      return json(response, 409, { error: 'The reported flight did not leave the launch podium.' });
    }
    const now = Date.now();
    const previousRaceStartedAt = member.raceStartedAt;
    const previousCheckpointAt = member.lastCheckpointAt;
    const previousCheckpointPosition = member.lastCheckpointPosition;
    const previousLastSeenAt = member.lastSeenAt;
    const previousUpdatedAt = lobby.updatedAt;
    const previousSegmentStartedAt = relayTeam?.segmentStartedAt;
    const previousLapStartedAt = relayTeam?.lapStartedAt;
    member.raceStartedAt = now;
    member.lastCheckpointAt = null;
    member.lastCheckpointPosition = null;
    member.lastSeenAt = now;
    if (relayTeam) {
      relayTeam.segmentStartedAt = now;
      relayTeam.lapStartedAt ||= now;
    }
    lobby.updatedAt = now;
    if (!await persistLobby(response)) {
      member.raceStartedAt = previousRaceStartedAt;
      member.lastCheckpointAt = previousCheckpointAt;
      member.lastCheckpointPosition = previousCheckpointPosition;
      member.lastSeenAt = previousLastSeenAt;
      if (relayTeam) {
        relayTeam.segmentStartedAt = previousSegmentStartedAt;
        relayTeam.lapStartedAt = previousLapStartedAt;
      }
      lobby.updatedAt = previousUpdatedAt;
      return;
    }
    return json(response, 200, { lobby: publicLobby(lobby) });
  }

  if (url.pathname === '/api/lobby/race/checkpoint') {
    const lobby = lobbyForUser(user.id);
    if (!lobby) return json(response, 404, { error: 'Join a flight party before reporting race progress.' });
    if (body.startAt !== lobby.startAt) return json(response, 409, { error: 'That race has changed. Refresh the flight party and try again.' });
    if (lobby.status !== 'racing' || !lobby.raceAt || Date.now() < lobby.raceAt) {
      return json(response, 409, { error: 'The race countdown has not finished yet.' });
    }
    const member = lobby.members.find((candidate) => candidate.userId === user.id);
    if (!member || member.finishedAt) return json(response, 409, { error: 'Your race result has already been recorded.' });
    if (!member.raceStartedAt) return json(response, 409, { error: 'Launch from the podium before passing the first gate.' });
    const totalGates = raceGateCount(lobby);
    if (totalGates < 2) return json(response, 409, { error: 'The race course could not be verified.' });
    const gateIndex = body.gateIndex;
    if (lobby.gameMode === 'relay-race') {
      const relayTeam = lobby.relayTeams?.[member.relayTeam];
      if (!relayTeam || relayTeam.finishedAt || relayTeam.memberIds[relayTeam.currentStation] !== member.userId) {
        return json(response, 409, { error: 'Wait for your teammate to hand off the Relay station before passing a gate.' });
      }
      if (!Number.isSafeInteger(gateIndex) || gateIndex !== relayTeam.nextGateIndex || gateIndex >= totalGates) {
        return json(response, 409, { error: 'Relay gates must be completed in course order.' });
      }
      const now = Date.now();
      const checkpointPosition = verifyRaceCheckpoint(lobby, gateIndex, body.crossing, member, now);
      if (!checkpointPosition) return json(response, 409, { error: 'Your flight path did not cross that Relay gate.' });
      if (now - member.raceStartedAt < minimumFirstCheckpointDelayMs) {
        return json(response, 409, { error: 'Wait until you reach the next Relay station gate.' });
      }
      if (member.lastCheckpointAt && now - member.lastCheckpointAt < minimumCheckpointIntervalMs) {
        return json(response, 409, { error: 'Race checkpoints were reported too quickly.' });
      }

      const previousTeam = {
        ...relayTeam,
        lapTimes: [...relayTeam.lapTimes],
        splits: [...relayTeam.splits],
      };
      const previousMembers = lobby.members.map((candidate) => ({
        nextGateIndex: candidate.nextGateIndex,
        lastCheckpointAt: candidate.lastCheckpointAt,
        lastCheckpointPosition: candidate.lastCheckpointPosition,
        lastSeenAt: candidate.lastSeenAt,
        finishedAt: candidate.finishedAt,
        didNotFinish: candidate.didNotFinish,
      }));
      const previousLobby = { updatedAt: lobby.updatedAt, status: lobby.status, startAt: lobby.startAt, raceAt: lobby.raceAt, results: lobby.results };
      const previousFirstPlaces = new Map(store.users.map((candidate) => [candidate.id, candidate.firstPlaces]));
      const previousAwards = [];
      const station = relayTeam.currentStation;
      const segmentStartedAt = Number(relayTeam.segmentStartedAt || member.raceStartedAt);
      const split = {
        userId: member.userId,
        station,
        lap: relayTeam.currentLap,
        gateIndex,
        timeMs: Math.max(0, now - segmentStartedAt),
        completedAt: now,
      };
      relayTeam.splits.push(split);
      relayTeam.nextGateIndex = gateIndex + 1;
      relayTeam.segmentStartedAt = null;
      member.nextGateIndex = gateIndex + 1;
      member.lastCheckpointAt = now;
      member.lastCheckpointPosition = checkpointPosition;
      member.lastSeenAt = now;
      if (gateIndex % relayStationCount === 0) {
        relayTeam.lapTimes.push(Math.max(0, now - Number(relayTeam.lapStartedAt || now)));
        if (relayTeam.currentLap >= (Number(raceTrackRecord(lobby)?.laps) || 1)) {
          relayTeam.finishedAt = now;
          relayTeam.memberIds.forEach((memberId) => {
            const teammate = lobby.members.find((candidate) => candidate.userId === memberId);
            if (teammate) teammate.finishedAt = now;
          });
        } else {
          relayTeam.currentLap += 1;
          relayTeam.currentStation = 0;
          relayTeam.lapStartedAt = null;
        }
      } else {
        relayTeam.currentStation = (relayTeam.currentStation + 1) % relayStationCount;
      }
      let teamXpAwarded = false;
      if (relayTeam.finishedAt) {
        relayTeam.memberIds.forEach((memberId) => {
          const pilot = store.users.find((candidate) => candidate.id === memberId);
          if (!pilot) return;
          const persistentTeam = teamForUser(memberId);
          previousAwards.push({ pilot, pilotXp: pilot.xp, persistentTeam, teamXp: persistentTeam?.xp });
          pilot.xp = Math.max(0, Math.floor(Number(pilot.xp) || 0)) + 100;
          if (persistentTeam) {
            persistentTeam.xp = Math.max(0, Math.floor(Number(persistentTeam.xp) || 0)) + 100;
            teamXpAwarded = true;
          }
        });
      }
      if (lobby.members.every((candidate) => candidate.finishedAt)) settleLobbyRace(lobby);
      lobby.updatedAt = now;
      if (!await persistLobby(response)) {
        Object.assign(relayTeam, previousTeam);
        lobby.members.forEach((candidate, index) => Object.assign(candidate, previousMembers[index]));
        Object.assign(lobby, previousLobby);
        previousAwards.forEach(({ pilot, pilotXp, persistentTeam, teamXp }) => {
          pilot.xp = pilotXp;
          if (persistentTeam) persistentTeam.xp = teamXp;
        });
        store.users.forEach((candidate) => { candidate.firstPlaces = previousFirstPlaces.get(candidate.id); });
        return;
      }
      return json(response, 200, {
        lobby: publicLobby(lobby),
        teamXpAwarded,
        checkpointProgress: { passed: relayTeam.nextGateIndex, total: totalGates },
        relayTransition: {
          teamIndex: relayTeam.teamIndex,
          activePilotId: relayTeam.memberIds[relayTeam.currentStation] || null,
          station: relayTeam.currentStation,
          currentLap: relayTeam.currentLap,
          timeMs: split.timeMs,
          lapTimeMs: relayTeam.lapTimes.at(-1) || null,
        },
      });
    }
    const expectedGateIndex = Number.isSafeInteger(member.nextGateIndex) ? member.nextGateIndex : 0;
    if (!Number.isSafeInteger(gateIndex) || gateIndex !== expectedGateIndex || gateIndex >= totalGates) {
      return json(response, 409, { error: 'Race checkpoints must be completed in course order.' });
    }
    const now = Date.now();
    const checkpointPosition = verifyRaceCheckpoint(lobby, gateIndex, body.crossing, member, now);
    if (!checkpointPosition) return json(response, 409, { error: 'Your flight path did not cross that course gate.' });
    if (gateIndex === 0 && now - member.raceStartedAt < minimumFirstCheckpointDelayMs) {
      return json(response, 409, { error: 'Wait until you reach the start / finish gate.' });
    }
    if (gateIndex > 0 && now - Number(member.lastCheckpointAt || 0) < minimumCheckpointIntervalMs) {
      return json(response, 409, { error: 'Race checkpoints were reported too quickly.' });
    }

    const previousProgress = member.nextGateIndex;
    const previousCheckpointAt = member.lastCheckpointAt;
    const previousCheckpointPosition = member.lastCheckpointPosition;
    const previousLastSeenAt = member.lastSeenAt;
    const previousUpdatedAt = lobby.updatedAt;
    member.nextGateIndex = gateIndex + 1;
    member.lastCheckpointAt = now;
    member.lastCheckpointPosition = checkpointPosition;
    member.lastSeenAt = now;
    lobby.updatedAt = now;
    if (!await persistLobby(response)) {
      member.nextGateIndex = previousProgress;
      member.lastCheckpointAt = previousCheckpointAt;
      member.lastCheckpointPosition = previousCheckpointPosition;
      member.lastSeenAt = previousLastSeenAt;
      lobby.updatedAt = previousUpdatedAt;
      return;
    }
    return json(response, 200, {
      lobby: publicLobby(lobby),
      checkpointProgress: { passed: member.nextGateIndex, total: totalGates },
    });
  }

  if (url.pathname === '/api/lobby/race/finish') {
    const lobby = lobbyForUser(user.id);
    if (!lobby) return json(response, 404, { error: 'Join a flight party before submitting a race result.' });
    if (!['starting', 'grid', 'racing'].includes(lobby.status)) return json(response, 409, { error: 'There is no active crew race to finish.' });
    if (body.startAt !== lobby.startAt) return json(response, 409, { error: 'That race has changed. Refresh the flight party and try again.' });
    const member = lobby.members.find((candidate) => candidate.userId === user.id);
    if (!member) return json(response, 404, { error: 'You are not a member of this crew race.' });
    const didNotFinish = body.didNotFinish === true;
    if (lobby.gameMode === 'relay-race') {
      if (!didNotFinish) return json(response, 409, { error: 'Relay teams finish when their final start / finish gate is crossed.' });
      const relayTeam = lobby.relayTeams?.[member.relayTeam];
      if (!relayTeam || relayTeam.finishedAt) return json(response, 409, { error: 'Your Relay team result has already been recorded.' });
      const now = Date.now();
      const previousTeam = { ...relayTeam };
      const previousMembers = lobby.members.map((candidate) => ({
        finishedAt: candidate.finishedAt,
        didNotFinish: candidate.didNotFinish,
      }));
      const previousLobby = { updatedAt: lobby.updatedAt, status: lobby.status, startAt: lobby.startAt, raceAt: lobby.raceAt, results: lobby.results };
      relayTeam.finishedAt = now;
      relayTeam.memberIds.forEach((memberId) => {
        const teammate = lobby.members.find((candidate) => candidate.userId === memberId);
        if (teammate) {
          teammate.finishedAt = now;
          teammate.didNotFinish = true;
        }
      });
      if (lobby.members.every((candidate) => candidate.finishedAt)) settleLobbyRace(lobby);
      lobby.updatedAt = now;
      if (!await persistLobby(response)) {
        Object.assign(relayTeam, previousTeam);
        lobby.members.forEach((candidate, index) => Object.assign(candidate, previousMembers[index]));
        Object.assign(lobby, previousLobby);
        return;
      }
      return json(response, 200, { lobby: publicLobby(lobby), teamXpAwarded: false });
    }
    if (!didNotFinish) {
      const totalGates = raceGateCount(lobby);
      if (lobby.status !== 'racing' || !lobby.raceAt || Date.now() < lobby.raceAt) {
        return json(response, 409, { error: 'The race countdown has not finished yet.' });
      }
      if (totalGates < 2 || member.nextGateIndex !== totalGates) {
        return json(response, 409, { error: 'Pass every course checkpoint before submitting a finish.' });
      }
      if (!member.raceStartedAt) return json(response, 409, { error: 'Launch from the podium before finishing this race.' });
      if (Date.now() - member.raceStartedAt < minimumCrewRaceDurationMs) {
        return json(response, 409, { error: 'The race finish was reported too soon.' });
      }
    }

    const firstFinish = !member.finishedAt;
    const now = Date.now();
    const previousMember = { finishedAt: member.finishedAt, didNotFinish: member.didNotFinish, lastSeenAt: member.lastSeenAt };
    const previousLobby = { updatedAt: lobby.updatedAt, status: lobby.status, startAt: lobby.startAt, raceAt: lobby.raceAt, results: lobby.results };
    const pilot = store.users.find((candidate) => candidate.id === user.id);
    const team = !didNotFinish && firstFinish ? teamForUser(user.id) : null;
    const previousPilotXp = pilot?.xp;
    const previousTeamXp = team?.xp;
    const previousFirstPlaces = new Map(store.users.map((candidate) => [candidate.id, candidate.firstPlaces]));
    let teamXpAwarded = false;
    if (firstFinish) {
      member.finishedAt = now;
      member.didNotFinish = didNotFinish;
      member.lastSeenAt = now;
      if (!didNotFinish && pilot) {
        pilot.xp = Math.max(0, Math.floor(Number(pilot.xp) || 0)) + 100;
        if (team) {
          team.xp = Math.max(0, Math.floor(Number(team.xp) || 0)) + 100;
          teamXpAwarded = true;
        }
      }
    }
    if (lobby.members.every((candidate) => candidate.finishedAt)) settleLobbyRace(lobby);
    lobby.updatedAt = now;
    if (!await persistLobby(response)) {
      member.finishedAt = previousMember.finishedAt;
      member.didNotFinish = previousMember.didNotFinish;
      member.lastSeenAt = previousMember.lastSeenAt;
      lobby.updatedAt = previousLobby.updatedAt;
      lobby.status = previousLobby.status;
      lobby.startAt = previousLobby.startAt;
      lobby.raceAt = previousLobby.raceAt;
      lobby.results = previousLobby.results;
      if (pilot) pilot.xp = previousPilotXp;
      if (team) team.xp = previousTeamXp;
      store.users.forEach((candidate) => { candidate.firstPlaces = previousFirstPlaces.get(candidate.id); });
      return;
    }
    return json(response, 200, { lobby: publicLobby(lobby), teamXpAwarded, user: pilot ? publicUser(pilot) : null });
  }

  return json(response, 404, { error: 'Party endpoint not found.' });
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.stl': 'model/stl',
};

export async function serveProduction(request, response, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400); response.end('Bad path'); return; }
  if (pathname === '/') pathname = '/index.html';
  let filePath = path.resolve(distDirectory, `.${pathname}`);
  if (!filePath.startsWith(`${distDirectory}${path.sep}`) && filePath !== path.join(distDirectory, 'index.html')) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  try {
    const contents = await readFile(filePath);
    const immutable = pathname.startsWith('/assets/');
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    if (!path.extname(pathname)) {
      try {
        const contents = await readFile(path.join(distDirectory, 'index.html'));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        response.end(request.method === 'HEAD' ? undefined : contents);
      } catch { response.writeHead(503); response.end('Build the app with npm run build first.'); }
      return;
    }
    response.writeHead(404); response.end('Not found');
  }
}

export async function dispatchApiRequest(request, response, url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)) {
  if (url.pathname === '/api/leaderboard') {
    try { handleLeaderboard(request, response); }
    catch { if (!response.headersSent) json(response, 500, { error: 'Leaderboard service encountered an error.' }); else response.destroy(); }
    return;
  }
  if (url.pathname === '/api/community-tracks') {
    try { await handleCommunityTracks(request, response); }
    catch { if (!response.headersSent) json(response, 500, { error: 'Community track service encountered an error.' }); else response.destroy(); }
    return;
  }
  if (url.pathname.startsWith('/api/auth/')) {
    try { await handleAuth(request, response, url); }
    catch { if (!response.headersSent) json(response, 500, { error: 'Account service encountered an error.' }); else response.destroy(); }
    return;
  }
  if (url.pathname === '/api/friends' || url.pathname.startsWith('/api/friends/')) {
    try { await handleFriends(request, response, url); }
    catch { if (!response.headersSent) json(response, 500, { error: 'Friends service encountered an error.' }); else response.destroy(); }
    return;
  }
  if (url.pathname === '/api/teams' || url.pathname.startsWith('/api/teams/')) {
    try { await handleTeams(request, response, url); }
    catch { if (!response.headersSent) json(response, 500, { error: 'Team service encountered an error.' }); else response.destroy(); }
    return;
  }
  if (url.pathname.startsWith('/api/lobby/')) {
    try { await handleLobby(request, response, url); }
    catch { if (!response.headersSent) json(response, 500, { error: 'Flight party service encountered an error.' }); else response.destroy(); }
    return;
  }
  json(response, 404, { error: 'API route not found.' });
}
