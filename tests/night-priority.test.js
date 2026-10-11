const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {replaceGuards}=require('../api/_replace-guards');
const date='2026-10-12';
const prior=(name,n)=>({date:`2026-10-${String(12-n).padStart(2,'0')}`,assignments:[{slot:5,name}]});
const state=names=>({people:names.map(name=>({name,rank:'',ban:'A'})),statuses:{}});
const doc={date,assignments:Array.from({length:7},(_,i)=>({slot:i+1,name:'Old '+i}))};
for(const n of [2,3])test('replacement falls back only when needed: '+n+' days',()=>{
 const previous=[prior('Recent',n)];
 assert.equal(replaceGuards(doc,[5],state(['Recent','Rested']),previous)[4].name,'Rested');
 assert.equal(replaceGuards(doc,[5],state(['Recent']),previous)[4].name,'Recent');
});
test('replacement forbids every consecutive night pair',()=>{
 for(const yesterday of [5,6,7])for(const slot of [5,6,7])assert.throws(()=>replaceGuards(doc,[slot],state(['Recent']),[{date:'2026-10-11',assignments:[{slot:yesterday,name:'Recent'}]}]),/Không đủ người/);
});
test('replacement prioritizes recent night personnel for daytime',()=>{
 assert.equal(replaceGuards(doc,[1],state(['Rested','Recent']),[prior('Recent',3)])[0].name,'Recent');
});
function initial(names,previous,statuses={}){
 const source=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const c={...state(names),statuses,history:previous.reduce((h,p)=>{h[p.date]=[...(h[p.date]||[]),...p.assignments];return h;},{})};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function getHist('),source.indexOf('async function cutGuard(')),c);
 return c.buildGuardSchedule(date);
}
test('initial schedule gives recent night personnel day shifts and excludes absences',()=>{
 const names=['Recent','B','C','D','E','F','G','H','Absent'];
 const result=initial(names,[prior('Recent',1)],{8:{vien:true}});
 assert.equal(result.length,7);assert.ok(result.some(a=>a.name==='Recent'&&a.slot<=4));assert.ok(!result.some(a=>a.name==='Absent'));
});
for(const n of [2,3])test('initial schedule can relax to '+(n-1)+' days when necessary',()=>{
 const names=['A','B','C','D'];const result=initial(names,names.map(name=>prior(name,n)));
 assert.equal(result.length,7);
});
test('initial schedule reports shortage rather than repeat consecutive nights',()=>{
 const names=['A','B','C','D'];assert.equal(initial(names,names.map(name=>prior(name,1))).length,0);
});
