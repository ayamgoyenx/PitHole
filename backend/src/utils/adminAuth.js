const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const db = require('../db');

const COOKIE_NAME = 'pithole_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

// Valid hash used to keep response time similar when the username does not exist
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

// Only the session secret comes from env; admin credentials live in the `admins` table.
function isConfigured() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return Boolean(secret && secret.length >= 32 && !secret.startsWith('replace-with-'));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

//membuat signature dengan HMAC-SHA256 menggunakan session secret
//proses:
// 1. ambil payload
// 2. buat HMAC-SHA256 dengan session secret
// 3. encode hasilnya dengan base64url
function signature(payload) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}

//fungsi untuk kustom token ceunah
//proses:
// 1. buat payload dengan sub dan exp
// 2. buat signature dari payload
// 3. gabungkan payload dan signature menjadi session token
function createSessionToken(username) {
  //base64url-> encoding pengembangan dari base64url (+ dan / diganti - dan _), = dihilangkan
  //contoh: Hello World! --> SGVsbG8gV29ybGQh (base64url)
  //Buffer --> untuk menyimpan, mengelola, manipulasi data biner langsung di memori luar (biasanya di RAM)
  //Defining payload (data) untuk session token 
  const payload = Buffer.from(JSON.stringify({
    sub: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })).toString('base64url');
  return `${payload}.${signature(payload)}`;
  //session token = payload + signature(payload)
}

function readSession(req) {
  //membaca output fungsi isConfigured tadi
  // kalau isConfigured false
  //--> return null
  if (!isConfigured()) return null;

  //define cookie header dan parsing cookie untuk mendapatkan cookie
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  //kalau cookie seng ada 
  // --> return null
  if (!cookie) return null;

  //define token 
  //token = panjang COOKIE_NAME + 1
  const token = cookie.slice(COOKIE_NAME.length + 1);
  
  //supplied signature --> signature yang didefined tp #jujur aku gatau dimana 
  //  memisahkan payload dan signature dari token'
  //kalau token yang diedefined tidak ada atau token (payload) tidak ada --> return null
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature || !safeEqual(signature(payload), suppliedSignature)) return null;

  try {
    //defining session 
    //session = hasil parsing payload yang diconvert dari base64url ke string utf8
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    //session sub adalah username admin yang tersimpan di session token
    //session exp adalah waktu kadaluarsa session token (dalam detik sejak epoch)
    // kalau session sub >< username admin atau session exp (masa berlaku) < sekarang --> return null
    if (!session.sub || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

//fungsi untuk membuat cookie session
//proses:
// 1. buat array atribut cookie
// 2. tambahkan atribut Secure kalau di production
// 3. gabungkan atribut menjadi string cookie
function sessionCookie(req, token, maxAge = SESSION_SECONDS) {
  const isProduction = process.env.NODE_ENV === 'production';
  // Frontend and backend are on different sites in production, so the cookie must be
  // SameSite=None (which browsers only accept together with Secure).
  const attributes = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    `SameSite=${isProduction ? 'None' : 'Strict'}`,
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (isProduction) attributes.push('Secure');
  return attributes.join('; ');
}

function requireAdmin(req, res, next) {
  if (!isConfigured()) {
    console.error('[Admin] ADMIN_SESSION_SECRET is missing or invalid (needs 32+ chars).');
    return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again later.' });
  }
  if (!readSession(req)) {
    return res.status(401).json({ status: 'error', message: 'Admin session required.' });
  }
  return next();
}

async function verifyCredentials(username, password) {
  if (!isConfigured() || typeof username !== 'string' || typeof password !== 'string') return false;
  const result = await db.query('SELECT password_hash FROM admins WHERE username = $1', [username]);
  const hash = result?.rows[0]?.password_hash;
  const matches = await bcrypt.compare(password, hash || DUMMY_HASH);
  return Boolean(hash) && matches;
}

module.exports = {
  COOKIE_NAME,
  SESSION_SECONDS,
  createSessionToken,
  isConfigured,
  readSession,
  requireAdmin,
  sessionCookie,
  verifyCredentials,
};
