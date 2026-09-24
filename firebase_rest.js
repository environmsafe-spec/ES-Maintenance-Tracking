/*
 * Shared helpers for the command-line tools (seed_pricelist.js, add_corrective.js).
 * They talk to Firestore's REST API as a named email/password account — the rules
 * reject anonymous tokens. The account comes from two environment variables, so a
 * password never has to be typed into a chat or committed:
 *
 *     ES_FIREBASE_EMAIL      e.g. claude-bot@environmsafe.com
 *     ES_FIREBASE_PASSWORD
 */
const API_KEY = 'AIzaSyD5xqWAVrgRsECjdfkCImfUOM-Gsk3s5tw';
const PROJECT = 'generators-readings';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function signIn(){
  const email = process.env.ES_FIREBASE_EMAIL, password = process.env.ES_FIREBASE_PASSWORD;
  if(!email || !password) throw new Error('Set ES_FIREBASE_EMAIL and ES_FIREBASE_PASSWORD (a Firebase email/password account).');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email, password, returnSecureToken:true })
  });
  if(!r.ok) throw new Error('sign-in failed: ' + r.status + ' ' + await r.text());
  return (await r.json()).idToken;
}

// JS value -> Firestore REST value (handles nested maps and arrays).
function toValue(v){
  if(v === null || v === undefined) return { nullValue: null };
  if(typeof v === 'boolean') return { booleanValue: v };
  if(typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if(Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if(v instanceof Date) return { timestampValue: v.toISOString() };
  if(typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
const toFields = o => Object.fromEntries(Object.entries(o).map(([k,v])=>[k, toValue(v)]));

// Firestore REST value -> JS value.
function fromValue(v){
  if('mapValue' in v) return fromFields(v.mapValue.fields);
  if('arrayValue' in v) return (v.arrayValue.values||[]).map(fromValue);
  if('integerValue' in v) return Number(v.integerValue);
  if('nullValue' in v) return null;
  return Object.values(v)[0];
}
const fromFields = f => Object.fromEntries(Object.entries(f||{}).map(([k,v])=>[k, fromValue(v)]));

// Every document in a collection, as {id, ...data}.
async function listAll(token, collection){
  const out = [];
  let pageToken = '';
  do{
    const r = await fetch(`${BASE}/${collection}?pageSize=300${pageToken ? '&pageToken='+pageToken : ''}`,
      { headers:{ Authorization:'Bearer '+token } });
    if(!r.ok) throw new Error(`reading ${collection} failed: ${r.status} ${await r.text()}`);
    const j = await r.json();
    (j.documents||[]).forEach(d=> out.push({ id: d.name.split('/').pop(), ...fromFields(d.fields) }));
    pageToken = j.nextPageToken || '';
  }while(pageToken);
  return out;
}

module.exports = { API_KEY, PROJECT, BASE, signIn, toValue, toFields, fromFields, listAll };
