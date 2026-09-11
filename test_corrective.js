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
  check('severity is not a column on the corrective report',
        rtC.headers.indexOf('Severity')<0, JSON.stringify(rtC.headers));
  check('no row is flagged now that severity has gone',
        rtC.bad.every(r=>r.every(x=>x===false)), JSON.stringify(rtC.bad[0]));
  check('severity is still stored on the record, just not printed',
        run(sb,`STATE.corrective[0].severity`)==='high');

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

  console.log('\n=== Combined corrective report pack (Reports tab) ===');
  run(sb,`STATE.lang='en'; STATE.reportType='corr'; STATE.reportMode='range';
          STATE.reportFrom='2026-06-01'; STATE.reportTo='2026-07-31';
          STATE.reportGenIds=['g1','g2'];`);
  let pack = run(sb,'correctivePackRecords()');
  check('the pack covers both generators', pack.length===3, 'got '+pack.length);
  check('the pack is ordered oldest first',
        pack[0].date <= pack[1].date && pack[1].date <= pack[2].date,
        pack.map(c=>c.date).join(' , '));
  run(sb,`STATE.reportGenIds=['g1'];`);
  pack = run(sb,'correctivePackRecords()');
  check('narrowing to one generator narrows the pack', pack.length===2, 'got '+pack.length);
  check('and only that generator appears', pack.every(c=>c.genId==='g1'));
  run(sb,`STATE.reportFrom='2020-01-01'; STATE.reportTo='2020-01-31';`);
  check('a period with no records gives an empty pack', run(sb,'correctivePackRecords().length')===0);
  run(sb,`STATE.reportFrom='2026-06-01'; STATE.reportTo='2026-07-31'; STATE.reportGenIds=['g1','g2'];`);

  const packHtml = run(sb,'correctivePackHtml(correctivePackRecords())');
  const single = run(sb,`faultReportBody(STATE.corrective.find(c=>c.id==='c1'))`);
  check('the pack reuses the exact single-record form',
        packHtml.indexOf(single) >= 0, 'single-record body not found verbatim inside the pack');
  check('a cover sheet plus one page per record',
        (packHtml.match(/class="packpage/g)||[]).length===4,
        String((packHtml.match(/class="packpage/g)||[]).length));
  check('the last record does not force a trailing blank page',
        packHtml.indexOf('page-break-after:auto') > 0);
  check('the pack CSS defines the page break',
        run(sb,'CORR_PACK_CSS').indexOf('page-break-after:always')>=0);
  check('every record in the period is present',
        ['Coolant leak','Air filter change','No start'].every(d=>packHtml.indexOf(d)>=0));

  run(sb,'exportCorrectivePackWord()');
  const packDoc = run(sb,'__blob') ? run(sb,'__blob').content : '';
  check('the Word pack is a real document', packDoc.indexOf('<html')>=0 && packDoc.indexOf('Section1')>=0);
  check('the Word pack holds the cover plus all three reports',
        (packDoc.match(/class="packpage/g)||[]).length===4,
        String((packDoc.match(/class="packpage/g)||[]).length));

  console.log('\n=== Pack cover sheet ===');
  const cover = run(sb,'correctivePackCover(correctivePackRecords())');
  check('the cover comes first in the pack', packHtml.indexOf(cover)===0);
  check('the cover is titled for the whole pack', cover.indexOf('Corrective Maintenance Reports')>=0);
  const coverField = (label, value) =>
    cover.indexOf('<span class="fl">'+label+'</span><span class="fv">'+value+'</span>') >= 0;
  check('the cover states how many reports follow', coverField('Number of reports', 3));
  check('the cover carries the period', cover.indexOf(run(sb,'reportPeriodLabel()'))>=0);
  check('the cover names the generators covered', cover.indexOf(run(sb,'reportSubjectLabel()'))>=0);
  check('the cover indexes every record',
        ['Coolant leak','Air filter change','No start'].every(d=>cover.indexOf(d)>=0));
  check('the cover counts open records', coverField('Open', 2), 'expected 2 open');
  check('the cover counts closed records', coverField('Closed', 1), 'expected 1 closed');
  check('the cover totals the downtime', coverField('Downtime (hrs)', 12.5), 'expected 3.5 + 1 + 8');
  check('the cover totals the billable value',
        cover.indexOf(run(sb,'moneyNum(correctivePackRecords().reduce((a,c)=>a+faultBillableTotal(c),0))'))>=0);
  check('the cover has the EnvironmSafe signature block',
        cover.indexOf('EnvironmSafe Engineer')>=0);
  check('the cover has no client supervisor signature',
        cover.indexOf('Client Supervisor')<0);
  check('the cover index has no severity column',
        cover.indexOf('>Severity<')<0, 'severity column still on the cover');
  check('an empty pack is never printed', run(sb,`(function(){
          var f=STATE.reportFrom, t2=STATE.reportTo;
          STATE.reportFrom='2020-01-01'; STATE.reportTo='2020-01-02';
          var n=correctivePackRecords().length;
          STATE.reportFrom=f; STATE.reportTo=t2; return n; })()`)===0);
  check('cover labels exist in both languages',
        run(sb,`['corr_pack_title','corr_pack_count','corr_pack_index','corr_pack_note']
                 .every(k=>!!I18N.en[k] && !!I18N.ar[k])`)===true);

  console.log('\n=== Serial fault IDs (Cor-813, Cor-814, ...) ===');
  run(sb,`STATE.corrective = [];`);
  check('first fault ID starts at Cor-813', run(sb,`FAULT_ID_PREFIX + nextFaultSeq()`)==='Cor-813');
  run(sb,`STATE.corrective = [{id:'x1',faultSeq:813}];`);
  check('next ID increments to Cor-814', run(sb,`FAULT_ID_PREFIX + nextFaultSeq()`)==='Cor-814');
  run(sb,`STATE.corrective = [{id:'x1',faultSeq:813},{id:'x2',faultSeq:820}];`);
  check('next ID follows the highest existing sequence, not just the count', run(sb,`nextFaultSeq()`)===821, 'got '+run(sb,`nextFaultSeq()`));
  run(sb,`STATE.corrective = [{id:'x1'},{id:'x2',faultSeq:null}];`);
  check('faults with no faultSeq (legacy records) are ignored, not treated as 0', run(sb,`nextFaultSeq()`)===813);

  console.log('\n=== Backfilling Corrective IDs onto legacy records ===');
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

  console.log('\n=== Corrective tab: filters ===');
  run(sb,`
    STATE.generators = [
      {id:'fao-1', name:'FAO GEN-01 140 kVA', client:'FAO'},
      {id:'fao-2', name:'FAO GEN-02 65 kVA',  client:'FAO'},
      {id:'un-1',  name:'UNHCR Genset 1',     client:'UNHCR'}
    ];
    STATE.corrective = [
      {id:'f1', faultId:'Cor-818', genId:'fao-1', date:'2026-08-13', status:'closed',
       shortDescription:'Dead starter battery', description:'140 kVA would not start', by:'Wajdi'},
      {id:'f2', faultId:'Cor-820', genId:'fao-1', date:'2026-08-26', status:'open',
       shortDescription:'Over-frequency at 56 Hz', description:'ATS refused to transfer', by:'Mohammed Taha'},
      {id:'f3', faultId:'Cor-821', genId:'fao-2', date:'2026-09-01', status:'in_progress',
       shortDescription:'Lift pump failure', description:'Pump replaced', by:'Wajdi'},
      {id:'f4', faultId:'Cor-700', genId:'un-1',  date:'2026-05-02', status:'closed',
       shortDescription:'UNHCR job', description:'unrelated', by:'Ali'},
      {id:'f5', faultId:'Cor-701', genId:'fao-2', date:'',           status:'open',
       shortDescription:'No date recorded', description:'legacy record', by:''}
    ];
    clearCorrFilters();
    STATE.corrOpenCards = {};
  `);
  const ids = f => run(sb,`filteredCorrective(${JSON.stringify(f)}).map(c=>c.faultId).sort().join(',')`);

  check('no filters shows every record', run(sb,'filteredCorrective().length')===5,
        run(sb,'filteredCorrective().length'));
  check('records come back newest first',
        run(sb,'filteredCorrective()[0].faultId')==='Cor-821', run(sb,'filteredCorrective()[0].faultId'));

  check('filter by client keeps only that client',
        ids({client:'UNHCR'})==='Cor-700', ids({client:'UNHCR'}));
  check('the other client is the complement',
        ids({client:'FAO'})==='Cor-701,Cor-818,Cor-820,Cor-821', ids({client:'FAO'}));
  check('filter by generator', ids({genId:'fao-2'})==='Cor-701,Cor-821', ids({genId:'fao-2'}));
  check('filter by status open', ids({status:'open'})==='Cor-701,Cor-820', ids({status:'open'}));
  check('filter by status in_progress', ids({status:'in_progress'})==='Cor-821');
  check('filter by status closed', ids({status:'closed'})==='Cor-700,Cor-818');
  check('a record with no status counts as open',
        run(sb,`filteredCorrective({status:'open'}).length`)===2);

  check('date from is inclusive', ids({from:'2026-08-26'})==='Cor-820,Cor-821', ids({from:'2026-08-26'}));
  check('date to is inclusive', ids({to:'2026-08-13'})==='Cor-700,Cor-818', ids({to:'2026-08-13'}));
  check('a period takes both ends', ids({from:'2026-08-01',to:'2026-08-31'})==='Cor-818,Cor-820');
  check('a record with no date is hidden once a period is asked for',
        ids({from:'2026-01-01'}).indexOf('Cor-701')<0, ids({from:'2026-01-01'}));
  check('...but is shown when no period is set', ids({}).indexOf('Cor-701')>=0);

  check('search matches the corrective ID', ids({search:'cor-820'})==='Cor-820');
  check('search matches the short description', ids({search:'lift pump'})==='Cor-821');
  check('search matches the technician', ids({search:'Mohammed'})==='Cor-820');
  check('search matches the generator name', ids({search:'GEN-02'})==='Cor-701,Cor-821');
  check('search is case-insensitive', ids({search:'OVER-FREQUENCY'})==='Cor-820');
  check('a search that matches nothing returns nothing', ids({search:'zzzz'})==='');

  check('filters combine (client + status + period)',
        ids({client:'FAO',status:'open',from:'2026-08-01',to:'2026-08-31'})==='Cor-820',
        ids({client:'FAO',status:'open',from:'2026-08-01',to:'2026-08-31'}));
  check('a combination with no match returns nothing',
        ids({client:'UNHCR',genId:'fao-1'})==='');

  console.log('\n=== Corrective tab: filter state and badge ===');
  check('a cleared filter set counts zero active filters', run(sb,'corrFilterActiveCount()')===0);
  run(sb,`STATE.corrFilterClient='FAO'; STATE.corrFrom='2026-08-01'; STATE.corrSearch='pump';`);
  check('each set filter is counted', run(sb,'corrFilterActiveCount()')===3, run(sb,'corrFilterActiveCount()'));
  check('corrFilterState reads the live STATE',
        run(sb,`corrFilterState().client`)==='FAO' && run(sb,`corrFilterState().search`)==='pump');
  check('blank text is not counted as a filter',
        (run(sb,`STATE.corrSearch='   '; corrFilterActiveCount()`))===2);
  run(sb,`clearCorrFilters();`);
  check('clearing resets every filter', run(sb,'corrFilterActiveCount()')===0);
  check('clearing brings the whole list back', run(sb,'filteredCorrective().length')===5);
  check('"all" is treated as no filter at all',
        run(sb,`corrFilterActiveCount({client:'all',genId:'all',status:'all',from:'',to:'',search:''})`)===0);

  console.log('\n=== Corrective tab: the new-record form is folded away by default ===');
  check('the form starts closed', run(sb,'STATE.corrFormOpen')===false);
  check('the filter panel starts closed', run(sb,'STATE.corrFiltersOpen')===false);
  const closedHtml = run(sb,'renderCorrective()');
  check('the add button is offered instead of the form',
        closedHtml.indexOf('id="corr-add-btn"')>=0, 'no add button');
  check('the new-record fields are not rendered while it is closed',
        closedHtml.indexOf('id="c-save"')<0, 'the form is rendered anyway');
  check('the filters button is present', closedHtml.indexOf('id="corr-filters-btn"')>=0);
  check('the record count is shown',
        closedHtml.indexOf(run(sb,`t('corr_showing',{n:5,total:5})`))>=0, 'no count line');
  run(sb,`STATE.corrFormOpen = true;`);
  const openHtml = run(sb,'renderCorrective()');
  check('tapping the button reveals the full form', openHtml.indexOf('id="c-save"')>=0);
  check('...with a way to close it again', openHtml.indexOf('id="c-close"')>=0);
  run(sb,`STATE.corrFormOpen = false; STATE.corrFiltersOpen = true;`);
  const filtHtml = run(sb,'renderCorrective()');
  ['corr-f-client','corr-f-gen','corr-f-from','corr-f-to','corr-f-search'].forEach(id=>{
    check('the filter panel offers '+id, filtHtml.indexOf('id="'+id+'"')>=0);
  });
  check('every status is offered as a chip',
        run(sb,'CORR_STATUS').every(v=>filtHtml.indexOf('data-corrfilter="'+v+'"')>=0));
  check('clear-filters only appears once something is filtered',
        filtHtml.indexOf('id="corr-f-clear"')<0, 'clear button shown with no filters set');
  run(sb,`STATE.corrSearch='pump';`);
  check('...and appears once it is', run(sb,'renderCorrective()').indexOf('id="corr-f-clear"')>=0);
  check('a filtered-out list says so rather than "no records yet"',
        run(sb,`STATE.corrSearch='zzzz'; renderCorrective()`).indexOf(run(sb,`t('corr_none_filter')`))>=0);
  run(sb,`clearCorrFilters(); STATE.corrFiltersOpen=false;`);

  console.log('\n=== Corrective tab: record cards ===');
  const cardHtml = run(sb,'renderCorrective()');
  check('each card carries its details toggle',
        (cardHtml.match(/data-corrdetails=/g)||[]).length===5,
        (cardHtml.match(/data-corrdetails=/g)||[]).length);
  check('cards are collapsed until asked for', cardHtml.indexOf('data-corrdetails="f1" open')<0);
  run(sb,`STATE.corrOpenCards={f1:true};`);
  check('an expanded card stays expanded through a re-render',
        run(sb,'renderCorrective()').indexOf('data-corrdetails="f1" open')>=0);
  check('the print and Word buttons are still on every card',
        (cardHtml.match(/data-corrprint=/g)||[]).length===5 &&
        (cardHtml.match(/data-corrword=/g)||[]).length===5);
  check('the full description is still in the card, just folded',
        cardHtml.indexOf('ATS refused to transfer')>=0);
  run(sb,`STATE.corrOpenCards={};`);

  console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
