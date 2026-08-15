/*
 * One-off seeding of the goods price list from the FAO financial proposal
 * (ANNEX G2 — Cost of Parts and Consumables, July 2026).
 *
 * All three "Spare Part" sheets quote the SAME unit price for each item, so this
 * is one catalogue of 39 items. Quantities are deliberately NOT seeded: the sheets
 * hold per-genset yearly estimates, while the price list only ever holds unit prices.
 *
 * Run once, AFTER publishing firestore-rules.txt (the pricelist collection must be
 * allowed or every write is silently denied):
 *
 *     node seed_pricelist.js            # add anything missing, leave existing items alone
 *     node seed_pricelist.js --update   # also correct the price of items already there
 *
 * Safe to re-run: items are matched on their English name, never duplicated.
 */
const API_KEY = 'AIzaSyD5xqWAVrgRsECjdfkCImfUOM-Gsk3s5tw';
const PROJECT = 'generators-readings';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const UPDATE_EXISTING = process.argv.includes('--update');

const ITEMS = [
  ['Oil Filter',                                   'فلتر زيت',                        'each', 18],
  ['Primary Fuel Filter',                          'فلتر وقود أساسي',                 'each', 27],
  ['Secondary Fuel Filter (Fuel Water Separator)', 'فلتر وقود ثانوي (فاصل ماء)',      'each', 22],
  ['Air Filter (Primary filters)',                 'فلتر هواء أساسي',                 'each', 122],
  ['Air Filter (secondary filters)',               'فلتر هواء ثانوي',                 'each', 22],
  ['Engine Oil (L)',                               'زيت محرك (لتر)',                  'L',    3.6],
  ['Coolants (L)',                                 'سائل تبريد (لتر)',                'L',    3],
  ['Coolant Tank',                                 'خزان سائل التبريد',               'each', 160],
  ['Belt Set (for AC)',                            'طقم سيور (للمكيّف)',              'each', 20],
  ['Belt Set (for Fan)',                           'طقم سيور (للمروحة)',              'each', 40],
  ['Water Pump',                                   'طرمبة ماء',                       'each', 218.5],
  ['Unit Injectors',                               'بخاخات (وحدات حقن)',              'each', 800],
  ['Timing Case Cover',                            'غطاء علبة التوقيت',               'each', 172],
  ['Lift Pump',                                    'طرمبة رفع الوقود',                'each', 250],
  ['Fuel Injection Nozzles',                       'رشاشات حقن الوقود',               'each', 150],
  ['Oil Pump',                                     'طرمبة زيت',                       'each', 391],
  ['Radiator Cap',                                 'غطاء الرادييتر',                  'each', 27],
  ['Thermostat',                                   'ثرموستات',                        'each', 80.5],
  ['Top Gasket Kit',                               'طقم جوانات علوي',                 'each', 40.25],
  ['Intake Valve',                                 'صمام سحب',                        'each', 39.1],
  ['Exhaust Valve',                                'صمام عادم',                       'each', 39.1],
  ['Oil Cooler',                                   'مبرّد الزيت',                     'each', 391],
  ['Radiator Rubber Mountings',                    'قواعد مطاطية للرادييتر',          'each', 35],
  ['Thrust Washer',                                'وردة دفع',                        'each', 33.35],
  ['Seal',                                         'حلقة إحكام',                      'each', 35],
  ['Rear Oil Seal',                                'حلقة زيت خلفية',                  'each', 11.5],
  ['Front Oil Seal',                               'حلقة زيت أمامية',                 'each', 21.85],
  ['Exhaust Insulation',                           'عزل العادم',                      'each', 60],
  ['Valve Guide',                                  'دليل صمام',                       'each', 14],
  ['Main Bearing',                                 'سبيكة رئيسية',                    'each', 80.5],
  ['Electronic Governor',                          'منظّم إلكتروني',                  'each', 950],
  ['Starter Monitor',                              'مراقب بدء التشغيل',               'each', 483],
  ['Startup Battery',                              'بطارية بدء التشغيل',              'each', 110],
  ['Battery Charger',                              'شاحن بطارية',                     'each', 356.5],
  ['Oil Sensor',                                   'حساس الزيت',                      'each', 120],
  ['Fuel Sensor',                                  'حساس الوقود',                     'each', 126.5],
  ['Pressure Sensor',                              'حساس الضغط',                      'each', 155.25],
  ['Coolant Temperature  Sensor',                  'حساس حرارة سائل التبريد',         'each', 74.75],
  ['Speed Potentiometer',                          'مقاومة ضبط السرعة',               'each', 51.75],
];

async function signIn(){
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({returnSecureToken:true})
  });
  if(!r.ok) throw new Error('anonymous sign-in failed: ' + r.status + ' ' + await r.text());
  return (await r.json()).idToken;
}

const val = v => {
  if(v === null || v === undefined) return { nullValue: null };
  if(typeof v === 'boolean') return { booleanValue: v };
  if(typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
};
const plain = f => Object.fromEntries(Object.entries(f||{}).map(([k,v])=>[k, Object.values(v)[0]]));

(async ()=>{
  const token = await signIn();
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const listRes = await fetch(`${BASE}/pricelist?pageSize=500`, { headers: auth });
  if(!listRes.ok){
    const body = await listRes.text();
    if(listRes.status === 403 || /PERMISSION_DENIED/.test(body)){
      console.error('\nPermission denied reading the pricelist collection.');
      console.error('Publish firestore-rules.txt in the Firebase console first, then re-run.\n');
      process.exit(1);
    }
    throw new Error('list failed: ' + listRes.status + ' ' + body);
  }
  const existing = ((await listRes.json()).documents || []).map(d=>({
    id: d.name.split('/').pop(), ...plain(d.fields)
  }));
  const byName = {};
  existing.forEach(i=>{ if(i.nameEn) byName[i.nameEn.trim().toLowerCase()] = i; });
  console.log(`price list currently holds ${existing.length} item(s)`);

  let added = 0, updated = 0, skipped = 0;
  for(const [nameEn, nameAr, unit, unitPrice] of ITEMS){
    const found = byName[nameEn.trim().toLowerCase()];
    if(found){
      if(UPDATE_EXISTING && Number(found.unitPrice) !== unitPrice){
        const r = await fetch(`${BASE}/pricelist/${found.id}?updateMask.fieldPaths=unitPrice`, {
          method:'PATCH', headers: auth, body: JSON.stringify({ fields: { unitPrice: val(unitPrice) } })
        });
        if(!r.ok) throw new Error('update failed for '+nameEn+': '+await r.text());
        console.log(`  ~ ${nameEn}: ${found.unitPrice} -> ${unitPrice}`);
        updated++;
      }else{
        skipped++;
      }
      continue;
    }
    const r = await fetch(`${BASE}/pricelist`, {
      method:'POST', headers: auth,
      body: JSON.stringify({ fields: {
        nameEn: val(nameEn), nameAr: val(nameAr), unit: val(unit),
        unitPrice: val(unitPrice), active: val(true),
        source: val('FAO financial proposal ANNEX G2, July 2026')
      }})
    });
    if(!r.ok) throw new Error('add failed for '+nameEn+': '+await r.text());
    console.log(`  + ${nameEn}  ${unitPrice} USD`);
    added++;
  }
  console.log(`\ndone — ${added} added, ${updated} price(s) corrected, ${skipped} already present`);
  if(!UPDATE_EXISTING && skipped) console.log('(re-run with --update to also correct existing prices)');
})().catch(e=>{ console.error('\n' + e.message); process.exit(1); });
