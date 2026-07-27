const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

function build(){
  const collections={generators:{},readings:{},maintenance:{},corrective:{}}, listeners={};
  const fb={ initializeApp(){}, auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb({uid:'x'}),0);},async signInAnonymously(){}};},
    firestore(){ return { collection(n){collections[n]=collections[n]||{};listeners[n]=listeners[n]||new Set();return{
      onSnapshot(cb){listeners[n].add(cb);setTimeout(()=>cb({docs:[],empty:true}),0);return()=>{};},
      async add(d){return{id:'x'};}, doc(){return{async set(){},async update(){},async delete(){}};},
      limit(){return{async get(){return{empty:true,docs:[]};}};} };},
      batch(){return{set(){},async commit(){}};}, async enablePersistence(){} }; } };
  fb.firestore.FieldValue={serverTimestamp:()=>'TS'};
  function mk(id){return{id,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,addEventListener(){},appendChild(){},removeChild(){},click(){}};}
  const els={};
  const sb={console,Date,Math,JSON,Promise,Symbol,String,Number,Array,Object,RegExp,parseFloat,parseInt,isNaN,
    setTimeout:(f,m)=>setTimeout(f,Math.min(m||0,5)),
    Blob:class{constructor(p){this.content=p.join('');}}, URL:{createObjectURL(){return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},getAttribute(){}}},
    firebase:fb};
  sb.window=sb; vm.createContext(sb); return {sb};
}
function run(sb,c){return vm.runInContext(c,sb);}
function isoOffset(days){ const d=new Date(); d.setDate(d.getDate()+days); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }

(async()=>{
  const {sb}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));

  console.log('\n=== REAL CASE: FAO Genset 1 — 17 hrs/day, 250 hr service done 15 days ago ===');
  // 250 hrs / 17 per day = 14.7 -> 15 days. Service done 15 days ago => due today.
  const doneDate = isoOffset(-15);
  let s = run(sb,`hourStatus(250, {doneAtHrs:1000, date:'${doneDate}'}, 1000, 17)`);
  console.log('  (service date ' + doneDate + ', hours reading not updated since)');
  check('due date is anchored to service date, not today',
        s.dueFromDate===true, 'dueFromDate='+s.dueFromDate);
  check('due date = service date + 15 days = today',
        s.foreDays===0, 'foreDays='+s.foreDays+' dueDate='+(s.dueDate&&s.dueDate.toDateString()));
  check('status is "soon"/"over" (not falsely OK) even though hours reading is stale',
        s.state==='soon'||s.state==='over', 'state='+s.state);

  console.log('\n=== Same service, but done only 5 days ago ===');
  s = run(sb,`hourStatus(250, {doneAtHrs:1000, date:'${isoOffset(-5)}'}, 1085, 17)`);
  check('due in 10 days (15 - 5)', s.foreDays===10, 'foreDays='+s.foreDays);
  check('status OK', s.state==='ok', 'state='+s.state);

  console.log('\n=== Overdue by date: service done 20 days ago ===');
  s = run(sb,`hourStatus(250, {doneAtHrs:1000, date:'${isoOffset(-20)}'}, 1000, 17)`);
  check('reports overdue by 5 days', s.foreDays===-5, 'foreDays='+s.foreDays);
  check('state = over', s.state==='over', 'state='+s.state);

  console.log('\n=== 24 hrs/day generator (default) ===');
  // 250 / 24 = 10.4 -> 10 days
  s = run(sb,`hourStatus(250, {doneAtHrs:500, date:'${isoOffset(-10)}'}, 500, 24)`);
  check('250hr at 24h/day = due after ~10 days -> due today', s.foreDays===0, 'foreDays='+s.foreDays);

  console.log('\n=== Different intervals, FAO Genset 1 (17 h/day) ===');
  const expect = [[125,7],[250,15],[500,29],[1000,59]];
  expect.forEach(([iv,days])=>{
    const r = run(sb,`hourStatus(${iv}, {doneAtHrs:0, date:'${isoOffset(0)}'}, 0, 17)`);
    check(`${iv} hr -> due in ~${days} days`, r.foreDays===days, 'got '+r.foreDays);
  });

  console.log('\n=== Hours reading still drives the hours column ===');
  s = run(sb,`hourStatus(250, {doneAtHrs:1000, date:'${isoOffset(-5)}'}, 1200, 17)`);
  check('next due at 1250 hrs', s.nextAtHrs===1250, 'got '+s.nextAtHrs);
  check('50 hours remaining', s.deltaHrs===50, 'got '+s.deltaHrs);

  console.log('\n=== Hours reached early triggers "soon" even if date is far off ===');
  s = run(sb,`hourStatus(250, {doneAtHrs:1000, date:'${isoOffset(-1)}'}, 1245, 17)`);
  check('only 5 hrs left -> soon/over regardless of date', s.state==='soon'||s.state==='over', 'state='+s.state);

  console.log('\n=== No service date recorded: falls back to projecting from today ===');
  s = run(sb,`hourStatus(250, {doneAtHrs:1000}, 1200, 17)`);
  check('no date -> dueFromDate false', s.dueFromDate===false);
  check('projects 50hrs / 17 = ~3 days ahead', s.foreDays===3, 'got '+s.foreDays);

  console.log('\n=== No hours reading at all, but service date known ===');
  s = run(sb,`hourStatus(250, {date:'${isoOffset(-15)}'}, null, 17)`);
  check('still produces a due date from the service date', s.dueDate!==null);
  check('and reports it as due now', s.foreDays===0, 'foreDays='+s.foreDays);

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
