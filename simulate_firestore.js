const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('/home/claude/generator-readings.html', 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
if (!m) throw new Error('Could not extract inline script');
const SOURCE = m[1];

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`); }
}
function section(t){ console.log(`\n=== ${t} ===`); }

// ---------------- Shared simulated Firestore backend ----------------
// One backend = one Firebase project. Multiple "clients" (sandboxes) attach to it,
// exactly like two technicians' phones both talking to the same Firestore project.
function makeBackend() {
  const collections = {}; // name -> { docId: data }
  const listeners = {};   // name -> Set of callback fns
  let idCounter = 1;

  function notify(name) {
    const snapDocs = Object.entries(collections[name] || {}).map(([id, data]) => ({ id, data: () => ({ ...data }) }));
    const snap = { docs: snapDocs, empty: snapDocs.length === 0 };
    (listeners[name] || new Set()).forEach(cb => cb(snap));
  }

  return {
    collection(name) {
      collections[name] = collections[name] || {};
      listeners[name] = listeners[name] || new Set();
      return {
        onSnapshot(cb, errCb) {
          listeners[name].add(cb);
          // fire immediately with current state, like real Firestore
          setTimeout(() => notify(name), 0);
          return () => listeners[name].delete(cb);
        },
        async add(data) {
          const id = 'auto' + (idCounter++);
          collections[name][id] = { ...data, savedAt: new Date().toISOString() };
          notify(name);
          return { id };
        },
        doc(id) {
          return {
            async set(data) { collections[name][id] = { ...data }; notify(name); },
            async update(data) { collections[name][id] = { ...(collections[name][id]||{}), ...data }; notify(name); },
            async delete() { delete collections[name][id]; notify(name); },
          };
        },
        limit(n) {
          return {
            async get() {
              const entries = Object.entries(collections[name]).slice(0, n);
              return { empty: entries.length === 0, docs: entries.map(([id, data]) => ({ id, data: () => ({ ...data }) })) };
            }
          };
        },
      };
    },
    batch() {
      const ops = [];
      return {
        set(ref, data) { ops.push(() => { /* ref carries collection+id via closure below */ }); this._raw = this._raw || []; this._raw.push({ ref, data }); },
        async commit() {
          (this._raw || []).forEach(({ ref, data }) => { ref.__set(data); });
        }
      };
    },
    _collections: collections,
  };
}

// batch().set needs access to collection/id — patch doc() to expose a raw setter usable by batch
function makeBackendV2() {
  const collections = {};
  const listeners = {};
  let idCounter = 1;
  function notify(name) {
    const snapDocs = Object.entries(collections[name] || {}).map(([id, data]) => ({ id, data: () => ({ ...data }) }));
    const snap = { docs: snapDocs, empty: snapDocs.length === 0 };
    (listeners[name] || new Set()).forEach(cb => cb(snap));
  }
  return {
    collection(name) {
      collections[name] = collections[name] || {};
      listeners[name] = listeners[name] || new Set();
      return {
        onSnapshot(cb) {
          listeners[name].add(cb);
          setTimeout(() => notify(name), 0);
          return () => listeners[name].delete(cb);
        },
        async add(data) {
          const id = 'auto' + (idCounter++);
          collections[name][id] = { ...data };
          notify(name);
          return { id };
        },
        doc(id) {
          return {
            __collection: name, __id: id,
            async set(data) { collections[name][id] = { ...data }; notify(name); },
            async update(data) { collections[name][id] = { ...(collections[name][id]||{}), ...data }; notify(name); },
            async delete() { delete collections[name][id]; notify(name); },
          };
        },
        limit(n) {
          return { async get() {
            const entries = Object.entries(collections[name]).slice(0, n);
            return { empty: entries.length === 0, docs: entries.map(([id, data]) => ({ id, data: () => ({ ...data }) })) };
          }};
        },
      };
    },
    batch() {
      const ops = [];
      return {
        set(ref, data) { ops.push({ name: ref.__collection, id: ref.__id, data }); },
        async commit() {
          ops.forEach(({ name, id, data }) => { collections[name][id] = { ...data }; });
          Object.keys(collections).forEach(notify);
        }
      };
    },
  };
}

function makeFirebaseMock(backend, opts={}) {
  // Email/password only. By default the phone already holds a signed-in session
  // (like a returning technician); opts.signedOut starts at the login screen and
  // opts.anonymousLeftover simulates a session left behind by the old anonymous build.
  let authUser = opts.signedOut ? null
    : opts.anonymousLeftover ? { uid: 'anon-1', isAnonymous: true }
    : { uid: 'sim', isAnonymous: false, email: 'tech@environmsafe.com' };
  const accounts = opts.accounts || { 'tech@environmsafe.com': 'right-pass' };
  const calls = opts.calls || [];
  const authCallbacks = [];
  const setUser = u => { authUser = u; authCallbacks.forEach(cb => cb(authUser)); };
  return {
    initializeApp(cfg) { /* no-op */ },
    auth() {
      return {
        onAuthStateChanged(cb) {
          authCallbacks.push(cb);
          setTimeout(() => cb(authUser), 0);
          return () => {};
        },
        async signInAnonymously() {
          calls.push('signInAnonymously');
          setUser({ uid: 'anon-' + Math.random().toString(36).slice(2), isAnonymous: true });
        },
        async signInWithEmailAndPassword(email, pw) {
          calls.push('signIn:' + email);
          // Older SDKs report these two cases with different codes; the app must not.
          if (!(email in accounts)) { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; }
          if (accounts[email] !== pw) { const e = new Error('bad pw'); e.code = 'auth/wrong-password'; throw e; }
          setUser({ uid: 'u-' + email, isAnonymous: false, email });
        },
        async signOut() { calls.push('signOut'); setUser(null); },
      };
    },
    firestore() {
      const db = backend;
      db.enablePersistence = async () => { if (opts.noPersistence) throw { code: 'unimplemented' }; };
      db.terminate = async () => { calls.push('terminate'); };
      db.clearPersistence = async () => { calls.push('clearPersistence'); };
      db.waitForPendingWrites = async () => { calls.push('waitForPendingWrites'); };
      return db;
    },
  };
}
// firebase.firestore.FieldValue.serverTimestamp — attach as static prop
function attachStatics(fb) {
  fb.firestore.FieldValue = { serverTimestamp: () => new Date().toISOString() };
  return fb;
}

// ---------------- Fake DOM (same approach as earlier test suites) ----------------
function makeEl(id) {
  return {
    id, _value: '', get value(){return this._value;}, set value(v){this._value=v;},
    _text: '', get textContent(){return this._text;}, set textContent(v){this._text=v;},
    _html: '', get innerHTML(){return this._html;}, set innerHTML(v){this._html=v;},
    classList: { add(){}, remove(){}, contains(){return false;}, toggle(){} },
    style: {}, disabled: false, onclick: null,
    addEventListener(evt, fn){ LISTENERS[id] = LISTENERS[id]||{}; LISTENERS[id][evt]=fn; },
    appendChild(){}, removeChild(){},
  };
}
let LISTENERS = {};
let ELEMENTS = {};

function buildSandbox(firebaseMock) {
  LISTENERS = {}; ELEMENTS = {};
  const doc = {
    getElementById(id) {
      if (id.startsWith('chart')) return null;
      if (!ELEMENTS[id]) ELEMENTS[id] = makeEl(id);
      return ELEMENTS[id];
    },
    querySelectorAll() { return []; }, querySelector() { return null; }, documentElement:{setAttribute(){},getAttribute(){}},
    createElement() { return makeEl('anchor'); },
    body: { appendChild(){}, removeChild(){} },
  };
  class FakeBlob { constructor(parts, opts){ this.content = parts.join(''); } }
  const localStore = {};
  const sandbox = {
    console, Date, Math, JSON, Promise, Symbol,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
    Blob: FakeBlob,
    URL: { createObjectURL: b => { sandbox.__lastBlob = b; return 'blob://x'; }, revokeObjectURL(){} },
    confirm: () => true, prompt: () => null, alert: () => {},
    localStorage: {
      getItem: k => (k in localStore ? localStore[k] : null),
      setItem: (k,v) => { localStore[k]=v; },
      removeItem: k => { delete localStore[k]; },
    },
    document: doc,
    location: { reload(){ sandbox.__reloads = (sandbox.__reloads||0) + 1; } },
    firebase: firebaseMock,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}
function run(sb, code) { return vm.runInContext(code, sb); }

(async () => {
  section('1. Fresh connect — seeds default fleet once, via Firestore');
  {
    const backend = makeBackendV2();
    const fb = attachStatics(makeFirebaseMock(backend));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 60));
    const gens = run(sb, 'STATE.generators');
    check('seeds 8 generators through Firestore batch', gens.length === 8, `got ${gens.length}`);
    check('5 UNHCR + 3 FAO', gens.filter(g=>g.client==='UNHCR').length===5 && gens.filter(g=>g.client==='FAO').length===3);
  }

  section('2. Signed out: login screen, never an anonymous session');
  {
    const backend = makeBackendV2();
    const calls = [];
    const fb = attachStatics(makeFirebaseMock(backend, { signedOut: true, calls }));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 60));
    const htmlOut = run(sb, "document.getElementById('app').innerHTML");
    check('shows the email/password login form', /id="loginForm"/.test(htmlOut) && /type="email"/.test(htmlOut) && /type="password"/.test(htmlOut), htmlOut.slice(0,160));
    check('never calls signInAnonymously', !calls.includes('signInAnonymously'), calls.join(','));
    check('does not touch Firestore before sign-in', run(sb, 'STATE.everRendered') !== true && run(sb, 'STATE.generators.length') === 0);

    const submit = async (email, pw) => {
      ELEMENTS['login-email'] = ELEMENTS['login-email'] || makeEl('login-email');
      ELEMENTS['login-pass'] = ELEMENTS['login-pass'] || makeEl('login-pass');
      ELEMENTS['login-email'].value = email; ELEMENTS['login-pass'].value = pw;
      await LISTENERS['loginForm']['submit']({ preventDefault(){} });
      await new Promise(r => setTimeout(r, 60));
      const m = /<div class="login-err" id="loginErr">([^<]*)<\/div>/.exec(run(sb, "document.getElementById('app').innerHTML"));
      return m ? m[1] : '';
    };
    const errUnknown = await submit('nobody@example.com', 'whatever');
    const errWrongPw = await submit('tech@environmsafe.com', 'wrong');
    check('unknown email shows an error', /incorrect|غير صحيحة/i.test(errUnknown), errUnknown);
    check('unknown email and wrong password give the SAME message (no account enumeration)', errUnknown === errWrongPw, `${errUnknown} | ${errWrongPw}`);
    await submit('tech@environmsafe.com', 'right-pass');
    const gens = run(sb, 'STATE.generators');
    check('correct credentials load the app', gens.length === 8 && run(sb, 'STATE.everRendered') === true, `gens=${gens.length}`);
    check('signed-in email is shown in Setup', (run(sb, "STATE.activeTab='generators'; render(); document.getElementById('app').innerHTML")).includes('tech@environmsafe.com'));
  }

  section('2b. Leftover anonymous session is signed out and its cache wiped');
  {
    const backend = makeBackendV2();
    const calls = [];
    const fb = attachStatics(makeFirebaseMock(backend, { anonymousLeftover: true, calls }));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 60));
    check('anonymous session is signed out', calls.includes('signOut'), calls.join(','));
    check('Firestore terminated then persistence cleared', calls.indexOf('terminate') > -1 && calls.indexOf('terminate') < calls.indexOf('clearPersistence'), calls.join(','));
    check('no data was loaded for the anonymous session', run(sb, 'STATE.generators.length') === 0);
    check('page reloads to a clean login screen', (sb.__reloads || 0) >= 1);
  }

  section('2c. Sign-out wipes the on-device Firestore cache');
  {
    const backend = makeBackendV2();
    const calls = [];
    const fb = attachStatics(makeFirebaseMock(backend, { calls }));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 60));
    await run(sb, 'signOutUser()');
    const iT = calls.indexOf('terminate'), iC = calls.indexOf('clearPersistence'), iS = calls.indexOf('signOut');
    check('terminate() then clearPersistence() are called', iT > -1 && iC > iT, calls.join(','));
    check('user is signed out', iS > -1, calls.join(','));
    check('page reloads afterwards', (sb.__reloads || 0) >= 1);
  }

  section('3. TWO DEVICES, ONE PROJECT — save on phone A, appears live on phone B');
  {
    const backend = makeBackendV2(); // shared "cloud" project
    const fbA = attachStatics(makeFirebaseMock(backend));
    const fbB = attachStatics(makeFirebaseMock(backend));
    const sbA = buildSandbox(fbA);
    run(sbA, SOURCE);
    await new Promise(r => setTimeout(r, 60));

    const sbB = buildSandbox(fbB);
    run(sbB, SOURCE);
    await new Promise(r => setTimeout(r, 60));

    const gensA = run(sbA, 'STATE.generators');
    const gensB = run(sbB, 'STATE.generators');
    check('both devices see the same 8 generators (no double-seeding)', gensA.length === 8 && gensB.length === 8, `A=${gensA.length} B=${gensB.length}`);

    // Phone A (technician 1) saves a reading through the real UI flow
    const genId = gensA[0].id;
    run(sbA, `STATE.activeTab='new'; render();`);
    for (const [k,v] of Object.entries({'f-gen':genId,'f-tech':'Ahmed (Phone A)','f-datetime':'2026-07-17T10:00','f-hours':'5000','f-vL1':'400','f-coolantT':'80'})) {
      run(sbA, `document.getElementById('${k}')`); // ensure element exists in sandbox A's own ELEMENTS map
    }
    // fill via sandbox A's own document
    const sbAElements = {};
    // Simplify: drive the form directly inside sandbox context
    await (async () => {
      LISTENERS_TEMP: {}
    })();

    // Use per-sandbox helper: fill fields then click saveBtn's registered handler
    async function fillAndSubmit(sb, values) {
      run(sb, `STATE.activeTab='new'; render();`);
      for (const [k, v] of Object.entries(values)) {
        run(sb, `document.getElementById(${JSON.stringify(k)}).value = ${JSON.stringify(v)};`);
      }
      const handler = run(sb, `(document.getElementById('saveBtn').addEventListener) && undefined`); // no-op, listeners tracked externally
      return null;
    }
    // Because LISTENERS is a module-level object reused per buildSandbox call, re-derive per-sandbox listener maps:
    // (buildSandbox resets the shared LISTENERS/ELEMENTS each call, so capture immediately after render for each sandbox)

    // -- Redo properly: render + fill + click within the SAME buildSandbox context window --
    run(sbA, `STATE.activeTab='new'; render();`);
    // re-point module-level LISTENERS/ELEMENTS to sandbox A by re-running its render (already done); ELEMENTS/LISTENERS are Node-side and were last populated by sbA's render since buildSandbox(sbB) call resets them — need to re-render sbA now to repopulate.
    const aVals = {'f-gen':genId,'f-tech':'Ahmed (Phone A)','f-datetime':'2026-07-17T10:00','f-hours':'5000','f-vL1':'400','f-coolantT':'80'};
    for (const [k,v] of Object.entries(aVals)) { ELEMENTS[k] = ELEMENTS[k] || makeEl(k); ELEMENTS[k].value = v; }
    await LISTENERS['saveBtn']['click']();
    await new Promise(r => setTimeout(r, 60));

    const readsA = run(sbA, 'STATE.readings');
    check('reading appears on phone A (the one that saved it)', readsA.length === 1 && readsA[0].tech === 'Ahmed (Phone A)');

    // Now re-render B's tab to repopulate LISTENERS/ELEMENTS scoped to B, then check B's STATE directly (listener already live from earlier)
    const readsB = run(sbB, 'STATE.readings');
    check('reading appears on phone B WITHOUT phone B doing anything — live sync', readsB.length === 1 && readsB[0].tech === 'Ahmed (Phone A)', `B has ${readsB.length} readings`);
  }

  section('4. Offline persistence hook is wired (enablePersistence called, failures tolerated)');
  {
    const backend = makeBackendV2();
    const fb = attachStatics(makeFirebaseMock(backend, { noPersistence: true }));
    const sb = buildSandbox(fb);
    let threw = false;
    try { run(sb, SOURCE); await new Promise(r => setTimeout(r, 60)); } catch(e) { threw = true; }
    check('app still initializes fine even if persistence is unavailable', !threw);
    const gens = run(sb, 'STATE.generators');
    check('still loads/seeds data normally', gens.length === 8);
  }

  section('5. flagsFor() unaffected by the storage-layer rewrite (regression check)');
  {
    const backend = makeBackendV2();
    const fb = attachStatics(makeFirebaseMock(backend));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 60));
    const f1 = run(sb, `flagsFor({vL1:'300',coolantT:'105',fuel:'5'})`);
    check('out-of-range flags still work', f1.includes('Voltage L1') && f1.includes('Coolant temp') && f1.includes('Fuel level'));
  }

  section('6. Firestore permission-denied shows a SPECIFIC diagnostic, never hangs silently');
  {
    const backend = makeBackendV2();
    // Wrap onSnapshot to immediately error instead of returning data — simulates rules blocking access
    const realCollection = backend.collection.bind(backend);
    backend.collection = (name) => {
      const c = realCollection(name);
      const origSnap = c.onSnapshot.bind(c);
      c.onSnapshot = (cb, errCb) => { setTimeout(()=> errCb({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), 0); return ()=>{}; };
      const origLimit = c.limit.bind(c);
      c.limit = (n) => { const l = origLimit(n); return { get: async () => { const e = new Error('permission-denied'); e.code='permission-denied'; throw e; } }; };
      return c;
    };
    const fb = attachStatics(makeFirebaseMock(backend));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 80));
    const htmlOut = run(sb, "document.getElementById('app').innerHTML");
    check('shows diagnostic mentioning security rules (not stuck on Connecting)', /security rules|permission|قواعد|أمان/i.test(htmlOut), htmlOut.slice(0,200));
    check('is NOT stuck on the generic Connecting message', !/⏳<\/div>(Connecting|جارٍ)/.test(htmlOut));
  }

  section('7. Reading save refused by the rules says NOT SAVED, never "queued"');
  {
    const backend = makeBackendV2();
    const realCollection = backend.collection.bind(backend);
    backend.collection = (name) => {
      const c = realCollection(name);
      if (name === 'readings') c.add = async () => { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };
      return c;
    };
    const fb = attachStatics(makeFirebaseMock(backend));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 60));
    const genId = run(sb, 'STATE.generators[0].id');
    run(sb, `STATE.activeTab='new'; render();`);
    const vals = {'f-gen':genId,'f-tech':'Ahmed','f-datetime':'2026-07-17T10:00','f-hours':'5000','f-vL1':'400'};
    for (const [k,v] of Object.entries(vals)) { ELEMENTS[k] = ELEMENTS[k] || makeEl(k); ELEMENTS[k].value = v; }
    await LISTENERS['saveBtn']['click']();
    await new Promise(r => setTimeout(r, 30));
    const toast = run(sb, "document.getElementById('toast').textContent");
    check('toast says not saved', /not saved|لم يتم الحفظ/i.test(toast), toast);
    check('toast never says queued / will sync', !/queued|will sync|سيتم المزامنة/i.test(toast), toast);
    check('toast tells the user to sign in', /sign in|سجّل الدخول/i.test(toast), toast);
    check('reading was not stored', run(sb, 'STATE.readings.length') === 0);
  }

  console.log(`\n===============================`);
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  console.log(`===============================`);
  process.exit(fail ? 1 : 0);
})();
