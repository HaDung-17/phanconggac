const { db } = require('./_mongo');
const { requireAdmin } = require('./_auth');
module.exports = async (req,res)=>{
  try{
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
    if(!requireAdmin(req,res)) return;
    const docs=await (await db()).collection('users').find({},{projection:{_id:0,fullName:1,username:1,role:1,createdAt:1,lastLoginAt:1,lastIp:1,lastLocation:1,loginCount:1}}).sort({createdAt:-1}).toArray();
    const adminUser=process.env.APP_LOGIN_USER;
    const adminPassSet=Boolean(process.env.APP_LOGIN_PASSWORD);
    if(adminUser && !docs.some(x=>x.username===adminUser)) docs.unshift({fullName:process.env.APP_LOGIN_FULL_NAME||'Tài khoản quản trị',username:adminUser,role:'admin',createdAt:null,lastLoginAt:null,lastIp:null,lastLocation:null,loginCount:0});
    return res.status(200).json(docs);
  }catch(e){console.error(e);return res.status(500).json({error:e.message});}
};
