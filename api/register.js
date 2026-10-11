const crypto = require('crypto');
const { db } = require('./_mongo');
const { adminCredentialsValid } = require('./_auth');
function hashPassword(password) { return crypto.scryptSync(password, process.env.AUTH_SECRET, 64).toString('hex'); }
function validUsername(u) { return /^[A-Za-z0-9_.-]{3,30}$/.test(u); }
module.exports = async (req,res)=>{
  try {
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Method not allowed'}); }
    const body=req.body||{}, fullName=String(body.fullName||'').trim(), username=String(body.username||'').trim(), password=String(body.password||'');
    if(!fullName || fullName.length>100) return res.status(400).json({error:'Họ và tên là bắt buộc và không được vượt quá 100 ký tự.'});
    if(!validUsername(username)) return res.status(400).json({error:'Tên đăng nhập 3–30 ký tự, chỉ gồm chữ, số, dấu . _ -'});
    if(password.length<6 || password.length>128) return res.status(400).json({error:'Mật khẩu phải từ 6 đến 128 ký tự.'});
    if(adminCredentialsValid(username,password)) return res.status(409).json({error:'Tên đăng nhập này dành cho tài khoản quản trị.'});
    const col=(await db()).collection('users');
    if(await col.findOne({username},{projection:{_id:1}})) return res.status(409).json({error:'Tên đăng nhập đã tồn tại.'});
    await col.insertOne({fullName,username,passwordHash:hashPassword(password),role:'user',createdAt:new Date(),lastLoginAt:null,lastIp:null,lastLocation:null,loginCount:0});
    return res.status(201).json({ok:true});
  } catch(e){ console.error(e); return res.status(500).json({error:e.message}); }
};
