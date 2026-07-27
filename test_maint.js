const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

function build(){
  const collections={generators:{},readings:{},maintenance:{}}, listeners={};
  const fb={ initializeApp(){}, auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb({uid:'x'}),0);},async signInAnonymously(){}};},
    firestore(){ const db={ collection(n){collections[n]=collections[n]||{};listeners[n]=listeners[n]||new Set();return{
      onSnapshot(cb){listeners[n].add(cb);setTimeout(()=>cb({docs:Object.entries(collections[n]).map(([id,data])=>({id,data:()=>({...data})})),empty:!Object.keys(collections[n]).length}),0);return()=>{};},
      async add(d){const id='a'+Math.random();collections[n][id]={...d};return{id};}, doc(id){return{async set(d,o){collections[n][id]=Object.assign({},collections[n][id]||{},d);},async update(d){Object.assign(collections[n][id],d);},async delete(){delete collections[n][id];}};},
      limit(){return{async get(){const e=Object.entries(collections[n]);return{empty:!e.length,docs:e.map(([id,data])=>({id,data:()=>data}))};}};} };}, batch(){const o=[];return{set(r,d){o.push({r,d});},async commit(){}};}, async enablePersistence(){} }; return db; } };
  fb.firestore.FieldValue={serverTimestamp:()=>new Date().toISOString()};
  function mk(id){return{id,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,addEventListener(){},appendChild(){},removeChild(){},click(){}};}
  const els={};
  const sb={console,Date,Math,JSON,Promise,Symbol,setTimeout:(f,m)=>setTimeout(f,Math.min(m,5)),
    Blob:class{constructor(p){this.content=p.join('');}}, URL:{createObjectURL(){return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},getAttribute(){}}},
    firebase:fb};
  sb.window=sb; vm.createContext(sb); return {sb};
}
function run(sb,c){return vm.runInContext(c,sb);}
function iso(daysFromToday){ const d=new Date(); d.setDate(d.getDate()+daysFromToday); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }

(async()=>{
  const {sb}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));

  console.log('\n=== Time-based status ===');
  // weekly interval = 7 days
  const wk = run(sb,'TIME_INTERVALS.find(i=>i.key==="weekly")');
  // done 10 days ago -> overdue by 3
  let s = run(sb,`timeStatus(TIME_INTERVALS[0], {lastDone:${JSON.stringify(iso(-10))}})`);
  check('weekly done 10d ago = overdue', s.state==='over' && s.deltaDays===-3, JSON.stringify(s));
  // done 5 days ago -> due in 2 days -> soon
  s = run(sb,`timeStatus(TIME_INTERVALS[0], {lastDone:${JSON.stringify(iso(-5))}})`);
  check('weekly done 5d ago = soon (2 days left)', s.state==='soon' && s.deltaDays===2, JSON.stringify(s));
  // done today -> due in 7 -> ok
  s = run(sb,`timeStatus(TIME_INTERVALS[0], {lastDone:${JSON.stringify(iso(0))}})`);
  check('weekly done today = ok (7 left)', s.state==='ok' && s.deltaDays===7, JSON.stringify(s));
  // never done
  s = run(sb,`timeStatus(TIME_INTERVALS[0], null)`);
  check('never done = never state', s.state==='never');
  // yearly = 365
  s = run(sb,`timeStatus(TIME_INTERVALS[3], {lastDone:${JSON.stringify(iso(-360))}})`);
  check('yearly done 360d ago = soon (5 left)', s.state==='soon' && s.deltaDays===5, JSON.stringify(s));

  console.log('\n=== Hours-based status ===');
  // 250hr interval, done at 4000, current 4200 -> next at 4250, 50 hrs left -> ok
  s = run(sb,`hourStatus(250, {doneAtHrs:4000}, 4200, 17)`);
  check('250hr: 50 hrs remaining = ok', s.state==='ok' && s.deltaHrs===50 && s.nextAtHrs===4250, JSON.stringify(s));
  // forecast: 50 hrs / 17 per day = ~3 days
  check('250hr forecast ~3 days at 17hr/day', s.foreDays===3, 'foreDays='+s.foreDays);
  // done at 4000, current 4240 -> 10 hrs left -> soon
  s = run(sb,`hourStatus(250, {doneAtHrs:4000}, 4240, 7)`);
  check('250hr: 10 hrs remaining = soon', s.state==='soon' && s.deltaHrs===10, JSON.stringify(s));
  // forecast 10/7 = ~1 day
  check('forecast ~1 day at 7hr/day', s.foreDays===1, 'foreDays='+s.foreDays);
  // overdue: done at 4000, current 4300 -> next 4250, -50 -> over
  s = run(sb,`hourStatus(250, {doneAtHrs:4000}, 4300, 17)`);
  check('250hr: past next = overdue', s.state==='over' && s.deltaHrs===-50, JSON.stringify(s));
  // no baseline (never done): done treated as 0, current 130, 125 interval -> next 125, overdue by 5
  s = run(sb,`hourStatus(125, null, 130, 17)`);
  check('125hr never done, cur 130 = overdue 5', s.state==='over' && s.deltaHrs===-5 && s.nextAtHrs===125, JSON.stringify(s));
  // no hours reading at all
  s = run(sb,`hourStatus(125, null, null, 17)`);
  check('no current hours = nohrs state', s.state==='nohrs');
  // no hrsPerDay -> defaults to 24 h/day for forecast + due date
  s = run(sb,`hourStatus(250, {doneAtHrs:4000}, 4200, null)`);
  check('no hrs/day defaults to 24 for forecast', s.foreDays===2, 'foreDays='+s.foreDays);
  check('due date is produced even with no hrs/day set', s.dueDate!==null && s.dueDate!==undefined);
  // due date correctness: 50 hrs remaining at 17/day = ~3 days from today
  s = run(sb,`hourStatus(250, {doneAtHrs:4000}, 4200, 17)`);
  const today = new Date(); today.setHours(0,0,0,0);
  const expectedDue = new Date(today); expectedDue.setDate(expectedDue.getDate()+3);
  check('due date = today + forecast days (17h/day, 50hrs left = +3d)', new Date(s.dueDate).toDateString()===expectedDue.toDateString(), s.dueDate+' vs '+expectedDue);

  console.log('\n=== latestHoursFor picks most recent ===');
  run(sb,`
    STATE.generators=[{id:'g1',name:'FAO Genset 1',client:'FAO'}];
    STATE.readings=[
      {id:'a',genId:'g1',timestamp:'2026-07-10T09:00:00Z',hours:1000},
      {id:'b',genId:'g1',timestamp:'2026-07-15T09:00:00Z',hours:1085},
      {id:'c',genId:'g1',timestamp:'2026-07-12T09:00:00Z',hours:1034}
    ];
  `);
  const lh = run(sb,`latestHoursFor('g1')`);
  check('latest hours = most recent timestamp (1085)', lh===1085, 'got '+lh);

  console.log('\n=== fleet counts ===');
  run(sb,`
    STATE.maintenance=[{id:'g1', hrsPerDay:17, hours:{'125':{doneAtHrs:900}}, time:{weekly:{lastDone:${JSON.stringify(iso(-10))}}}}];
  `);
  const fc = run(sb,'fleetMaintCounts()');
  check('fleet counts returns object with over/soon numbers', typeof fc.over==='number' && typeof fc.soon==='number', JSON.stringify(fc));

  console.log('\n=== Nesting (larger service includes smaller) ===');
  let sm = run(sb,'smallerHourIntervals(500)');
  check('500 hr includes 250 and 125', JSON.stringify(sm)==='[125,250]', JSON.stringify(sm));
  sm = run(sb,'smallerHourIntervals(1000)');
  check('1000 hr includes 500,250,125', JSON.stringify(sm)==='[125,250,500]', JSON.stringify(sm));
  sm = run(sb,'smallerHourIntervals(125)');
  check('125 hr (smallest) includes nothing', JSON.stringify(sm)==='[]', JSON.stringify(sm));
  sm = run(sb,'smallerHourIntervals(12000)');
  check('12000 hr includes all six smaller', sm.length===6, JSON.stringify(sm));

  console.log('\n=== Per-service baseline drives due ===');
  // each interval computes from ITS OWN doneAtHrs
  let a = run(sb,`hourStatus(250, {doneAtHrs:1000}, 1200, 24)`);
  let b = run(sb,`hourStatus(500, {doneAtHrs:800}, 1200, 24)`);
  check('250 from its own baseline 1000 -> due 1250', a.nextAtHrs===1250, 'got '+a.nextAtHrs);
  check('500 from its own baseline 800 -> due 1300', b.nextAtHrs===1300, 'got '+b.nextAtHrs);
  check('two services have independent due points', a.nextAtHrs!==b.nextAtHrs);

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
