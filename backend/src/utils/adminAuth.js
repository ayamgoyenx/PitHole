const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const db = require('../db');
const COOKIE_NAME = 'pithole_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);
function isConfigured() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return Boolean(secret && secret.length >= 32 && !secret.startsWith('replace-with-'));
}
function tokenFrom(req) {
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function tokenHash(token) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(token).digest('hex');
}
async function createSessionToken(credentials) {
  const token = crypto.randomBytes(32).toString('base64url');
  // Hold the credential row while checking the verified hash and creating the
  // session so password changes cannot leave behind a newly-created stale session.
  await db.withTransaction(async tx => {
    const row = await tx('SELECT id FROM admins WHERE id = $1 AND password_hash = $2 FOR UPDATE', [credentials.id, credentials.passwordHash]);
    if (!row.rowCount) throw Object.assign(new Error('Credentials changed; sign in again.'), { statusCode: 401 });
    await tx('DELETE FROM admin_sessions WHERE expires_at <= clock_timestamp()');
    await tx("INSERT INTO admin_sessions(token_hash, admin_id, expires_at) VALUES ($1,$2,clock_timestamp() + $3 * interval '1 second')", [tokenHash(token), credentials.id, SESSION_SECONDS]);
  });
  return token;
}
async function readSession(req) {
  if (!isConfigured()) return null;
  const token = tokenFrom(req);
  if (!token) return null;
  const result = await db.query(`SELECT a.username AS sub FROM admin_sessions s
    JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = $1 AND s.expires_at > clock_timestamp()`, [tokenHash(token)]);
  return result.rows[0] || null;
}
async function revokeSession(req) {
  if (!isConfigured()) throw new Error('Session secret not configured.');
  const token = tokenFrom(req);
  if (token) await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash(token)]);
}
function sessionCookie(req, token, maxAge = SESSION_SECONDS) {
  const attributes = [`${COOKIE_NAME}=${token}`, 'HttpOnly', process.env.NODE_ENV === 'production' ? 'SameSite=None' : 'SameSite=Strict', 'Path=/', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}
async function requireAdmin(req, res, next) {
  try {
    if (!isConfigured()) return res.status(503).json({ status: 'error', message: 'Admin authentication unavailable.' });
    const session = await readSession(req);
    if (!session) return res.status(401).json({ status: 'error', message: 'Admin session required.' });
    req.admin = session;
    return next();
  } catch (error) { return next(error); }
}
async function verifyCredentials(username, password) {
  if (!isConfigured() || typeof username !== 'string' || typeof password !== 'string'
      || !username.length || username.length > 100 || !password.length || Buffer.byteLength(password, 'utf8') > 72) return false;
  const result = await db.query('SELECT id, username, password_hash FROM admins WHERE username = $1', [username]);
  const row = result.rows[0];
  const matches = await bcrypt.compare(password, row?.password_hash || DUMMY_HASH);
  return row && matches ? { id: row.id, username: row.username, passwordHash: row.password_hash } : false;
}
module.exports = { COOKIE_NAME, SESSION_SECONDS, createSessionToken, isConfigured, readSession, revokeSession, requireAdmin, sessionCookie, verifyCredentials };
