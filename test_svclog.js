const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

function build(){
  const collections={generators:{},readings:{},maintenance:{},corrective:{},servicelog:{}};
  const added=[];
  const fb={ initializeApp(){}, auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb({uid:'x'}),0);},async signInAnonymously(){}};},
    firestore(){ return { collection(n){collections[n]=collections[n]||{};return{
      onSnapshot(cb){setTimeout(()=>cb({docs:[],empty:true}),0);return()=>{};},
      async add(d){const id='a'+(Object.keys(collections[n]).length+1);collections[n][id]={...d};added.push({col:n,data:d});return{id};},
      doc(id){return{async set(d){collections[n][id]=Object.assign({},collections[n][id]||{},d);},async update(d){Object.assign(collections[n][id]=collections[n][id]||{},d);},async delete(){delete collections[n][id];}};},
      limit(){return{async get(){return{empty:true,docs:[]};}};} };},
      batch(){return{set(){},async commit(){}};}, async enablePersistence(){} }; } };
  fb.firestore.FieldValue={serverTimestamp:()=>'TS'};
  function mk(id){return{id,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,addEventListener(){},appendChild(){},removeChild(){},click(){}};}
  const els={}; let blob=null; const sheets=[];
  const XLSX={utils:{aoa_to_sheet:(a)=>({__aoa:a}),book_new:()=>({sheets:[]}),
                     book_append_sheet:(wb,ws,name)=>{sheets.push({name, rows: ws.__aoa.length});}},
              writeFile:()=>{}};
  const sb={console,Date,Math,JSON,Promise,Symbol,String,Number,Array,Object,RegExp,parseFloat,parseInt,isNaN,XLSX,
    setTimeout:(f,m)=>setTimeout(f,Math.min(m||0,5)),
    Blob:class{constructor(p){this.content=p.join('');blob=this;}}, URL:{createObjectURL(){return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},getAttribute(){}}},
    firebase:fb};
  sb.window=sb; sb.__added=added; sb.__collections=collections; sb.__sheets=sheets;
  Object.defineProperty(sb,'__blob',{get:()=>blob});
  vm.createContext(sb); return {sb};
}
function run(sb,c){return vm.runInContext(c,sb);}

(async()=>{
  const {sb}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));

  run(sb,`
    STATE.lang='en';
    STATE.generators=[{id:'g1',name:'FAO GEN-01',client:'FAO'},{id:'g2',name:'UNHCR-PER-03',client:'UNHCR'}];
    STATE.readings=[{id:'r1',genId:'g1',timestamp:'2026-07-08T08:00:00Z',hours:1000}];
    STATE.maintenance=[{id:'g1',hrsPerDay:17},{id:'g2',hrsPerDay:24}];
    STATE.corrective=[];
    STATE.svclog=[
      {id:'s1',genId:'g1',kind:'hours',intervalKey:'250',intervalLabel:'250 hr',date:'2024-09-10',hoursAtService:200,by:'Ahmed'},
      {id:'s2',genId:'g1',kind:'hours',intervalKey:'250',intervalLabel:'250 hr',date:'2025-03-15',hoursAtService:450,by:'Ahmed'},
      {id:'s3',genId:'g1',kind:'hours',intervalKey:'250',intervalLabel:'250 hr',date:'2026-07-08',hoursAtService:1000,by:'Ahmed'},
      {id:'s4',genId:'g1',kind:'time',intervalKey:'weekly',intervalLabel:'Weekly',date:'2026-07-20',hoursAtService:1180,by:'Saleh'},
      {id:'s5',genId:'g2',kind:'hours',intervalKey:'500',intervalLabel:'500 hr',date:'2025-11-02',hoursAtService:3000,by:'Saleh',backfilled:true}
    ];
  `);

  console.log('\\n=== 2-YEAR SERVICE HISTORY (the actual question) ===');
  run(sb,`STATE.reportType='svclog'; STATE.reportGenId='g1'; STATE.reportMode='range';
          STATE.reportFrom='2024-07-01'; STATE.reportTo='2026-07-31';`);
  let rows = run(sb,`svcLogRows('g1').map(x=>x.date)`);
  check('2-year range returns all 4 services for g1',
        rows.length===4, JSON.stringify(rows));
  check('sorted newest first', rows[0]==='2026-07-20' && rows[3]==='2024-09-10', JSON.stringify(rows));

  console.log('\\n=== Period filtering works ===');
  run(sb,`STATE.reportFrom='2026-01-01'; STATE.reportTo='2026-12-31';`);
  rows = run(sb,`svcLogRows('g1').map(x=>x.date)`);
  check('2026-only range returns 2 services', rows.length===2, JSON.stringify(rows));
  run(sb,`STATE.reportFrom='2024-07-01'; STATE.reportTo='2026-07-31';`);

  console.log('\\n=== All-generators service history ===');
  rows = run(sb,`svcLogRows('__all__').length`);
  check('fleet-wide returns all 5 entries', rows===5, 'got '+rows);

  console.log('\\n=== Service history export table ===');
  let rt = run(sb,`STATE.reportGenId='g1'; buildReportTable()`);
  check('svclog export not empty', rt.empty===false);
  check('has 4 body rows', rt.body.length===4, 'got '+rt.body.length);
  check('row width matches headers', rt.body.every(r=>r.length===rt.headers.length));
  check('title mentions Service History', /Service History/i.test(rt.title), rt.title);
  rt = run(sb,`STATE.reportGenId='__all__'; buildReportTable()`);
  check('all-gens adds a generator column', rt.headers.length===7, 'got '+rt.headers.length);
  check('all-gens has 5 rows', rt.body.length===5, 'got '+rt.body.length);
  check('generator names resolved in rows', rt.body.some(r=>r.indexOf('UNHCR-PER-03')>=0), JSON.stringify(rt.body[0]));

  console.log('\\n=== All-generators FAULT report ===');
  run(sb,`STATE.corrective=[
      {id:'c1',genId:'g1',date:'2025-05-01',type:'failure',severity:'high',status:'closed',description:'A',downtimeHrs:2},
      {id:'c2',genId:'g2',date:'2026-02-11',type:'breakdown',severity:'critical',status:'open',description:'B',downtimeHrs:6}
    ]; STATE.reportType='corr'; STATE.reportGenId='__all__';
    STATE.reportFrom='2024-07-01'; STATE.reportTo='2026-07-31';`);
  rt = run(sb,'buildReportTable()');
  check('fleet fault report includes both generators', rt.body.length===2, 'got '+rt.body.length);
  check('generator column present (12 base + 1)', rt.headers.length===13, 'got '+rt.headers.length);
  check('severity flagged at shifted index', rt.bad.some(r=>r.indexOf(true)>=0), JSON.stringify(rt.bad));
  run(sb,`STATE.reportGenId='g1';`);
  rt = run(sb,'buildReportTable()');
  check('single-gen fault report has no generator column (12)', rt.headers.length===12, 'got '+rt.headers.length);

  console.log('\\n=== Service log is written when a service is performed ===');
  const before = run(sb,'__added.length');
  await run(sb,`logServicePerformed('g1',[
    {kind:'hours',key:250,label:'250 hr',date:'2026-07-23',hoursAtService:1255,by:'Ahmed'},
    {kind:'hours',key:125,label:'125 hr',date:'2026-07-23',hoursAtService:1255,by:'Ahmed'}
  ])`);
  await new Promise(r=>setTimeout(r,30));
  const addedSvc = run(sb,`__added.filter(a=>a.col==='servicelog').length`);
  check('two log entries written (nested service)', addedSvc===2, 'got '+addedSvc);
  const rec = run(sb,`__added.filter(a=>a.col==='servicelog')[0].data`);
  check('entry stores generator, interval, date, hours, by',
        rec.genId==='g1' && rec.intervalKey==='250' && rec.date==='2026-07-23' && rec.hoursAtService===1255 && rec.by==='Ahmed',
        JSON.stringify(rec));

  console.log('\\n=== Backfilled entries are marked ===');
  await run(sb,`logServicePerformed('g1',[{kind:'time',key:'weekly',label:'Weekly',date:'2025-01-05',hoursAtService:300,by:'X',backfilled:true}])`);
  await new Promise(r=>setTimeout(r,20));
  const bf = run(sb,`__added.filter(a=>a.col==='servicelog').pop().data.backfilled`);
  check('backfilled flag persisted', bf===true, 'got '+bf);

  console.log('\\n=== Full data backup workbook ===');
  run(sb,'exportFullBackup()');
  const sheets = run(sb,'__sheets.map(s=>s.name)');
  check('backup has all 5 sheets',
        JSON.stringify(sheets)===JSON.stringify(['Generators','Readings','ServiceHistory','Faults','MaintBaselines']),
        JSON.stringify(sheets));
  const svcSheet = run(sb,`__sheets.find(s=>s.name==='ServiceHistory').rows`);
  check('service history sheet has header + 5 rows', svcSheet===6, 'got '+svcSheet);

  console.log('\\n=== Empty service history handled ===');
  run(sb,`STATE.reportType='svclog'; STATE.reportGenId='g2'; STATE.reportFrom='2026-07-01'; STATE.reportTo='2026-07-31';`);
  rt = run(sb,'buildReportTable()');
  check('empty flag when no services in period', rt.empty===true && rt.body.length===0);

  console.log(`\\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
