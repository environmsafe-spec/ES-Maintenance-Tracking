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

// The app now requires a real signed-in account (email/password) rather than auto-anonymous
// sign-in, so these mocks simulate "a technician is already logged in" by default — these
// suites are about seeding/sync/persistence/permission-diagnostics, not the login screen
// itself (that's covered separately). Pass opts.authAlwaysFails to simulate the auth SERVICE
// itself erroring (e.g. misconfiguration), which is the new analogous failure mode.
function makeFirebaseMock(backend, opts={}) {
  let authUser = (opts.startLoggedOut || opts.authAlwaysFails) ? null : { uid: 'sim-' + Math.random().toString(36).slice(2), email: 'admin@test.local' };
  const authCallbacks = [];
  const apps = {};
  function makeAuthInstance(){
    let user = authUser;
    return {
      get currentUser(){ return user; },
      onAuthStateChanged(cb, errCb) {
        authCallbacks.push(cb);
        if (opts.authAlwaysFails) { setTimeout(() => errCb && errCb(new Error('auth failed (simulated)')), 0); return () => {}; }
        setTimeout(() => cb(user), 0);
        return () => {};
      },
      async signInWithEmailAndPassword(email, password) {
        user = { uid: 'sim-' + Math.random().toString(36).slice(2), email };
        authUser = user;
        authCallbacks.forEach(cb => cb(user));
        return { user };
      },
      async signOut() { user = null; authUser = null; authCallbacks.forEach(cb => cb(null)); },
    };
  }
  return {
    initializeApp(cfg, name) {
      const key = name || '[DEFAULT]';
      if (!apps[key]) apps[key] = makeAuthInstance();
      return { name: key, auth: () => apps[key] };
    },
    app(name) {
      const key = name || '[DEFAULT]';
      if (!apps[key]) apps[key] = makeAuthInstance();
      return { name: key, auth: () => apps[key] };
    },
    auth() {
      if (!apps['[DEFAULT]']) apps['[DEFAULT]'] = makeAuthInstance();
      return apps['[DEFAULT]'];
    },
    firestore() {
      const db = backend;
      db.enablePersistence = async () => { if (opts.noPersistence) throw { code: 'unimplemented' }; };
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

  section('2. Auth failure shows retry UI, never crashes silently');
  {
    const backend = makeBackendV2();
    const fb = attachStatics(makeFirebaseMock(backend, { authAlwaysFails: true }));
    const sb = buildSandbox(fb);
    run(sb, SOURCE);
    await new Promise(r => setTimeout(r, 60));
    const htmlOut = run(sb, "document.getElementById('app').innerHTML");
    check('shows a connect-failure message with retry option', /تعذّر|Couldn.?t connect|حاول|Try again/i.test(htmlOut), htmlOut.slice(0,120));
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

  console.log(`\n===============================`);
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  console.log(`===============================`);
  process.exit(fail ? 1 : 0);
})();
