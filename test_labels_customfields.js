const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

function build(){
  const collections={generators:{},readings:{},maintenance:{},corrective:{},servicelog:{},settings:{},customfields:{}}, listeners={};
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
  const els={};
  function mk(id){return{id,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,addEventListener(){},appendChild(){},removeChild(){},click(){}};}
  let blob=null;
  const sb={console,Date,Math,JSON,Promise,Symbol,String,Number,Array,Object,RegExp,parseFloat,parseInt,isNaN,
    setTimeout:(f,m)=>setTimeout(f,Math.min(m||0,5)),
    Blob:class{constructor(p){this.content=p.join('');blob=this;}}, URL:{createObjectURL(){return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},getAttribute(){}}},
    firebase:fb};
  sb.window=sb; Object.defineProperty(sb,'__blob',{get:()=>blob});
  sb.__added=added; sb.__updated=updated; sb.__deleted=deleted; sb.__collections=collections; sb.__els=els;
  vm.createContext(sb); return {sb};
}
function run(sb,c){return vm.runInContext(c,sb);}

(async()=>{
  const {sb}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));
  run(sb,`STATE.lang='en';`);

  console.log('\n=== Label overrides: t() precedence ===');
  check('no override falls back to built-in default', run(sb,`t('tab_corr')`)==='Faults');
  run(sb,`STATE.labelOverrides = { tab_corr: { en: 'Breakdowns' } };`);
  check('override wins over built-in default', run(sb,`t('tab_corr')`)==='Breakdowns');
  run(sb,`STATE.labelOverrides = { tab_corr: { en: '' } };`);
  check('blank override falls back to default (not empty string)', run(sb,`t('tab_corr')`)==='Faults');
  run(sb,`STATE.labelOverrides = {};`);
  check('unknown key falls back to the key itself', run(sb,`t('not_a_real_key')`)==='not_a_real_key');

  console.log('\n=== Label categorization ===');
  check('tab_ prefixed key categorized as tabs', run(sb,`categoryForLabelKey('tab_new')`)==='cat_tabs');
  check('corr_ prefixed key categorized as faults', run(sb,`categoryForLabelKey('corr_desc')`)==='cat_faults');
  check('f_ prefixed key categorized as readings', run(sb,`categoryForLabelKey('f_generator')`)==='cat_readings');
  check('unmatched key falls into general bucket', run(sb,`categoryForLabelKey('brandSub')`)==='cat_general');
  check('every I18N key is categorized into a known bucket', run(sb,`
    allLabelKeys().every(k => LABEL_CATEGORY_ORDER.includes(categoryForLabelKey(k)))
  `));

  console.log('\n=== Custom fields: definitions & filtering ===');
  run(sb,`STATE.customFields = [
    { id:'f1', section:'corrective', key:'cf_a', labelEn:'Root Cause', labelAr:'', type:'select', options:['Mechanical','Electrical'], active:true },
    { id:'f2', section:'corrective', key:'cf_b', labelEn:'Inactive Field', type:'text', active:false },
    { id:'f3', section:'reading', key:'cf_c', labelEn:'Weather', type:'text', active:true },
  ];`);
  check('customFieldsFor filters by section and excludes inactive fields', run(sb,`customFieldsFor('corrective').length`)===1);
  check('customFieldsFor for unrelated section is empty', run(sb,`customFieldsFor('generator').length`)===0);
  check('cfLabel falls back to English when Arabic label missing', run(sb,`cfLabel({labelAr:'',labelEn:'Root Cause',key:'cf_a'})`)==='Root Cause');

  console.log('\n=== Custom fields: input rendering ===');
  const selectHtml = run(sb,`renderCustomFieldInputs('corrective', {cf_a:'Electrical'}, 'c')`);
  check('renders only active fields', selectHtml.includes('Root Cause') && !selectHtml.includes('Inactive Field'));
  check('select field renders as <select> with options', /<select id="c-cf_a">/.test(selectHtml) && selectHtml.includes('Mechanical'));
  check('existing value pre-selected', /value="Electrical"\s+selected/.test(selectHtml));

  console.log('\n=== Custom fields: collecting values from the DOM ===');
  run(sb,`document.getElementById('f-cf_c').value = 'Sunny, 30C';`);
  const collected = run(sb,`collectCustomFieldValues('reading', 'f')`);
  check('collectCustomFieldValues reads the DOM value keyed by field key', collected.cf_c === 'Sunny, 30C', JSON.stringify(collected));
  check('collectCustomFieldValues omits fields left blank', run(sb,`Object.keys(collectCustomFieldValues('corrective','c')).length`)===0);

  console.log('\n=== Custom fields: report summary formatting ===');
  const summary = run(sb,`customFieldsSummary('corrective', {cf_a:'Electrical'})`);
  check('summary formats as "Label: value"', summary === 'Root Cause: Electrical', summary);
  check('summary is empty string when no values', run(sb,`customFieldsSummary('corrective', {})`)==='');
  check('summary is empty string when values is undefined', run(sb,`customFieldsSummary('corrective', undefined)`)==='');

  console.log('\n=== Custom fields flow into the corrective report table ===');
  run(sb,`
    STATE.corrective=[{id:'c1',genId:'g1',date:'2026-01-01',type:'failure',severity:'high',status:'open',
      description:'D',causesOfFault:'C',customFields:{cf_a:'Electrical'}}];
    STATE.generators=[{id:'g1',name:'Gen 1',client:'UNHCR'}];
    STATE.reportType='corr'; STATE.reportGenId='g1';
    STATE.reportFrom='2024-01-01'; STATE.reportTo='2026-12-31';
  `);
  const rt = run(sb,`buildReportTable()`);
  check('corr report gains a Custom fields column when fields are defined', rt.headers.includes('Custom fields'), JSON.stringify(rt.headers));
  check('corr report row includes the causes-of-fault value', rt.body[0].includes('C'), JSON.stringify(rt.body[0]));
  check('corr report row includes the formatted custom field summary', rt.body[0].some(v=>v==='Root Cause: Electrical'), JSON.stringify(rt.body[0]));

  console.log('\n===============================');
  console.log('TOTAL: '+pass+' passed, '+fail+' failed');
  console.log('===============================');
  process.exit(fail?1:0);
})();
