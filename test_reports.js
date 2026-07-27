const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

// minimal firebase + dom stubs so SOURCE runs
function build(){
  const collections={generators:{},readings:{}}, listeners={};
  const fb={
    initializeApp(){}, auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb({uid:'x'}),0);},async signInAnonymously(){}};},
    firestore(){ const db={ collection(n){collections[n]=collections[n]||{};listeners[n]=listeners[n]||new Set();return{
      onSnapshot(cb){listeners[n].add(cb);setTimeout(()=>cb({docs:Object.entries(collections[n]).map(([id,data])=>({id,data:()=>({...data})})),empty:!Object.keys(collections[n]).length}),0);return()=>{};},
      async add(d){const id='a'+Math.random();collections[n][id]={...d};return{id};}, doc(id){return{async set(d){collections[n][id]=d;},async update(d){Object.assign(collections[n][id],d);},async delete(){delete collections[n][id];}};},
      limit(){return{async get(){const e=Object.entries(collections[n]);return{empty:!e.length,docs:e.map(([id,data])=>({id,data:()=>data}))};}};} };}, batch(){const o=[];return{set(r,d){o.push({r,d});},async commit(){o.forEach(({r,d})=>{});}};}, async enablePersistence(){} }; return db; }
  };
  fb.firestore.FieldValue={serverTimestamp:()=>new Date().toISOString()};
  const els={};
  function mk(id){return{id,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,addEventListener(){}, appendChild(){},removeChild(){},click(){}};}
  const sb={console,Date,Math,JSON,Promise,Symbol,setTimeout:(f,m)=>setTimeout(f,Math.min(m,5)),
    Blob:class{constructor(p){this.content=p.join('');}}, URL:{createObjectURL(b){sb.__blob=b;return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[], querySelector:()=>null, documentElement:{setAttribute(){},getAttribute(){}},createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}}},
    firebase:fb};
  sb.window=sb; vm.createContext(sb); return {sb,collections};
}
function run(sb,c){return vm.runInContext(c,sb);}

(async()=>{
  const {sb,collections}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));

  // Inject controlled readings across several days for one generator
  run(sb,`
    STATE.generators=[{id:'g1',name:'UNHCR Genset 1',client:'UNHCR'},{id:'g2',name:'FAO Genset 1',client:'FAO'}];
    STATE.readings=[
      {id:'a',genId:'g1',timestamp:'2026-07-10T09:00:00.000Z',tech:'Ali',hours:100,vL1:'400',coolantT:'80',battV:'26',fuel:'60'},
      {id:'b',genId:'g1',timestamp:'2026-07-12T09:00:00.000Z',tech:'Ali',hours:130,vL1:'305',coolantT:'103',battV:'22',fuel:'8'},
      {id:'c',genId:'g1',timestamp:'2026-07-15T09:00:00.000Z',tech:'Sara',hours:160,vL1:'401',coolantT:'82',battV:'26',fuel:'55'},
      {id:'d',genId:'g2',timestamp:'2026-07-12T09:00:00.000Z',tech:'Ali',hours:50,vL1:'400',coolantT:'78',battV:'27',fuel:'70'}
    ];
    STATE.reportGenId='g1';
  `);

  console.log('\n=== Single-day report ===');
  run(sb,`STATE.reportMode='day'; STATE.reportDay='2026-07-12';`);
  let rows=run(sb,'readingsForReport()');
  check('day filter returns only that day for that generator', rows.length===1 && rows[0].id==='b', `got ${rows.length}`);

  console.log('\n=== Date-range report ===');
  run(sb,`STATE.reportMode='range'; STATE.reportFrom='2026-07-10'; STATE.reportTo='2026-07-13';`);
  rows=run(sb,'readingsForReport()');
  check('range filter returns 10th+12th only (not 15th)', rows.length===2 && rows.map(r=>r.id).join()==='a,b', rows.map(r=>r.id).join());
  check('range excludes other generator g2', rows.every(r=>r.genId==='g1'));

  console.log('\n=== Full range includes all g1 ===');
  run(sb,`STATE.reportFrom='2026-07-01'; STATE.reportTo='2026-07-31';`);
  rows=run(sb,'readingsForReport()');
  check('wide range returns all 3 g1 readings in date order', rows.length===3 && rows.map(r=>r.id).join()==='a,b,c');

  console.log('\n=== out-of-range detection per cell ===');
  const bad=run(sb,`[...outOfRangeKeys(STATE.readings[1])]`); // reading b
  check('flags vL1, coolantT, battV, fuel on the bad reading', ['vL1','coolantT','battV','fuel'].every(k=>bad.includes(k)), bad.join());
  const good=run(sb,`[...outOfRangeKeys(STATE.readings[0])]`);
  check('no flags on the normal reading', good.length===0, good.join());

  console.log('\n=== CSV export includes flags column ===');
  run(sb,`STATE.lang='en'; STATE.reportType='readings'; STATE.reportMode='range'; STATE.reportFrom='2026-07-01'; STATE.reportTo='2026-07-31'; exportReportCSV();`);
  await new Promise(r=>setTimeout(r,10));
  const csv=sb.__blob.content;
  const lines=csv.replace(/^\ufeff/,'').split('\n');
  check('header has a flags column', /Flags$/i.test(lines[0]), lines[0].slice(-40));
  check('4 lines (header + 3 readings)', lines.length===4, `got ${lines.length}`);
  check('bad reading row lists its out-of-range items in flags', /Voltage L1/.test(lines[2]) && /Coolant temp/.test(lines[2]) && /Fuel level/.test(lines[2]), lines[2].slice(-80));
  check('good reading row has empty flags', /,$/.test(lines[1]), JSON.stringify(lines[1].slice(-20)));
  check('UTF-8 BOM present for Excel', csv.charCodeAt(0)===0xFEFF);

  console.log('\n=== empty period handled ===');
  run(sb,`STATE.reportMode='day'; STATE.reportDay='2026-01-01';`);
  rows=run(sb,'readingsForReport()');
  check('empty period returns no rows (no crash)', rows.length===0);

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
