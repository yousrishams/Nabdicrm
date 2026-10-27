const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [i,m] of scripts.entries()) {const f='/tmp/nabdi-script-'+i+(m[1].includes('module')?'.mjs':'.js');fs.writeFileSync(f,m[2]);require('child_process').execFileSync('node',['--check',f]);}
let projects=[];
const ctx={window:{tasks:[],nabdiStorage:{getItem:()=>JSON.stringify(projects)},currentUserRole:'manager',currentLoggedInAgent:'A',
 getLocalDateString:x=>x?new Date(x).toISOString().slice(0,10):'2026-10-27',isCompletedStatus:s=>['مكتمل','مكتملة'].includes(s),
 sameEmployee:(a,b)=>a?.trim()===b?.trim(),isEmployeeAllowedInSupervisorReports:()=>true},
 isInternalTask:t=>t.taskType==='internal',getInternalTaskState:t=>t.status==='مكتمل'?'مكتملة':'جديدة',isInternalTaskLate:()=>false};
vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('        window.getSupportWorkItems ='),html.indexOf('        function buildSupportInfographic(')),ctx);
const w=ctx.window;
w.tasks=[{id:'i',taskType:'internal',department:'الدعم الفني',agent:'A',status:'مكتمل',completedAt:'2026-10-27'}, {id:'deleted',taskType:'internal',department:'الدعم الفني',deletedAt:'x'}];
projects=[{id:'p',clientName:'Clinic',sentAt:'2026-08-01',receivedBy:'A',completedAt:'2026-10-27',tasks:[{id:'t',agent:'A',status:'مكتملة'},{id:'d',deletedAt:'x'}]}, {id:'deleted',deletedAt:'x',tasks:[{id:'t'}]}];
assert.equal(w.getSupportWorkItems().length,2);
assert.equal(w.getSupportWorkItems().filter(t=>t.performanceState==='مكتملة').length,2);
assert.equal(w.getSupportReportProjects('2026-10-27','2026-10-27','A').length,1,'old submission completed today must appear');
assert.equal(w.getSupportReportProjects('2026-10-27','2026-10-27','B').length,0);
assert.equal(w.supportRecordInPeriod({},'2026-10-27','2026-10-27'),false);
assert.equal(w.supportRecordInPeriod({},'',''),true);
const t={status:'جديدة',activityLog:[{comment:'preserve'}]};w.recordSupportTaskStatus(t,'مكتملة');assert(t.completedAt);assert.equal(t.activityLog.length,2);w.recordSupportTaskStatus(t,'جاري التنفيذ');assert.equal(t.completedAt,'');assert.equal(t.activityLog.length,3);
w.currentUserRole='agent';w.isEmployeeAllowedInSupervisorReports=()=>false;assert.equal(w.getSupportReportProjects('','','ALL').length,0);
console.log('PASS: inline JS syntax; combined counts; deletions; completion-period filter; employee scope; unknown dates; status history/reopening.');
w.currentUserRole='manager';w.isEmployeeAllowedInSupervisorReports=()=>true;w.formatEgyptDateTime=x=>String(x);w.findEmployeeByName=n=>({name:n,shift:'صباحي'});
Object.assign(ctx,{reportKpi:(...x)=>JSON.stringify(x),reportSection:(...x)=>JSON.stringify(x),reportTable:(...x)=>JSON.stringify(x),reportHighlights:x=>JSON.stringify(x),reportPercent:(a,b)=>b?Math.round(a/b*100):0});
vm.runInContext(html.slice(html.indexOf('        function buildSupportInfographic('),html.indexOf('        function findReportClientForTask(')),ctx);
const output=ctx.buildSupportInfographic('2026-10-27','2026-10-27','ALL','ALL');
assert(output.includes('Clinic'));assert(output.includes('مهمة داخلية'));assert(output.includes('100%'));assert(!output.includes('deleted'));
assert.equal(w.getSupportReportProjects('','','ALL','مسائي').length,0);
console.log('PASS: report renders internal and client executions, completion rate, and shift filtering.');
