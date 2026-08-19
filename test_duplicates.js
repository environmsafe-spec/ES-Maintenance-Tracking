/* Duplicate guard: warn before saving a daily reading or a corrective record that
   looks like one already on file. Nothing is ever blocked — the user decides. */
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

function build(){
  const collections={generators:{},readings:{},maintenance:{},corrective:{},servicelog:{},settings:{},customfields:{}}, listeners={};
  const added=[];
  const fb={ initializeApp(){}, auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb({uid:'x'}),0);},async signInAnonymously(){}};},
    firestore(){ return { collection(n){collections[n]=collections[n]||{};listeners[n]=listeners[n]||new Set();return{
      onSnapshot(cb){listeners[n].add(cb);setTimeout(()=>cb({docs:[],empty:true}),0);return()=>{};},
      async add(d){const id='a'+Math.random().toString(36).slice(2);collections[n][id]={...d};added.push({col:n,id,data:d});return{id};},
      doc(){return{async set(){},async update(){},async delete(){}};},
      limit(){return{async get(){return{empty:true,docs:[]};}};} };},
      batch(){return{set(){},async commit(){}};}, async enablePersistence(){} }; } };
  fb.firestore.FieldValue={serverTimestamp:()=>'TS'};
  function mk(id){return{id,value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,addEventListener(){},appendChild(){},removeChild(){},click(){}};}
  const els={};
  const sb={console,Date,Math,JSON,Promise,Symbol,String,Number,Array,Object,RegExp,Set,parseFloat,parseInt,isNaN,
    setTimeout:(f,m)=>setTimeout(f,Math.min(m||0,5)),
    Blob:class{constructor(p){this.content=p.join('');}}, URL:{createObjectURL(){return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},getAttribute(){}}},
    firebase:fb};
  sb.window=sb; sb.__added=added; vm.createContext(sb); return {sb};
}
function run(sb,c){return vm.runInContext(c,sb);}
// A local-time ISO stamp, so the "same calendar day" rule is tested in the user's timezone.
function stamp(day, hour, min){ const d=new Date(2026,7,day,hour,min||0,0); return d.toISOString(); }

(async()=>{
  const {sb}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));
  run(sb,`STATE.lang='en';
    STATE.generators=[{id:'g1',name:'FAO Genset 1'},{id:'g2',name:'FAO Genset 2'}];`);

  console.log('\n=== Text comparison helpers ===');
  check('identical text scores 1', run(sb,`textSimilarity('Oil leak from filter','oil leak from filter')`)===1);
  check('punctuation and case are ignored',
        run(sb,`textSimilarity('Oil leak, from FILTER!','oil leak from filter')`)===1);
  check('unrelated text scores low', run(sb,`textSimilarity('Oil leak','Battery replaced')`)<0.3);
  check('empty text never matches', run(sb,`textSimilarity('','Oil leak')`)===0);
  check('Arabic text matches itself', run(sb,`textSimilarity('تسريب زيت من الفلتر','تسريب زيت من الفلتر')`)===1);
  check('Arabic diacritics are ignored', run(sb,`textSimilarity('تَسريب زيت','تسريب زيت')`)===1);
  check('partly-shared wording still scores above the threshold',
        run(sb,`textSimilarity('oil leak from the fuel filter','oil leak from fuel filter')`)>=0.6);

  console.log('\n=== Readings: what counts as a near-duplicate ===');
  run(sb,`STATE.readings=[
    {id:'r1',genId:'g1',timestamp:'${stamp(10,9,0)}',hours:1200,tech:'Ali'},
    {id:'r2',genId:'g2',timestamp:'${stamp(10,9,30)}',hours:900,tech:'Sami'},
    {id:'r3',genId:'g1',timestamp:'${stamp(4,9,0)}',hours:1100,tech:'Ali'}
  ];`);
  check('an entry 30 minutes after one already saved is flagged',
        run(sb,`similarReadings({genId:'g1',timestamp:'${stamp(10,9,30)}',hours:1201}).length`)===1);
  check('the same generator a week earlier is not flagged',
        run(sb,`similarReadings({genId:'g1',timestamp:'${stamp(17,9,0)}',hours:1400}).length`)===0);
  check('another generator at the same moment is not flagged',
        run(sb,`similarReadings({genId:'g2',timestamp:'${stamp(10,9,10)}',hours:900}).length`)===1);
  check('... and it matches that generator only, not both',
        run(sb,`similarReadings({genId:'g2',timestamp:'${stamp(10,9,10)}',hours:900})[0].id`)==='r2');
  check('same day, same running hours, but 14 hours apart is still flagged',
        run(sb,`similarReadings({genId:'g1',timestamp:'${stamp(10,23,30)}',hours:1200}).length`)===1);
  check('same day but hours moved on and 14 hours apart is not flagged',
        run(sb,`similarReadings({genId:'g1',timestamp:'${stamp(10,23,30)}',hours:1240}).length`)===0);
  check('a blank running-hours field never triggers the hours rule',
        run(sb,`similarReadings({genId:'g1',timestamp:'${stamp(10,23,30)}',hours:''}).length`)===0);
  check('an unreadable date is handled quietly',
        run(sb,`similarReadings({genId:'g1',timestamp:'not a date',hours:1200}).length`)===0);
  check('editing a saved reading does not match itself',
        run(sb,`similarReadings({id:'r1',genId:'g1',timestamp:'${stamp(10,9,0)}',hours:1200}).length`)===0);
  check('the closest entry comes first',
        run(sb,`(function(){STATE.readings.push({id:'r4',genId:'g1',timestamp:'${stamp(10,15,0)}',hours:1206,tech:'Ali'});
                 var d=similarReadings({genId:'g1',timestamp:'${stamp(10,14,0)}',hours:1205});
                 return d[0].id+':'+d.length;})()`)==='r4:2');

  console.log('\n=== Readings: the message the user sees ===');
  let msg = run(sb,`duplicateReadingWarning({genId:'g1',timestamp:'${stamp(10,9,30)}',hours:1201})`);
  check('the warning names the generator', msg.indexOf('FAO Genset 1')>=0, msg);
  check('the warning shows who entered the earlier reading', msg.indexOf('Ali')>=0, msg);
  check('the warning shows the earlier running hours', msg.indexOf('1200')>=0, msg);
  check('the warning ends with a continue question', /continue/i.test(msg), msg);
  check('several close entries are counted', /1 other close/.test(msg), msg);
  check('nothing similar means no warning at all',
        run(sb,`duplicateReadingWarning({genId:'g1',timestamp:'${stamp(25,9,0)}',hours:1500})`)==='');
  check('the warning follows the language setting',
        run(sb,`(function(){STATE.lang='ar';var m=duplicateReadingWarning({genId:'g1',timestamp:'${stamp(10,9,30)}',hours:1201});STATE.lang='en';return m;})()`).indexOf('هل تريد المتابعة')>=0);

  console.log('\n=== Corrective records ===');
  run(sb,`STATE.corrective=[
    {id:'c1',genId:'g1',faultId:'Cor-813',date:'2026-08-10',shortDescription:'Oil leak from filter',description:'Oil leaking at the filter head'},
    {id:'c2',genId:'g1',faultId:'Cor-814',date:'2026-08-10',shortDescription:'Battery replaced',description:'Battery flat, replaced'}
  ];`);
  check('the same complaint on the same day is flagged',
        run(sb,`similarCorrectives({genId:'g1',date:'2026-08-10',shortDescription:'Oil leak from filter',description:''}).length`)===1);
  check('... and it points at the right record',
        run(sb,`similarCorrectives({genId:'g1',date:'2026-08-11',shortDescription:'oil leak from filter',description:''})[0].faultId`)==='Cor-813');
  check('a different complaint on the same day is not flagged',
        run(sb,`similarCorrectives({genId:'g1',date:'2026-08-10',shortDescription:'Radiator hose burst',description:''}).length`)===0);
  check('the same complaint two weeks later is not flagged',
        run(sb,`similarCorrectives({genId:'g1',date:'2026-08-28',shortDescription:'Oil leak from filter',description:''}).length`)===0);
  check('the same complaint on another generator is not flagged',
        run(sb,`similarCorrectives({genId:'g2',date:'2026-08-10',shortDescription:'Oil leak from filter',description:''}).length`)===0);
  check('editing a saved record does not match itself',
        run(sb,`similarCorrectives({id:'c1',genId:'g1',date:'2026-08-10',shortDescription:'Oil leak from filter',description:''}).length`)===0);
  let cmsg = run(sb,`duplicateCorrectiveWarning({genId:'g1',date:'2026-08-10',shortDescription:'Oil leak from filter',description:''})`);
  check('the corrective warning shows the existing Corrective ID', cmsg.indexOf('Cor-813')>=0, cmsg);
  check('the corrective warning names the generator', cmsg.indexOf('FAO Genset 1')>=0, cmsg);
  check('the corrective warning ends with a continue question', /continue/i.test(cmsg), cmsg);
  check('nothing similar means no corrective warning',
        run(sb,`duplicateCorrectiveWarning({genId:'g1',date:'2026-08-10',shortDescription:'Alternator bearing noise',description:''})`)==='');

  console.log('\n=== Records saved before this feature ===');
  check('a reading with no running hours on file is handled',
        run(sb,`(function(){var old=STATE.readings;STATE.readings=[{id:'x1',genId:'g1',timestamp:'${stamp(10,9,0)}'}];
                 var n=similarReadings({genId:'g1',timestamp:'${stamp(10,9,10)}',hours:1200}).length;STATE.readings=old;return n;})()`)===1);
  check('a corrective record with no description is handled',
        run(sb,`(function(){var old=STATE.corrective;STATE.corrective=[{id:'y1',genId:'g1',date:'2026-08-10'}];
                 var n=similarCorrectives({genId:'g1',date:'2026-08-10',shortDescription:'Oil leak',description:''}).length;STATE.corrective=old;return n;})()`)===0);

  console.log('\n=== Labels exist in both languages ===');
  check('every duplicate-warning label is translated',
        run(sb,`['dup_reading_warn','dup_corr_warn','dup_more','dup_continue']
                .every(k=>I18N.ar[k]&&I18N.en[k])`)===true);
  check('the labels are editable in the Labels panel',
        run(sb,`allLabelKeys().indexOf('dup_reading_warn')>=0`)===true);

  console.log('\nTOTAL: '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
