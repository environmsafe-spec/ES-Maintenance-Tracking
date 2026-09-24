/*
 * Add one corrective record to the live app from a JSON file — exactly the shape the
 * Corrective tab's "New record" form saves, including the next serial Cor-… ID.
 *
 *     node add_corrective.js records/<file>.json            # dry run: shows what would be saved
 *     node add_corrective.js records/<file>.json --commit   # actually saves it
 *
 * In the JSON, "generator" is matched against the generator's id or name (case-insensitive).
 * "serviceFee" left out = the corrective rate from Setup → Billing (default 180).
 * Refuses to save a second record with the same generator, date and short description.
 * Needs ES_FIREBASE_EMAIL / ES_FIREBASE_PASSWORD — see firebase_rest.js.
 */
const fs = require('fs');
const { BASE, signIn, toFields, listAll } = require('./firebase_rest');

const FAULT_ID_PREFIX = 'Cor-', FAULT_ID_START = 813, DEFAULT_SERVICE_RATE = 180;
const round2 = n => Math.round((Number(n)||0) * 100) / 100;

function buildRecord(input, gen, existing, billing){
  const nums = existing.map(c=>c.faultSeq).filter(n=>typeof n==='number' && !isNaN(n));
  const faultSeq = nums.length ? Math.max(...nums) + 1 : FAULT_ID_START;
  const rate = billing && typeof billing.serviceRate === 'number' ? billing.serviceRate : DEFAULT_SERVICE_RATE;
  return {
    genId: gen.id,
    faultSeq,
    faultId: FAULT_ID_PREFIX + faultSeq,
    date: input.date,
    type: input.type || 'other',
    severity: input.severity || 'low',
    status: input.status || 'open',
    ...(input.status === 'closed' ? { closedDate: input.closedDate || input.date } : {}),
    hoursAtEvent: input.hoursAtEvent ?? null,
    shortDescription: input.shortDescription || '',
    description: input.description,
    causesOfFault: input.causesOfFault || '',
    actionTaken: input.actionTaken || '',
    partsUsed: input.partsUsed || '',
    downtimeHrs: input.downtimeHrs ?? null,
    by: input.by || '',
    recommendations: input.recommendations || '',
    serviceFee: input.serviceFee == null ? rate : round2(input.serviceFee),
    partsLines: (input.partsLines||[]).map(l=>({
      itemId: l.itemId || '', name: l.name, desc: l.desc || l.name,
      qty: Number(l.qty) || 0, unitPrice: round2(l.unitPrice), total: round2((Number(l.qty)||0) * round2(l.unitPrice)),
    })),
    photos: [],
    customFields: input.customFields || {},
  };
}

function findGenerator(gens, key){
  const k = String(key||'').trim().toLowerCase();
  const hits = gens.filter(g => g.id.toLowerCase() === k || String(g.name||'').trim().toLowerCase() === k);
  if(hits.length !== 1){
    const list = gens.map(g=>`  ${g.id}  —  ${g.name} (${g.client})`).join('\n');
    throw new Error(`generator "${key}" matched ${hits.length} generators. Use one of:\n${list}`);
  }
  return hits[0];
}

async function main(){
  const file = process.argv[2];
  const commit = process.argv.includes('--commit');
  if(!file) throw new Error('usage: node add_corrective.js <record.json> [--commit]');
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  if(!input.date || !input.description) throw new Error('the record needs at least "date" and "description"');

  const token = await signIn();
  const [gens, existing, settings] = await Promise.all([
    listAll(token, 'generators'), listAll(token, 'corrective'), listAll(token, 'settings'),
  ]);
  const gen = findGenerator(gens, input.generator);
  const dup = existing.find(c => c.genId === gen.id && c.date === input.date &&
    (c.shortDescription||'') === (input.shortDescription||''));
  if(dup) throw new Error(`already saved as ${dup.faultId || dup.id} — not adding it twice`);

  const rec = buildRecord(input, gen, existing, settings.find(s=>s.id==='billing'));
  const partsTotal = rec.partsLines.reduce((s,l)=>s+l.total, 0);
  console.log(`${commit ? 'Saving' : 'DRY RUN — would save'} ${rec.faultId} for ${gen.name} (${gen.id})`);
  console.log(JSON.stringify(rec, null, 2));
  console.log(`Billable: service ${rec.serviceFee} + parts ${round2(partsTotal)} = ${round2(rec.serviceFee + partsTotal)}`);
  if(!commit){ console.log('\nNothing saved. Add --commit to save.'); return; }

  const r = await fetch(`${BASE}/corrective`, {
    method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' },
    body: JSON.stringify({ fields: toFields({ ...rec, savedAt: new Date() }) }),
  });
  if(!r.ok) throw new Error('save failed: ' + r.status + ' ' + await r.text());
  const saved = await r.json();
  console.log(`\nSaved ${rec.faultId} (document ${saved.name.split('/').pop()}).`);
}

if(require.main === module) main().catch(e=>{ console.error(e.message); process.exit(1); });
module.exports = { buildRecord, findGenerator };
