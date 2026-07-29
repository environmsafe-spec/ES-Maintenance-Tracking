const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

function build(){
  const collections={generators:{},readings:{},maintenance:{},corrective:{}}, listeners={};
  const added=[]; const updated=[]; const deleted=[];
  const fb={ initializeApp(){}, auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb({uid:'x'}),0);},async signInAnonymously(){}};},
    firestore(){ const db={ collection(n){collections[n]=collections[n]||{};listeners[n]=listeners[n]||new Set();return{
      onSnapshot(cb){listeners[n].add(cb);setTimeout(()=>cb({docs:Object.entries(collections[n]).map(([id,data])=>({id,data:()=>({...data})})),empty:!Object.keys(collections[n]).length}),0);return()=>{};},
      async add(d){const id='a'+Math.random().toString(36).slice(2);collections[n][id]={...d};added.push({col:n,id,data:d});return{id};},
      doc(id){return{
        async set(d,o){collections[n][id]=Object.assign({},collections[n][id]||{},d);},
        async update(d){Object.assign(collections[n][id]=collections[n][id]||{},d);updated.push({col:n,id,data:d});},
        async delete(){delete collections[n][id];deleted.push({col:n,id});}
      };},
      limit(){return{async get(){const e=Object.entries(collections[n]);return{empty:!e.length,docs:e.map(([id,data])=>({id,data:()=>data}))};}};} };},
      batch(){const o=[];return{set(r,d){o.push({r,d});},async commit(){}};}, async enablePersistence(){} }; return db; } };
  fb.firestore.FieldValue={serverTimestamp:()=>'TS'};
  function mk(id){return{id,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,addEventListener(){},appendChild(){},removeChild(){},click(){}};}
  const els={};
  let blob=null;
  const sb={console,Date,Math,JSON,Promise,Symbol,String,Number,Array,Object,RegExp,parseFloat,parseInt,isNaN,
    setTimeout:(f,m)=>setTimeout(f,Math.min(m||0,5)),
    Blob:class{constructor(p){this.content=p.join('');blob=this;}}, URL:{createObjectURL(){return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},getAttribute(){}}},
    firebase:fb};
  sb.window=sb; Object.defineProperty(sb,'__blob',{get:()=>blob});
  sb.__added=added; sb.__updated=updated; sb.__deleted=deleted; sb.__collections=collections;
  vm.createContext(sb); return {sb};
}
function run(sb,c){return vm.runInContext(c,sb);}

(async()=>{
  const {sb}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));

  // seed state
  run(sb,`
    STATE.lang='en';
    STATE.generators=[
      {id:'g1',name:'FAO Genset 1',client:'FAO'},
      {id:'g2',name:'UNHCR Genset 1',client:'UNHCR'}
    ];
    STATE.readings=[
      {id:'r1',genId:'g1',timestamp:'2026-07-10T08:00:00Z',hours:1200,vL1:'400',coolantT:'80',battV:'26',fuel:'60'},
      {id:'r2',genId:'g1',timestamp:'2026-07-16T08:00:00Z',hours:1290,vL1:'300',coolantT:'105',battV:'21',fuel:'9'},
      {id:'r3',genId:'g2',timestamp:'2026-07-14T08:00:00Z',hours:4880,vL1:'405',coolantT:'85',battV:'27',fuel:'55'}
    ];
    STATE.maintenance=[
      {id:'g1',hrsPerDay:17,time:{weekly:{lastDone:'2026-07-01'}},hours:{'250':{doneAtHrs:1100,date:'2026-06-20'}}},
      {id:'g2',hrsPerDay:24}
    ];
    STATE.corrective=[
      {id:'c1',genId:'g1',date:'2026-07-05',type:'failure',severity:'high',status:'open',hoursAtEvent:1150,
       description:'Coolant leak',actionTaken:'Clamped',partsUsed:'Clamp',downtimeHrs:3.5,by:'Ahmed'},
      {id:'c2',genId:'g1',date:'2026-07-12',type:'repair',severity:'low',status:'closed',hoursAtEvent:1250,
       description:'Air filter change',actionTaken:'Replaced',partsUsed:'2652C831',downtimeHrs:1,by:'Ahmed'},
      {id:'c3',genId:'g2',date:'2026-06-01',type:'breakdown',severity:'critical',status:'in_progress',
       description:'No start',downtimeHrs:8,by:'Saleh'}
    ];
  `);

  console.log('\n=== Corrective: data helpers ===');
  let n = run(sb,'openFaultCount()');
  check('open fault count = 2 (open + in_progress)', n===2, 'got '+n);
  let list = run(sb,`correctiveFor('g1').map(c=>c.id)`);
  check('correctiveFor filters by generator', JSON.stringify(list)==='["c2","c1"]', JSON.stringify(list));
  check('correctiveFor sorts newest first', list[0]==='c2');
  let all = run(sb,'correctiveFor(null).length');
  check('correctiveFor(null) returns all 3', all===3, 'got '+all);

  console.log('\n=== Corrective: labels & severity class ===');
  check('type label translates', run(sb,`corrTypeLabel('failure')`)==='Failure');
  check('severity label translates', run(sb,`corrSevLabel('critical')`)==='Critical');
  check('status label translates', run(sb,`corrStatusLabel('in_progress')`)==='In progress');
  check('critical maps to sev-critical class', run(sb,`sevClass('critical')`)==='sev-critical');
  check('unknown severity falls back to low', run(sb,`sevClass('zzz')`)==='sev-low');

  console.log('\n=== Corrective report rows (period filtered) ===');
  run(sb,`STATE.reportGenId='g1'; STATE.reportMode='range'; STATE.reportFrom='2026-07-01'; STATE.reportTo='2026-07-31';`);
  let cr = run(sb,`corrReportRows('g1').map(c=>c.id)`);
  check('both July events for g1 included', JSON.stringify(cr)==='["c1","c2"]', JSON.stringify(cr));
  run(sb,`STATE.reportFrom='2026-07-10'; STATE.reportTo='2026-07-31';`);
  cr = run(sb,`corrReportRows('g1').map(c=>c.id)`);
  check('date filter excludes earlier event', JSON.stringify(cr)==='["c2"]', JSON.stringify(cr));
  cr = run(sb,`corrReportRows('g2').length`);
  check('g2 June event excluded from July range', cr===0, 'got '+cr);

  console.log('\n=== Fleet report ===');
  const fleet = run(sb,'fleetReportRows()');
  check('one row per generator', fleet.length===2, 'got '+fleet.length);
  check('g1 latest hours = 1290', fleet[0].hours===1290, JSON.stringify(fleet[0].hours));
  check('g1 hrsPerDay from maintenance doc = 17', fleet[0].hrsPerDay===17, ''+fleet[0].hrsPerDay);
  check('g2 defaults hrsPerDay to 24', fleet[1].hrsPerDay===24, ''+fleet[1].hrsPerDay);
  check('g1 readings counted', fleet[0].readingsCount===2, ''+fleet[0].readingsCount);
  check('g1 open faults = 1', fleet[0].openFaults===1, ''+fleet[0].openFaults);
  check('g1 total faults = 2', fleet[0].totalFaults===2, ''+fleet[0].totalFaults);
  check('g1 downtime summed = 4.5', fleet[0].downtime===4.5, ''+fleet[0].downtime);
  check('g2 open faults = 1 (in_progress counts as open)', fleet[1].openFaults===1, ''+fleet[1].openFaults);

  console.log('\n=== Maintenance report rows ===');
  const mr = run(sb,`maintReportRows('g1')`);
  check('rows = 4 time + 7 hours = 11', mr.length===11, 'got '+mr.length);
  check('first rows are time-based', mr[0].group===run(sb,`t('maint_time')`));
  check('hours rows present', mr[4].group===run(sb,`t('maint_hours')`));
  const h250 = mr.find(r=>r.interval==='250 hr');
  check('250hr due computed from its own baseline (1100+250=1350)', /1350/.test(h250.due), h250.due);

  console.log('\n=== buildReportTable: all four types ===');
  for(const [type, minCols] of [['readings',5],['maint',5],['corr',10],['fleet',11]]){
    run(sb,`STATE.reportType='${type}';`);
    const rt = run(sb,'buildReportTable()');
    check(`${type}: has title`, !!rt.title && rt.title.length>3, rt.title);
    check(`${type}: headers length >= ${minCols}`, rt.headers.length>=minCols, 'got '+rt.headers.length);
    check(`${type}: bad-mask rows align with body rows`, rt.bad.length===rt.body.length,
          `body ${rt.body.length} vs bad ${rt.bad.length}`);
    if(rt.body.length){
      check(`${type}: each row width matches headers`,
        rt.body.every(r=>r.length===rt.headers.length),
        'row widths: '+JSON.stringify(rt.body.map(r=>r.length)));
    }
    check(`${type}: summary present`, typeof rt.summary==='string' && rt.summary.length>0);
  }

  console.log('\n=== Fleet report ignores generator selection ===');
  run(sb,`STATE.reportType='fleet'; STATE.reportGenId='g1';`);
  let rtF = run(sb,'buildReportTable()');
  check('fleet covers all generators regardless of selection', rtF.body.length===2, 'got '+rtF.body.length);

  console.log('\n=== Corrective report marks high/critical severity ===');
  run(sb,`STATE.reportType='corr'; STATE.reportGenId='g1'; STATE.reportFrom='2026-07-01'; STATE.reportTo='2026-07-31';`);
  const rtC = run(sb,'buildReportTable()');
  const sevCol = 3;
  check('high severity row flagged in bad-mask', rtC.bad[0][sevCol]===true, JSON.stringify(rtC.bad[0]));
  check('low severity row not flagged', rtC.bad[1][sevCol]===false, JSON.stringify(rtC.bad[1]));

  console.log('\n=== CSV export works for a non-readings report ===');
  run(sb,`STATE.reportType='fleet'; exportReportCSV();`);
  await new Promise(r=>setTimeout(r,20));
  const csv = sb.__blob ? sb.__blob.content : '';
  const lines = csv.replace(/^\ufeff/,'').split('\n');
  check('fleet CSV has header + 2 rows', lines.length===3, 'got '+lines.length);
  check('fleet CSV BOM present', csv.charCodeAt(0)===0xFEFF);

  console.log('\n=== Empty report handled safely ===');
  run(sb,`STATE.reportType='corr'; STATE.reportGenId='g2'; STATE.reportFrom='2026-07-20'; STATE.reportTo='2026-07-31';`);
  const rtE = run(sb,'buildReportTable()');
  check('empty flag set when no rows', rtE.empty===true && rtE.body.length===0);

  console.log('\n=== Serial fault IDs (Cor-813, Cor-814, ...) ===');
  run(sb,`STATE.corrective = [];`);
  check('first fault ID starts at Cor-813', run(sb,`FAULT_ID_PREFIX + nextFaultSeq()`)==='Cor-813');
  run(sb,`STATE.corrective = [{id:'x1',faultSeq:813}];`);
  check('next ID increments to Cor-814', run(sb,`FAULT_ID_PREFIX + nextFaultSeq()`)==='Cor-814');
  run(sb,`STATE.corrective = [{id:'x1',faultSeq:813},{id:'x2',faultSeq:820}];`);
  check('next ID follows the highest existing sequence, not just the count', run(sb,`nextFaultSeq()`)===821, 'got '+run(sb,`nextFaultSeq()`));
  run(sb,`STATE.corrective = [{id:'x1'},{id:'x2',faultSeq:null}];`);
  check('faults with no faultSeq (legacy records) are ignored, not treated as 0', run(sb,`nextFaultSeq()`)===813);

  console.log('\n=== Backfilling Fault IDs onto legacy records ===');
  run(sb,`
    STATE.corrective = [
      {id:'old2', date:'2026-02-01'},
      {id:'old1', date:'2026-01-01'},
      {id:'hasOne', date:'2026-03-01', faultSeq:900, faultId:'Cor-900'}
    ];
  `);
  check('faultsWithoutId finds only the legacy records', run(sb,`faultsWithoutId().length`)===2);
  const backfilled = await run(sb,`backfillFaultIds()`);
  await new Promise(r=>setTimeout(r,20));
  check('backfillFaultIds reports how many it assigned', backfilled===2, 'got '+backfilled);
  const updatedIds = sb.__updated.filter(u=>u.col==='corrective');
  check('backfill writes went to the two legacy docs', updatedIds.length===2, JSON.stringify(updatedIds));
  const byDocId = {}; updatedIds.forEach(u=>byDocId[u.id]=u.data);
  check('older fault (old1, Jan) gets the lower number', byDocId.old1 && byDocId.old1.faultId==='Cor-901', JSON.stringify(byDocId.old1));
  check('newer fault (old2, Feb) gets the next number', byDocId.old2 && byDocId.old2.faultId==='Cor-902', JSON.stringify(byDocId.old2));
  check('the already-numbered fault was left untouched', !byDocId.hasOne);

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
