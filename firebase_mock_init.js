(function(){
  const collections = {};
  const listeners = {};
  let idCounter = 1;
  function notify(name){
    const docs = Object.entries(collections[name]||{}).map(([id,data])=>({id,data:()=>({...data})}));
    const snap = { docs, empty: docs.length===0 };
    (listeners[name]||new Set()).forEach(cb=>cb(snap));
  }

  function makeDb(){
    return {
      collection(name){
        collections[name] = collections[name] || {};
        listeners[name] = listeners[name] || new Set();
        return {
          onSnapshot(cb){ listeners[name].add(cb); setTimeout(()=>notify(name),0); return ()=>listeners[name].delete(cb); },
          async add(data){ const id='auto'+(idCounter++); collections[name][id]={...data}; notify(name); return {id}; },
          doc(id){
            return {
              __collection:name, __id:id,
              async set(data){ collections[name][id]={...data}; notify(name); },
              async update(data){ collections[name][id]={...(collections[name][id]||{}),...data}; notify(name); },
              async delete(){ delete collections[name][id]; notify(name); },
            };
          },
          limit(n){ return { async get(){ const e=Object.entries(collections[name]).slice(0,n); return {empty:e.length===0, docs:e.map(([id,data])=>({id,data:()=>({...data})}))}; } }; },
        };
      },
      batch(){
        const ops=[];
        return { set(ref,data){ ops.push({name:ref.__collection,id:ref.__id,data}); }, async commit(){ ops.forEach(({name,id,data})=>{ collections[name][id]={...data}; }); Object.keys(collections).forEach(notify); } };
      },
      async enablePersistence(){},
    };
  }

  // --- Fake Auth: an in-memory user store shared by all app instances (default + secondary),
  // matching real Firebase where every app instance in a project shares the same user pool. ---
  const userStore = {}; // uid -> {uid, email, password}
  let uidCounter = 1;

  function makeAuth(){
    let currentUser = null;
    const stateListeners = [];
    function fire(){ stateListeners.forEach(cb=>setTimeout(()=>cb(currentUser),0)); }
    return {
      get currentUser(){ return currentUser; },
      onAuthStateChanged(cb, errCb){ stateListeners.push(cb); setTimeout(()=>cb(currentUser),0); return ()=>{ const i=stateListeners.indexOf(cb); if(i>=0) stateListeners.splice(i,1); }; },
      async signInAnonymously(){ currentUser = { uid:'anon'+(uidCounter++), email:null }; fire(); return { user: currentUser }; },
      async signInWithEmailAndPassword(email, password){
        const found = Object.values(userStore).find(u=>u.email===email);
        if(!found || found.password !== password){ const e=new Error('invalid credentials'); e.code='auth/invalid-credential'; throw e; }
        currentUser = { uid: found.uid, email: found.email };
        fire();
        return { user: currentUser };
      },
      async createUserWithEmailAndPassword(email, password){
        if(Object.values(userStore).some(u=>u.email===email)){ const e=new Error('email in use'); e.code='auth/email-already-in-use'; throw e; }
        const uid = 'u'+(uidCounter++);
        userStore[uid] = { uid, email, password };
        currentUser = { uid, email };
        fire();
        return { user: currentUser };
      },
      async signOut(){ currentUser = null; fire(); },
    };
  }

  const apps = {};
  function getOrCreateApp(name){
    const key = name || '[DEFAULT]';
    if(!apps[key]) apps[key] = { authInstance: makeAuth() };
    return apps[key];
  }

  const sharedDb = makeDb();

  window.firebase = {
    initializeApp(config, name){
      const app = getOrCreateApp(name);
      return { name: name || '[DEFAULT]', auth: ()=>app.authInstance };
    },
    app(name){
      const key = name || '[DEFAULT]';
      if(!apps[key]) throw new Error('No firebase app named "'+key+'"');
      return { name:key, auth: ()=>apps[key].authInstance };
    },
    auth(){ return getOrCreateApp(null).authInstance; },
    firestore(){ return sharedDb; },
  };
  window.firebase.firestore.FieldValue = { serverTimestamp: ()=> new Date().toISOString() };

  // Seed one admin and one viewer account so Playwright tests can log in as either
  // without needing the (not-yet-built) real signup flow.
  userStore['admin-uid'] = { uid:'admin-uid', email:'admin@test.local', password:'admin123' };
  userStore['viewer-uid'] = { uid:'viewer-uid', email:'viewer@test.local', password:'viewer123' };
  uidCounter = 3;
  collections['users'] = {
    'admin-uid': { email:'admin@test.local', role:'admin' },
    'viewer-uid': { email:'viewer@test.local', role:'viewer' },
  };

  // pre-seed a couple of sample readings for a populated screenshot
  collections['generators'] = {
    'unhcr-1': {name:'UNHCR Genset 1', client:'UNHCR'},
    'unhcr-2': {name:'UNHCR Genset 2', client:'UNHCR'},
    'unhcr-3': {name:'UNHCR Genset 3', client:'UNHCR'},
    'unhcr-4': {name:'UNHCR Genset 4', client:'UNHCR'},
    'unhcr-5': {name:'UNHCR Genset 5', client:'UNHCR'},
    'fao-1': {name:'FAO Genset 1', client:'FAO'},
    'fao-2': {name:'FAO Genset 2', client:'FAO'},
    'fao-3': {name:'FAO Genset 3', client:'FAO'},
  };
  collections['servicelog'] = {
    'sv1': {genId:'fao-1', kind:'hours', intervalKey:'250', intervalLabel:'250 hr', date:'2025-02-10', hoursAtService:400, by:'Ahmed'},
    'sv2': {genId:'fao-1', kind:'hours', intervalKey:'250', intervalLabel:'250 hr', date:'2025-09-05', hoursAtService:700, by:'Ahmed'},
    'sv3': {genId:'fao-1', kind:'hours', intervalKey:'250', intervalLabel:'250 hr', date:'2026-07-08', hoursAtService:1000, by:'Ahmed'},
    'sv4': {genId:'fao-1', kind:'time', intervalKey:'weekly', intervalLabel:'Weekly', date:'2026-07-14', hoursAtService:1150, by:'Saleh'},
    'sv5': {genId:'unhcr-1', kind:'hours', intervalKey:'500', intervalLabel:'500 hr', date:'2025-12-01', hoursAtService:4000, by:'Saleh', backfilled:true},
  };
  collections['corrective'] = {
    'c1': {genId:'fao-1', date:'2026-07-10', type:'failure', severity:'high', status:'open',
           hoursAtEvent:1180, description:'Coolant leak from lower hose', actionTaken:'Clamped temporarily',
           partsUsed:'Hose clamp', downtimeHrs:3.5, by:'Ahmed'},
    'c2': {genId:'fao-1', date:'2026-07-02', type:'repair', severity:'low', status:'closed',
           hoursAtEvent:1050, description:'Replaced air filter', actionTaken:'Fitted new filter',
           partsUsed:'2652C831', downtimeHrs:1, by:'Ahmed', closedDate:'2026-07-02'},
    'c3': {genId:'unhcr-1', date:'2026-07-15', type:'breakdown', severity:'critical', status:'in_progress',
           hoursAtEvent:4870, description:'Engine failed to start', actionTaken:'Battery under test',
           partsUsed:'', downtimeHrs:8, by:'Saleh'},
  };
  collections['maintenance'] = {
    'fao-1': {hrsPerDay:17, time:{weekly:{lastDone:'2026-07-14'}}, hours:{'250':{doneAtHrs:1050}}},
    'fao-2': {hrsPerDay:7},
  };
  collections['readings'] = {
    'r1': {genId:'unhcr-1', timestamp:'2026-07-15T08:00:00.000Z', tech:'Ahmed Al-Sabri', hours:4850, vL1:'305', coolantT:'101', battV:'22.5', fuel:'12', load:'88', notes:'Noticed slight vibration near coupling, will monitor.'},
    'r3': {genId:'fao-1', timestamp:'2026-07-16T08:00:00.000Z', tech:'Ahmed', hours:1230, vL1:'400', coolantT:'80', battV:'26', fuel:'60', load:'40'},
    'r2': {genId:'unhcr-2', timestamp:'2026-07-15T08:00:00.000Z', tech:'Salim Othman', hours:2210, vL1:'400', coolantT:'79', battV:'26.8', fuel:'88', load:'60', notes:''},
  };
})();
