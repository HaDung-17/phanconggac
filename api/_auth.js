const crypto = require('crypto');

const COOKIE_NAME = 'catgac_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function getEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length ? value : null;
}
function base64url(value) { return Buffer.from(value).toString('base64url'); }
function sign(value) {
  const secret = getEnv('AUTH_SECRET');
  if (!secret) throw new Error('Thiếu biến môi trường AUTH_SECRET');
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}
function createSession(username, role) {
  const payload = `${username}|${role}|${Date.now() + SESSION_TTL_SECONDS * 1000}`;
  const encoded = base64url(payload);
  return `${encoded}.${sign(encoded)}`;
}
function parseCookies(header) {
  const cookies = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('='); if (i < 0) return;
    const key = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
    if (key) cookies[key] = value;
  });
  return cookies;
}
function getSession(req) {
  const cookies = parseCookies(req.headers && req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const dot = token.lastIndexOf('.'); if (dot <= 0) return null;
  const encoded = token.slice(0, dot), provided = token.slice(dot + 1), expected = sign(encoded);
  const a = Buffer.from(provided), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = Buffer.from(encoded, 'base64url').toString('utf8'); } catch (_) { return null; }
  const parts = payload.split('|');
  if (parts.length !== 3) return null;
  const [username, role, expiresText] = parts;
  const expiresAt = Number(expiresText);
  if (!username || !['admin','user'].includes(role) || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
  return { username, role, expiresAt };
}
function setSessionCookie(res, username, role) {
  const token = createSession(username, role);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_TTL_SECONDS}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
}
function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.' });
    return null;
  }
  return session;
}
function requireAdmin(req, res) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (session.role !== 'admin') {
    res.status(403).json({ error: 'Chỉ tài khoản quản trị mới có quyền này.' });
    return null;
  }
  return session;
}
function adminCredentialsValid(username, password) {
  const expectedUser = getEnv('APP_LOGIN_USER');
  const expectedPassword = getEnv('APP_LOGIN_PASSWORD');
  if (!expectedUser || !expectedPassword) throw new Error('Thiếu APP_LOGIN_USER hoặc APP_LOGIN_PASSWORD');
  return username === expectedUser && password === expectedPassword;
}
module.exports = { clearSessionCookie, adminCredentialsValid, setSessionCookie, requireAuth, requireAdmin, getSession, COOKIE_NAME };
