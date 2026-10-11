const crypto = require('crypto');
const { db } = require('./_mongo');
const { clearSessionCookie, adminCredentialsValid, setSessionCookie, getSession } = require('./_auth');

function hashPassword(password) { return crypto.scryptSync(password, process.env.AUTH_SECRET, 64).toString('hex'); }
function validUsername(u) { return /^[A-Za-z0-9_.-]{3,30}$/.test(u); }
function validPassword(p) { return typeof p === 'string' && p.length >= 6 && p.length <= 128; }
function getIp(req) {
  const h = req.headers || {};
  const raw = h['x-forwarded-for'] || h['x-real-ip'] || '';
  return String(raw).split(',')[0].trim() || 'Không xác định';
}
async function geolocate(ip) {
  if (!ip || ip === 'Không xác định' || ip === '::1' || ip === '127.0.0.1' || ip.includes(':')) return { country:'', region:'', city:'', latitude:null, longitude:null, provider:'', note:'Không xác định' };
  try {
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error('geo http '+r.status);
    const x = await r.json();
    return { country:x.country_name||'', region:x.region||'', city:x.city||'', latitude:x.latitude??null, longitude:x.longitude??null, provider:'ipapi.co', note:'' };
  } catch (_) { return { country:'', region:'', city:'', latitude:null, longitude:null, provider:'', note:'Không xác định' }; }
}
async function recordLogin(username, role, req) {
  const database = await db(), col = database.collection('users');
  const ip = getIp(req), geo = await geolocate(ip), now = new Date();
  const set = { lastLoginAt: now, lastIp: ip, lastLocation: geo, role, updatedAt: now };
  if (role === 'admin' && !process.env.APP_LOGIN_FULL_NAME) { /* admin name is optional */ }
  if (role === 'admin' && process.env.APP_LOGIN_FULL_NAME) set.fullName = process.env.APP_LOGIN_FULL_NAME;
  await col.updateOne({ username }, { $set: set, $setOnInsert: { username, createdAt: now, loginCount: 0 } }, { upsert:true });
  await col.updateOne({ username }, { $inc: { loginCount: 1 } });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}, username = String(body.username || '').trim(), password = String(body.password || '');
      if (adminCredentialsValid(username, password)) {
        setSessionCookie(res, username, 'admin');
        await recordLogin(username, 'admin', req);
        return res.status(200).json({ ok:true, role:'admin', username });
      }
      const database = await db(), user = await database.collection('users').findOne({ username });
      const suppliedHash = user && user.passwordHash ? Buffer.from(user.passwordHash,'hex') : null; const expectedHash = Buffer.from(hashPassword(password),'hex'); if (!suppliedHash || suppliedHash.length !== expectedHash.length || !crypto.timingSafeEqual(suppliedHash, expectedHash)) return res.status(401).json({ error:'Sai tên đăng nhập hoặc mật khẩu.' });
      setSessionCookie(res, username, 'user');
      await recordLogin(username, 'user', req);
      return res.status(200).json({ ok:true, role:'user', username });
    }
    if (req.method === 'DELETE') { clearSessionCookie(res); return res.status(200).json({ ok:true }); }
    if (req.method === 'GET') { const s=getSession(req); return res.status(200).json(s ? {loggedIn:true, username:s.username, role:s.role} : {loggedIn:false}); }
    res.setHeader('Allow','GET, POST, DELETE'); return res.status(405).json({error:'Method not allowed'});
  } catch(e) { console.error(e); return res.status(500).json({error:e.message}); }
};
