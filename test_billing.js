const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/home/claude/generator-readings.html','utf8');
const SOURCE=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function check(l,c,d){ if(c){pass++;console.log('  PASS  '+l);} else {fail++;console.log('  FAIL  '+l+(d?'  -> '+d:''));} }

function build(){
  const collections={generators:{},readings:{},maintenance:{},corrective:{},servicelog:{},settings:{},customfields:{},pricelist:{},invoices:{}}, listeners={};
  const added=[]; const updated=[]; const deleted=[];
  const fb={ initializeApp(){}, auth(){return{onAuthStateChanged(cb){setTimeout(()=>cb({uid:'x'}),0);},async signInAnonymously(){}};},
    firestore(){ const db={ collection(n){collections[n]=collections[n]||{};listeners[n]=listeners[n]||new Set();return{
      onSnapshot(cb){listeners[n].add(cb);setTimeout(()=>cb({docs:Object.entries(collections[n]).map(([id,data])=>({id,data:()=>({...data})})),empty:!Object.keys(collections[n]).length}),0);return()=>{};},
      async add(d){const id='a'+Math.random().toString(36).slice(2);collections[n][id]={...d};added.push({col:n,id,data:d});return{id};},
      doc(id){return{
        async set(d,o){collections[n][id]=Object.assign({},collections[n][id]||{},d);added.push({col:n,id,data:d});},
        async update(d){Object.assign(collections[n][id]=collections[n][id]||{},d);updated.push({col:n,id,data:d});},
        async delete(){delete collections[n][id];deleted.push({col:n,id});}
      };},
      limit(){return{async get(){const e=Object.entries(collections[n]);return{empty:!e.length,docs:e.map(([id,data])=>({id,data:()=>data}))};}};} };},
      batch(){const o=[];return{set(r,d){o.push({r,d});},async commit(){}};}, async enablePersistence(){} }; return db; } };
  fb.firestore.FieldValue={serverTimestamp:()=>'TS'};
  const els={};
  function mk(id){return{id,value:'',checked:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},style:{},disabled:false,dataset:{},addEventListener(){},appendChild(){},removeChild(){},click(){}};}
  let blob=null; const sheets=[];
  const XLSX={utils:{book_new:()=>({}),aoa_to_sheet:a=>({rows:a}),book_append_sheet:(wb,sh,name)=>sheets.push({name,sheet:sh})},writeFile(){}};
  const sb={console,Date,Math,JSON,Promise,Symbol,String,Number,Array,Object,RegExp,parseFloat,parseInt,isNaN,XLSX,
    setTimeout:(f,m)=>setTimeout(f,Math.min(m||0,5)),
    Blob:class{constructor(p){this.content=p.join('');blob=this;}}, URL:{createObjectURL(){return'x';},revokeObjectURL(){}},
    confirm:()=>true,prompt:()=>null,alert:()=>{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk('a'),body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},getAttribute(){}}},
    firebase:fb};
  sb.window=sb; Object.defineProperty(sb,'__blob',{get:()=>blob});
  sb.__added=added; sb.__updated=updated; sb.__deleted=deleted; sb.__collections=collections; sb.__els=els; sb.__sheets=sheets;
  vm.createContext(sb); return {sb};
}
function run(sb,c){return vm.runInContext(c,sb);}

(async()=>{
  const {sb}=build();
  run(sb,SOURCE);
  await new Promise(r=>setTimeout(r,60));

  run(sb,`
    STATE.lang='en';
    STATE.generators=[
      {id:'g1',name:'FAO GEN-01 140 kVA',client:'FAO'},
      {id:'g2',name:'FAO-GEN-02 65 kVA',client:'FAO'},
      {id:'u1',name:'UNHCR Genset 1',client:'UNHCR'}
    ];
    STATE.pricelist=[
      {id:'p1',nameEn:'Current transformer',nameAr:'محول تيار',unit:'each',unitPrice:34.33,active:true},
      {id:'p2',nameEn:'Starter battery',nameAr:'بطارية',unit:'each',unitPrice:120,active:true},
      {id:'p3',nameEn:'Old item',nameAr:'قديم',unit:'each',unitPrice:5,active:false}
    ];
    STATE.corrective=[
      {id:'c1',genId:'g1',faultId:'Cor-818',date:'2026-08-13',status:'closed',severity:'high',
       shortDescription:'Dead starter battery',
       partsLines:[{name:'Starter battery',qty:1,unitPrice:120,total:120}]},
      {id:'c2',genId:'g2',faultId:'Cor-819',date:'2026-08-01',status:'open',severity:'medium',
       shortDescription:'Faulty current transformer',serviceFee:0,
       partsLines:[{name:'Current transformer',qty:3,unitPrice:34.33,total:102.99}]},
      {id:'c3',genId:'u1',faultId:'Cor-820',date:'2026-08-05',status:'open',severity:'low',
       shortDescription:'UNHCR job'}
    ];
    // one visit that cleared three nested hour intervals -> must bill ONCE
    STATE.svclog=[
      {id:'s1',genId:'g1',date:'2026-08-10',kind:'hours',intervalLabel:'500 hr',by:'Wagdi'},
      {id:'s2',genId:'g1',date:'2026-08-10',kind:'hours',intervalLabel:'250 hr',by:'Wagdi'},
      {id:'s3',genId:'g1',date:'2026-08-10',kind:'hours',intervalLabel:'125 hr',by:'Wagdi'},
      {id:'s4',genId:'g2',date:'2026-07-02',kind:'time',intervalLabel:'Weekly',by:'Taha'}
    ];
    STATE.invoices=[];
    STATE.billing={};
  `);

  console.log('\n=== Money + rate defaults ===');
  check('default service rate is 180', run(sb,'serviceRate()')===180, run(sb,'serviceRate()'));
  check('default currency is USD', run(sb,'billingCurrency()')==='USD');
  check('round2 fixes float drift', run(sb,'round2(0.1+0.2)')===0.3, run(sb,'round2(0.1+0.2)'));
  check('round2 of 102.99 stays exact', run(sb,'round2(3*34.33)')===102.99, run(sb,'round2(3*34.33)'));
  check('money() prints 2dp + currency', run(sb,'money(180)')==='180.00 USD', run(sb,'money(180)'));
  run(sb,`STATE.billing={serviceRate:200,currency:'YER'};`);
  check('service rate reads the billing settings doc', run(sb,'serviceRate()')===200);
  check('currency reads the billing settings doc', run(sb,'billingCurrency()')==='YER');
  run(sb,`STATE.billing={serviceRate:'not a number'};`);
  check('bad stored rate falls back to 180', run(sb,'serviceRate()')===180);
  run(sb,`STATE.billing={};`);

  console.log('\n=== Price list ===');
  check('active items exclude deactivated ones', run(sb,'activePriceItems().length')===2, run(sb,'activePriceItems().length'));
  check('item label follows language (en)', run(sb,`priceItemLabel(priceItemById('p1'))`)==='Current transformer');
  run(sb,`STATE.lang='ar';`);
  check('item label follows language (ar)', run(sb,`priceItemLabel(priceItemById('p1'))`)==='محول تيار');
  run(sb,`STATE.lang='en';`);
  check('unknown item id returns null', run(sb,`priceItemById('nope')`)===null);

  console.log('\n=== What a fault is worth ===');
  check('fault with no serviceFee uses the default rate', run(sb,`faultServiceFee(STATE.corrective[0])`)===180);
  check('serviceFee of 0 is respected (not overridden by default)', run(sb,`faultServiceFee(STATE.corrective[1])`)===0,
        run(sb,`faultServiceFee(STATE.corrective[1])`));
  check('parts subtotal computed from qty x price', run(sb,`linesSubtotal(faultPartsLines(STATE.corrective[1]))`)===102.99,
        run(sb,`linesSubtotal(faultPartsLines(STATE.corrective[1]))`));
  check('billable total = fee + parts', run(sb,`faultBillableTotal(STATE.corrective[0])`)===300,
        run(sb,`faultBillableTotal(STATE.corrective[0])`));
  check('zero-fee fault bills parts only', run(sb,`faultBillableTotal(STATE.corrective[1])`)===102.99);
  check('fault with no parts bills the fee only', run(sb,`faultBillableTotal(STATE.corrective[2])`)===180);

  console.log('\n=== Service visits: nesting must not bill three times ===');
  let visits = run(sb,'serviceVisits()');
  check('three nested rows on one date collapse to one visit', visits.length===2, 'got '+visits.length);
  const v1 = visits.find(v=>v.genId==='g1');
  check('the visit lists all three intervals', v1.labels.length===3, JSON.stringify(v1.labels));
  check('visit key is generator|date', v1.key==='g1|2026-08-10', v1.key);
  check('visit keeps the technician', v1.by==='Wagdi');

  console.log('\n=== Pickable work list ===');
  let work = run(sb,`billableWorkItems('FAO')`);
  check('FAO work excludes the UNHCR fault', work.every(w=>w.genId!=='u1'), JSON.stringify(work.map(w=>w.genId)));
  check('FAO work = 2 faults + 2 visits', work.length===4, 'got '+work.length);
  check('work list sorted newest first', work[0].date==='2026-08-13', work[0].date);
  check('a service visit is worth one routine fee', work.find(w=>w.sourceType==='service').amount===23,
        work.find(w=>w.sourceType==='service').amount);
  check('nothing is invoiced yet', work.every(w=>!w.invoicedBy));
  check('no client filter returns everything', run(sb,'billableWorkItems(null).length')===5,
        run(sb,'billableWorkItems(null).length'));

  console.log('\n=== Turning picked work into invoice lines ===');
  let lines = run(sb,`linesFromWorkItem(billableWorkItems('FAO').find(w=>w.sourceId==='c1'))`);
  check('a fault produces a service line + one goods line', lines.length===2, 'got '+lines.length);
  check('first line is the service charge', lines[0].kind==='service' && lines[0].unitPrice===180);
  check('service line carries the Corrective ID as its ref', lines[0].ref==='Cor-818', lines[0].ref);
  check('goods line carries qty and price', lines[1].kind==='good' && lines[1].qty===1 && lines[1].unitPrice===120);
  check('both lines trace back to the same fault', lines.every(l=>l.sourceType==='fault' && l.sourceId==='c1'));
  let sLines = run(sb,`linesFromWorkItem(billableWorkItems('FAO').find(w=>w.sourceType==='service'))`);
  check('a service visit produces exactly one line', sLines.length===1, 'got '+sLines.length);

  console.log('\n=== Draft building ===');
  run(sb,`STATE.invDraft = blankInvoiceDraft();`);
  check('blank draft starts empty', run(sb,'STATE.invDraft.lines.length')===0);
  check('blank draft picks the first client', run(sb,'STATE.invDraft.client')==='FAO', run(sb,'STATE.invDraft.client'));
  run(sb,`toggleWorkItemInDraft(billableWorkItems('FAO').find(w=>w.sourceId==='c1'));`);
  check('ticking a fault adds its lines', run(sb,'STATE.invDraft.lines.length')===2);
  check('draftHasSource sees it', run(sb,`draftHasSource(STATE.invDraft,'fault','c1')`)===true);
  run(sb,`toggleWorkItemInDraft(billableWorkItems('FAO').find(w=>w.sourceId==='c1'));`);
  check('un-ticking removes exactly those lines', run(sb,'STATE.invDraft.lines.length')===0);
  run(sb,`
    toggleWorkItemInDraft(billableWorkItems('FAO').find(w=>w.sourceId==='c1'));
    toggleWorkItemInDraft(billableWorkItems('FAO').find(w=>w.sourceId==='g1|2026-08-10'));
    STATE.invDraft.lines.push({kind:'good',sourceType:'manual',sourceId:'',desc:'Oil filter for stock',qty:4,unitPrice:12.5,total:50});
  `);
  check('draft now has fault + visit + stock line', run(sb,'STATE.invDraft.lines.length')===4);
  check('draft subtotal adds up', run(sb,'linesSubtotal(STATE.invDraft.lines)')===373,
        run(sb,'linesSubtotal(STATE.invDraft.lines)'));

  console.log('\n=== Invoice numbering ===');
  check('first invoice number is the start seed', run(sb,'nextInvoiceSeq()')===1001, run(sb,'nextInvoiceSeq()'));
  run(sb,`STATE.invoices=[{id:'i1',invoiceSeq:1001,invoiceNo:'INV-1001',status:'sent',client:'FAO',date:'2026-08-14',lines:[]}];`);
  check('next number follows the highest used', run(sb,'nextInvoiceSeq()')===1002);
  run(sb,`STATE.invoices=[{id:'i1',invoiceSeq:1005,invoiceNo:'INV-1005',status:'sent',client:'FAO',date:'2026-08-14',lines:[]},
                         {id:'i2',invoiceSeq:1002,invoiceNo:'INV-1002',status:'draft',client:'FAO',date:'2026-08-02',lines:[]}];`);
  check('gaps do not reuse a number', run(sb,'nextInvoiceSeq()')===1006);

  console.log('\n=== Invoice totals, discount, balance ===');
  run(sb,`__inv = {lines:[{qty:1,unitPrice:180},{qty:3,unitPrice:34.33}], discount:10, paidAmount:0, status:'sent'};`);
  let tt = run(sb,'invoiceTotals(__inv)');
  check('subtotal', tt.subtotal===282.99, tt.subtotal);
  check('discount applied to total', tt.total===272.99, tt.total);
  check('balance equals total when nothing paid', tt.balance===272.99);
  run(sb,`__inv.paidAmount=100;`);
  tt = run(sb,'invoiceTotals(__inv)');
  check('part payment reduces balance', tt.balance===172.99, tt.balance);
  run(sb,`__inv.discount=999;`);
  check('a discount larger than subtotal cannot go negative', run(sb,'invoiceTotals(__inv).total')===0);
  run(sb,`__inv.discount=10;__inv.paidAmount=0;`);

  console.log('\n=== Payment follow-up status ===');
  check('no payment on a draft stays draft', run(sb,`statusForPayment({status:'draft',lines:[{qty:1,unitPrice:180}]},0)`)==='draft');
  check('part payment -> partly_paid', run(sb,`statusForPayment({status:'sent',lines:[{qty:1,unitPrice:180}]},50)`)==='partly_paid');
  check('full payment -> paid', run(sb,`statusForPayment({status:'sent',lines:[{qty:1,unitPrice:180}]},180)`)==='paid');
  check('overpayment still counts as paid', run(sb,`statusForPayment({status:'sent',lines:[{qty:1,unitPrice:180}]},200)`)==='paid');

  console.log('\n=== Overdue detection ===');
  check('no due date is never overdue', run(sb,`invoiceIsOverdue({status:'sent',dueDate:'',lines:[{qty:1,unitPrice:10}]})`)===false);
  check('past due with a balance is overdue',
        run(sb,`invoiceIsOverdue({status:'sent',dueDate:'2020-01-01',lines:[{qty:1,unitPrice:10}]})`)===true);
  check('past due but fully paid is not overdue',
        run(sb,`invoiceIsOverdue({status:'paid',dueDate:'2020-01-01',paidAmount:10,lines:[{qty:1,unitPrice:10}]})`)===false);
  check('cancelled is never overdue',
        run(sb,`invoiceIsOverdue({status:'cancelled',dueDate:'2020-01-01',lines:[{qty:1,unitPrice:10}]})`)===false);
  check('future due date is not overdue',
        run(sb,`invoiceIsOverdue({status:'sent',dueDate:'2099-01-01',lines:[{qty:1,unitPrice:10}]})`)===false);

  console.log('\n=== Double-billing protection ===');
  run(sb,`STATE.invoices=[
    {id:'i1',invoiceSeq:1001,invoiceNo:'INV-1001',client:'FAO',date:'2026-08-14',status:'sent',paidAmount:0,
     lines:[{kind:'service',sourceType:'fault',sourceId:'c1',qty:1,unitPrice:180},
            {kind:'good',sourceType:'fault',sourceId:'c1',qty:1,unitPrice:120},
            {kind:'good',sourceType:'manual',sourceId:'',qty:2,unitPrice:10}]}
  ];`);
  check('an invoiced fault is flagged', !!run(sb,`invoiceForSource('fault','c1')`));
  check('the flag names the invoice', run(sb,`invoiceForSource('fault','c1').invoiceNo`)==='INV-1001');
  check('an un-invoiced fault is not flagged', run(sb,`invoiceForSource('fault','c2')`)===null);
  check('manual lines never mark a source', run(sb,`Object.keys(invoicedSourceKeys()).length`)===1,
        run(sb,`JSON.stringify(Object.keys(invoicedSourceKeys()))`));
  work = run(sb,`billableWorkItems('FAO')`);
  check('the work list shows c1 as already invoiced', !!work.find(w=>w.sourceId==='c1').invoicedBy);
  check('other work stays available', !work.find(w=>w.sourceId==='c2').invoicedBy);
  check('editing that same invoice does not flag its own lines',
        run(sb,`billableWorkItems('FAO','i1').find(w=>w.sourceId==='c1').invoicedBy`)===null);
  run(sb,`STATE.invoices[0].status='cancelled';`);
  check('a cancelled invoice frees the work again', run(sb,`invoiceForSource('fault','c1')`)===null);
  run(sb,`STATE.invoices[0].status='sent';`);

  console.log('\n=== Receivables summary (the follow-up) ===');
  run(sb,`STATE.invoices=[
    {id:'i1',invoiceNo:'INV-1001',invoiceSeq:1001,client:'FAO',date:'2026-08-01',status:'paid',paidAmount:300,lines:[{qty:1,unitPrice:300}]},
    {id:'i2',invoiceNo:'INV-1002',invoiceSeq:1002,client:'FAO',date:'2026-08-10',status:'partly_paid',paidAmount:100,lines:[{qty:1,unitPrice:250}]},
    {id:'i3',invoiceNo:'INV-1003',invoiceSeq:1003,client:'UNHCR',date:'2026-08-12',status:'sent',paidAmount:0,lines:[{qty:2,unitPrice:90}]},
    {id:'i4',invoiceNo:'INV-1004',invoiceSeq:1004,client:'FAO',date:'2026-08-13',status:'cancelled',paidAmount:0,lines:[{qty:1,unitPrice:999}]}
  ];`);
  let sum = run(sb,'invoiceSummary()');
  check('cancelled invoices are excluded from the totals', sum.invoiced===730, sum.invoiced);
  check('collected total', sum.paid===400, sum.paid);
  check('outstanding = invoiced − collected', sum.outstanding===330, sum.outstanding);
  check('invoices sort newest first', run(sb,'invoicesSorted()[0].invoiceNo')==='INV-1004');

  console.log('\n=== Invoices report + exports ===');
  run(sb,`STATE.lang='en';STATE.reportType='invoices';STATE.reportMode='range';
          STATE.reportFrom='2026-08-01';STATE.reportTo='2026-08-11';`);
  check('report period filters invoices', run(sb,'invReportRows().length')===2, run(sb,'invReportRows().length'));
  let rt = run(sb,'buildReportTable()');
  check('invoice report builds a table', rt.type==='invoices' && rt.body.length===2);
  check('invoice report headers carry the currency', rt.headers.some(h=>h.indexOf('USD')>=0), JSON.stringify(rt.headers));
  check('unpaid balance is flagged red', rt.bad.some(r=>r.indexOf(true)>=0));
  check('report is not empty', rt.empty===false);
  run(sb,`STATE.reportFrom='2020-01-01';STATE.reportTo='2020-01-02';`);
  check('empty period reports empty', run(sb,'buildReportTable()').empty===true);
  run(sb,`STATE.reportFrom='2026-08-01';STATE.reportTo='2026-08-31';`);

  console.log('\n=== Full backup includes billing data ===');
  run(sb,`STATE.invoices=[{id:'i1',invoiceNo:'INV-1001',invoiceSeq:1001,client:'FAO',date:'2026-08-14',status:'sent',
            paidAmount:0,lines:[{kind:'service',sourceType:'fault',ref:'Cor-818',desc:'Repair',qty:1,unitPrice:180}]}];`);
  run(sb,'exportFullBackup()');
  const sheets = run(sb,'__sheets.map(s=>s.name)');
  check('backup has a PriceList sheet', sheets.indexOf('PriceList')>=0, JSON.stringify(sheets));
  check('backup has an Invoices sheet', sheets.indexOf('Invoices')>=0);
  check('backup has an InvoiceLines sheet', sheets.indexOf('InvoiceLines')>=0);
  const invSheet = run(sb,`__sheets.find(s=>s.name==='Invoices').sheet.rows`);
  check('Invoices sheet has header + 1 row', invSheet.length===2, 'got '+invSheet.length);
  const lineSheet = run(sb,`__sheets.find(s=>s.name==='InvoiceLines').sheet.rows`);
  check('InvoiceLines sheet has header + 1 row', lineSheet.length===2, 'got '+lineSheet.length);
  const plSheet = run(sb,`__sheets.find(s=>s.name==='PriceList').sheet.rows`);
  check('PriceList sheet has header + 3 items', plSheet.length===4, 'got '+plSheet.length);

  console.log('\n=== Corrective report carries the billable total ===');
  run(sb,`STATE.reportType='corr';STATE.reportGenId='g1';STATE.reportFrom='2026-08-01';STATE.reportTo='2026-08-31';`);
  rt = run(sb,'buildReportTable()');
  check('corrective report has a billable-total column', rt.headers.some(h=>h.indexOf('Billable total')>=0), JSON.stringify(rt.headers));
  check('corrective report has an invoice-number column', rt.headers.indexOf('Invoice No.')>=0);
  check('billable total appears in the row', rt.body[0].indexOf('300.00')>=0, JSON.stringify(rt.body[0]));

  console.log('\n=== Official documents render ===');
  run(sb,`STATE.invoices=[{id:'i1',invoiceNo:'INV-1001',invoiceSeq:1001,client:'FAO',genId:'g1',date:'2026-08-14',
            dueDate:'2026-09-14',status:'sent',paidAmount:50,discount:10,notes:'Thanks',
            lines:[{kind:'service',sourceType:'fault',ref:'Cor-818',desc:'Repair service',qty:1,unitPrice:180},
                   {kind:'good',sourceType:'manual',desc:'Oil filter',qty:2,unitPrice:12.5}]}];`);
  const invBody = run(sb,`invoiceReportBody(STATE.invoices[0])`);
  check('invoice document shows the invoice number', invBody.indexOf('INV-1001')>=0);
  check('invoice document shows the client', invBody.indexOf('FAO')>=0);
  check('invoice document lists the service line', invBody.indexOf('Repair service')>=0);
  check('invoice document lists the goods line', invBody.indexOf('Oil filter')>=0);
  check('invoice document shows the balance', invBody.indexOf('145.00')>=0, 'expected 180+25-10-50');
  check('invoice document has both signature blocks',
        invBody.indexOf('EnvironmSafe')>=0 && invBody.indexOf('Received by client')>=0);
  const faultBody = run(sb,`faultReportBody(STATE.corrective[0])`);
  check('fault report includes the costed breakdown', faultBody.indexOf('Billable items')>=0);
  check('fault report shows the fault billable total', faultBody.indexOf('300.00')>=0);
  const noBill = run(sb,`faultBillingReportBlock({genId:'g1',serviceFee:0})`);
  check('a zero-value fault prints no billing block', noBill==='', noBill);

  console.log('\n=== HTML escaping in billing output ===');
  run(sb,`STATE.pricelist=STATE.pricelist.concat([{id:'p9',nameEn:'<script>x</script>',unitPrice:1,active:true}]);`);
  const editor = run(sb,`renderPriceListEditor()`);
  check('price-list names are escaped', editor.indexOf('<script>x')<0 && editor.indexOf('&lt;script&gt;')>=0);

  console.log('\n=== Writes go to the right collections ===');
  check('pricelist collection name', run(sb,'PRICELIST_COLLECTION')==='pricelist');
  check('invoices collection name', run(sb,'INVOICES_COLLECTION')==='invoices');
  check('billing settings live in a settings doc', run(sb,'BILLING_DOC')==='billing');
  check('every billing status has a label',
        run(sb,`INVOICE_STATUS.every(s=>!!I18N.en['inv_st_'+s] && !!I18N.ar['inv_st_'+s])`)===true);
  check('new billing labels are editable in the Labels panel',
        run(sb,`allLabelKeys().indexOf('inv_total')>=0 && categoryForLabelKey('inv_total')==='cat_billing'`)===true);
  check('price-list labels categorised too', run(sb,`categoryForLabelKey('pl_price')`)==='cat_billing');

  console.log('\n=== Routine vs corrective rates ===');
  run(sb,`STATE.billing={};`);
  check('routine rate defaults to 23 (FAO Option 2, 250 h)', run(sb,'routineRate()')===23, run(sb,'routineRate()'));
  check('corrective rate still defaults to 180', run(sb,'serviceRate()')===180);
  run(sb,`STATE.billing={serviceRate:180, routineRate:22};`);
  check('routine rate reads the settings doc (still changeable)', run(sb,'routineRate()')===22);
  run(sb,`STATE.billing={serviceRate:180, routineRate:23};`);
  let visitItem = run(sb,`billableWorkItems('FAO').find(w=>w.sourceType==='service')`);
  check('a routine visit is billed at the routine rate, not 180', visitItem.amount===23, visitItem.amount);
  let faultItem = run(sb,`billableWorkItems('FAO').find(w=>w.sourceId==='c1')`);
  check('a fault is still billed at the corrective rate', faultItem.fee===180, faultItem.fee);
  check('bad routine rate falls back to the default',
        run(sb,`(function(){STATE.billing={routineRate:'x'};var r=routineRate();STATE.billing={serviceRate:180,routineRate:23};return r;})()`)===23);

  console.log('\n=== Quantities are editable ===');
  run(sb,`__l={kind:'good',desc:'Oil filter',qty:1,unitPrice:18,total:18};
          __l.qty=25; __l.total=lineTotal(__l);`);
  check('changing qty recomputes the line total', run(sb,'__l.total')===450, run(sb,'__l.total'));
  run(sb,`__l.unitPrice=17.5; __l.total=lineTotal(__l);`);
  check('changing unit price recomputes the line total', run(sb,'__l.total')===437.5);
  const ed = run(sb,`renderLineEditor([{kind:'good',desc:'X',qty:2,unitPrice:5}],'inv',{editable:true})`);
  check('editable editor renders qty inputs', ed.indexOf('data-lineqty="inv:0"')>=0);
  check('editable editor renders price inputs', ed.indexOf('data-lineprice="inv:0"')>=0);
  const ro = run(sb,`renderLineEditor([{kind:'good',desc:'X',qty:2,unitPrice:5}],'ro',{readOnly:true})`);
  check('read-only editor has no inputs and no remove button',
        ro.indexOf('data-lineqty')<0 && ro.indexOf('data-linerm')<0);

  console.log('\n=== Issuing services and goods separately ===');
  run(sb,`__doc={lines:[
    {kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',desc:'Repair',qty:1,unitPrice:180},
    {kind:'service',sourceType:'service',genId:'g1',genName:'GEN-01',desc:'Routine',qty:1,unitPrice:22},
    {kind:'good',sourceType:'fault',genId:'g1',genName:'GEN-01',desc:'Battery',qty:1,unitPrice:120},
    {kind:'good',sourceType:'manual',desc:'Oil filter',qty:4,unitPrice:18}
  ],discount:0,paidAmount:0,status:'sent'};`);
  check('scope all keeps every line', run(sb,`scopeLines(__doc.lines,'all').length`)===4);
  check('services only', run(sb,`scopeLines(__doc.lines,'services').length`)===2);
  check('goods only', run(sb,`scopeLines(__doc.lines,'goods').length`)===2);
  check('services-only subtotal', run(sb,`linesSubtotal(scopeLines(__doc.lines,'services'))`)===202);
  check('goods-only subtotal', run(sb,`linesSubtotal(scopeLines(__doc.lines,'goods'))`)===192);
  check('the two scopes add back up to the whole invoice',
        run(sb,`round2(linesSubtotal(scopeLines(__doc.lines,'services'))+linesSubtotal(scopeLines(__doc.lines,'goods')))`)
        === run(sb,`linesSubtotal(__doc.lines)`));
  let dt = run(sb,`documentTotals(__doc,'services','detailed')`);
  check('a partial issue is flagged as partial', dt.partial===true);
  check('a partial issue prints only its own subtotal', dt.total===202);
  check('a partial issue does not claim the payment', dt.paid===0);
  dt = run(sb,`documentTotals(__doc,'all','detailed')`);
  check('a full issue is not partial and matches the stored total', dt.partial===false && dt.total===394, dt.total);

  console.log('\n=== Routine vs corrective, issued separately ===');
  check('scheduled maintenance scope keeps only routine visits',
        run(sb,`scopeLines(__doc.lines,'routine').length`)===1,
        run(sb,`scopeLines(__doc.lines,'routine').length`));
  check('...and it is the routine line', run(sb,`scopeLines(__doc.lines,'routine')[0].unitPrice`)===22);
  check('corrective scope keeps only corrective service lines',
        run(sb,`scopeLines(__doc.lines,'corrective').length`)===1,
        run(sb,`scopeLines(__doc.lines,'corrective').length`));
  check('...and it is the 180 corrective line', run(sb,`scopeLines(__doc.lines,'corrective')[0].unitPrice`)===180);
  check('neither scope leaks a goods line',
        run(sb,`scopeLines(__doc.lines,'routine').concat(scopeLines(__doc.lines,'corrective')).every(l=>l.kind==='service')`)===true);
  check('routine subtotal', run(sb,`linesSubtotal(scopeLines(__doc.lines,'routine'))`)===22);
  check('corrective subtotal', run(sb,`linesSubtotal(scopeLines(__doc.lines,'corrective'))`)===180);
  check('routine + corrective together equal all services',
        run(sb,`round2(linesSubtotal(scopeLines(__doc.lines,'routine'))+linesSubtotal(scopeLines(__doc.lines,'corrective')))`)
        === run(sb,`linesSubtotal(scopeLines(__doc.lines,'services'))`));
  check('routine + corrective + goods equal the whole invoice',
        run(sb,`round2(linesSubtotal(scopeLines(__doc.lines,'routine'))+linesSubtotal(scopeLines(__doc.lines,'corrective'))+linesSubtotal(scopeLines(__doc.lines,'goods')))`)
        === run(sb,`linesSubtotal(__doc.lines)`));
  check('no service line can fall outside both scopes (a manual service line lands in corrective)',
        run(sb,`scopeLines([{kind:'service',sourceType:'manual',qty:1,unitPrice:50}],'corrective').length`)===1);
  dt = run(sb,`documentTotals(__doc,'routine','detailed')`);
  check('a scheduled-maintenance issue is marked partial', dt.partial===true && dt.total===22, dt.total);
  dt = run(sb,`documentTotals(__doc,'corrective','detailed')`);
  check('a corrective issue is marked partial', dt.partial===true && dt.total===180, dt.total);

  console.log('\n=== The two new documents print correctly ===');
  run(sb,`STATE.invoices=[{id:'ix',invoiceNo:'INV-1100',invoiceSeq:1100,client:'FAO',date:'2026-09-08',status:'sent',
    paidAmount:0,discount:0,lines:[
      {kind:'service',sourceType:'service',genId:'g1',genName:'GEN-01',desc:'Scheduled maintenance service - 250 hr',qty:1,unitPrice:23,total:23},
      {kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',ref:'Cor-818',desc:'Corrective repair service',qty:1,unitPrice:180,total:180},
      {kind:'good',sourceType:'manual',desc:'Oil filter',qty:2,unitPrice:18,total:36}]}];`);
  let rBody = run(sb,`invoiceReportBody(STATE.invoices[0],'routine','detailed')`);
  check('scheduled-maintenance document keeps the routine line', rBody.indexOf('Scheduled maintenance service')>=0);
  check('scheduled-maintenance document drops the corrective line', rBody.indexOf('Corrective repair service')<0);
  check('scheduled-maintenance document drops the goods line', rBody.indexOf('Oil filter')<0);
  check('scheduled-maintenance document is stamped partial', rBody.indexOf('partial issue')>=0);
  let cBody = run(sb,`invoiceReportBody(STATE.invoices[0],'corrective','detailed')`);
  check('corrective document keeps the corrective line', cBody.indexOf('Corrective repair service')>=0);
  check('corrective document drops the routine line', cBody.indexOf('Scheduled maintenance service')<0);
  check('corrective document drops the goods line', cBody.indexOf('Oil filter')<0);
  check('corrective document names the contents on the header',
        cBody.indexOf(run(sb,`t('inv_scope_corrective')`))>=0);
  check('each new scope has a label in both languages',
        run(sb,`['routine','corrective'].every(v=>!!I18N.en['inv_scope_'+v] && !!I18N.ar['inv_scope_'+v])`)===true);
  check('both new scopes are offered in the dropdown list',
        run(sb,`INVOICE_SCOPES.indexOf('routine')>=0 && INVOICE_SCOPES.indexOf('corrective')>=0`)===true);

  console.log('\n=== Summary invoice: 2 lines per genset ===');
  run(sb,`__sum={lines:[
    {kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',desc:'Repair Cor-1',ref:'Cor-1',qty:1,unitPrice:180},
    {kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',desc:'Repair Cor-2',ref:'Cor-2',qty:1,unitPrice:180},
    {kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',desc:'Repair Cor-3',ref:'Cor-3',qty:1,unitPrice:180},
    {kind:'service',sourceType:'service',genId:'g1',genName:'GEN-01',desc:'Routine A',qty:1,unitPrice:22},
    {kind:'service',sourceType:'service',genId:'g1',genName:'GEN-01',desc:'Routine B',qty:1,unitPrice:22},
    {kind:'service',sourceType:'fault',genId:'g2',genName:'GEN-02',desc:'Repair Cor-9',qty:1,unitPrice:180},
    {kind:'service',sourceType:'service',genId:'g2',genName:'GEN-02',desc:'Routine C',qty:1,unitPrice:22}
  ],discount:0,paidAmount:0,status:'sent'};`);
  let sumLines = run(sb,`summariseLines(__sum.lines)`);
  check('two gensets x (fault + routine) = 4 summary lines', sumLines.length===4, 'got '+sumLines.length);
  const g1f = sumLines.find(l=>l.genId==='g1' && l.sourceType==='fault');
  const g1r = sumLines.find(l=>l.genId==='g1' && l.sourceType==='service');
  check('GEN-01 corrective line carries qty 3', g1f.qty===3, g1f.qty);
  check('GEN-01 corrective line totals 540', g1f.total===540, g1f.total);
  check('GEN-01 routine line carries qty 2', g1r.qty===2);
  check('GEN-01 routine line totals 44', g1r.total===44);
  check('summary line names the generator', g1f.desc.indexOf('GEN-01')>=0, g1f.desc);
  check('summary line says which kind of visit', g1r.desc.indexOf('Routine')>=0, g1r.desc);
  check('summary drops the per-fault references', sumLines.every(l=>!l.ref));
  check('summary total equals the detailed total',
        run(sb,`linesSubtotal(summariseLines(__sum.lines))`)===run(sb,`linesSubtotal(__sum.lines)`),
        run(sb,`linesSubtotal(summariseLines(__sum.lines))`)+' vs '+run(sb,`linesSubtotal(__sum.lines)`));
  run(sb,`__mixed=[{kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',qty:1,unitPrice:180},
                  {kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',qty:1,unitPrice:150}];`);
  check('two different fault rates stay on separate summary lines',
        run(sb,`summariseLines(__mixed).length`)===2);
  check('...and the money is still exact',
        run(sb,`linesSubtotal(summariseLines(__mixed))`)===330);
  check('goods are summarised by item, quantities added',
        run(sb,`summariseLines([{kind:'good',desc:'Oil filter',qty:4,unitPrice:18},{kind:'good',desc:'Oil filter',qty:6,unitPrice:18}]).length`)===1);
  check('...with the combined quantity',
        run(sb,`summariseLines([{kind:'good',desc:'Oil filter',qty:4,unitPrice:18},{kind:'good',desc:'Oil filter',qty:6,unitPrice:18}])[0].qty`)===10);
  check('summary services come before summary goods',
        run(sb,`summariseLines([{kind:'good',desc:'X',qty:1,unitPrice:1},{kind:'service',sourceType:'fault',genName:'A',qty:1,unitPrice:1}])[0].kind`)==='service');
  check('summary + goods-only scope combine correctly',
        run(sb,`documentLines(__doc,'goods','summary').every(l=>l.kind!=='service')`)===true);

  console.log('\n=== Invoice header fields + bank details ===');
  run(sb,`STATE.billing={serviceRate:180,routineRate:22,currency:'USD',
      bank1Name:'Alkuraimi Islamic Microfinance Bank',bank1Acct:'3108401426',
      bank2Name:'AL Qutaibi Bank',bank2Acct:'436323641'};`);
  check('both banks are listed', run(sb,'bankAccounts().length')===2);
  check('a blank second bank is dropped',
        run(sb,`(function(){var b=STATE.billing;STATE.billing={bank1Name:'X',bank1Acct:'1'};var n=bankAccounts().length;STATE.billing=b;return n;})()`)===1);
  run(sb,`STATE.invoices=[{id:'i9',invoiceNo:'INV-1009',invoiceSeq:1009,client:'FAO',genId:'g1',date:'2026-08-14',
    orderNo:'PO-4471',contractNo:'FRA/CO/YE/2026/11',serialNo:'SN-002',dueDate:'2026-09-13',
    status:'sent',paidAmount:0,discount:0,
    lines:[{kind:'service',sourceType:'fault',genId:'g1',genName:'GEN-01',ref:'Cor-818',desc:'Repair',qty:1,unitPrice:180},
           {kind:'good',sourceType:'manual',desc:'Oil filter',qty:4,unitPrice:18}]}];`);
  let body = run(sb,`invoiceReportBody(STATE.invoices[0],'all','detailed')`);
  check('document shows the order number', body.indexOf('PO-4471')>=0);
  check('document shows the FRA/contract number', body.indexOf('FRA/CO/YE/2026/11')>=0);
  check('document shows the serial number', body.indexOf('SN-002')>=0);
  check('document shows the invoice date', body.indexOf('2026')>=0);
  check('document shows the Alkuraimi account', body.indexOf('3108401426')>=0);
  check('document shows the Al Qutaibi account', body.indexOf('436323641')>=0);
  check('document names both banks',
        body.indexOf('Alkuraimi')>=0 && body.indexOf('Qutaibi')>=0);
  let sBody = run(sb,`invoiceReportBody(STATE.invoices[0],'services','detailed')`);
  check('services-only document omits the goods line', sBody.indexOf('Oil filter')<0);
  check('services-only document keeps the service line', sBody.indexOf('Repair')>=0);
  check('services-only document is marked as a partial issue',
        sBody.indexOf('partial issue')>=0, 'expected the partial-issue note');
  let gBody = run(sb,`invoiceReportBody(STATE.invoices[0],'goods','detailed')`);
  check('goods-only document omits the service line', gBody.indexOf('Repair')<0);
  check('goods-only document keeps the goods line', gBody.indexOf('Oil filter')>=0);
  let sumBody = run(sb,`invoiceReportBody(STATE.invoices[0],'services','summary')`);
  check('summary document hides the fault reference', sumBody.indexOf('Cor-818')<0);
  check('summary document shows the grouped visit line', sumBody.indexOf('Corrective maintenance visits')>=0);
  check('an unknown scope falls back to the full document',
        run(sb,`invoiceReportBody(STATE.invoices[0],'nonsense','detailed')`).indexOf('Oil filter')>=0);

  console.log('\n=== Existing records keep working (nothing lost) ===');
  run(sb,`STATE.billing={serviceRate:180,routineRate:22,currency:'USD'};
          __old={id:'old1',genId:'g1',faultId:'Cor-800',date:'2026-05-01',status:'closed',
                 description:'Old fault saved before billing existed',partsUsed:'Clamp, hose'};`);
  check('a fault with no serviceFee field still gets the default rate', run(sb,'faultServiceFee(__old)')===180);
  check('a fault with no partsLines returns an empty list', run(sb,'faultPartsLines(__old).length')===0);
  check('its billable total is just the fee', run(sb,'faultBillableTotal(__old)')===180);
  check('its free-text partsUsed is untouched', run(sb,'__old.partsUsed')==='Clamp, hose');
  check('the old fault still renders on a card', run(sb,'renderFaultBillingSummary(__old)').indexOf('180.00')>=0);
  check('the old fault still renders its official report',
        run(sb,'faultReportBody(__old)').indexOf('Cor-800')>=0);
  run(sb,`__oldInv={id:'oi',invoiceNo:'INV-999',invoiceSeq:999,client:'FAO',date:'2026-06-01',status:'sent',
            lines:[{kind:'service',sourceType:'fault',sourceId:'x',desc:'Old line',qty:1,unitPrice:180}]};`);
  check('an invoice line with no genId still summarises', run(sb,'summariseLines(__oldInv.lines).length')===1);
  check('an invoice with no discount/paid fields totals correctly',
        run(sb,'invoiceTotals(__oldInv).total')===180 && run(sb,'invoiceTotals(__oldInv).balance')===180);
  check('an old invoice still prints', run(sb,`invoiceReportBody(__oldInv,'all','detailed')`).indexOf('INV-999')>=0);
  check('a fault with no photos/customFields still reports',
        run(sb,'faultReportBody({genId:"g1",faultId:"Cor-801"})').indexOf('Cor-801')>=0);

  console.log('\n=== New fields survive the backup ===');
  run(sb,`__sheets.length=0;`);
  run(sb,'exportFullBackup()');
  const ih = run(sb,`__sheets.find(s=>s.name==='Invoices').sheet.rows[0]`);
  check('backup Invoices sheet has orderNo', ih.indexOf('orderNo')>=0, JSON.stringify(ih));
  check('backup Invoices sheet has contractNo', ih.indexOf('contractNo')>=0);
  check('backup Invoices sheet has serialNo', ih.indexOf('serialNo')>=0);
  const lh = run(sb,`__sheets.find(s=>s.name==='InvoiceLines').sheet.rows[0]`);
  check('backup InvoiceLines sheet records the generator', lh.indexOf('generator')>=0, JSON.stringify(lh));
  check('backup still has all the original sheets',
        ['Generators','Readings','ServiceHistory','Correctives','MaintBaselines']
          .every(n=>run(sb,'__sheets.map(s=>s.name)').indexOf(n)>=0));

  console.log('\n=== New labels are translated + editable ===');
  check('every scope has both languages',
        run(sb,`INVOICE_SCOPES.every(v=>!!I18N.en['inv_scope_'+v] && !!I18N.ar['inv_scope_'+v])`)===true);
  check('every detail level has both languages',
        run(sb,`INVOICE_DETAILS.every(v=>!!I18N.en['inv_detail_'+v] && !!I18N.ar['inv_detail_'+v])`)===true);
  check('bank + rate labels exist in both languages',
        run(sb,`['bill_routine_rate','bill_corrective_rate','bill_bank1_name','inv_order_no','inv_contract_no','inv_serial_no']
                 .every(k=>!!I18N.en[k] && !!I18N.ar[k])`)===true);

  console.log('\n===============================');
  console.log('TOTAL: '+pass+' passed, '+fail+' failed');
  console.log('===============================');
  process.exit(fail?1:0);
})();
