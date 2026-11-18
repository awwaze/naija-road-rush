// Player accounts: guest play (Firebase anonymous auth), Google sign-in, player ID numbers, cloud saves.
// Works in the Android/iOS app (native Google sign-in via @capacitor-firebase/authentication)
// and in a normal browser (Google pop-up). Disabled gracefully until firebase-config.js is filled in.
import { FIREBASE_CONFIG } from './firebase-config.js';

const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
let fb = null;            // lazily imported Firebase modules
let auth = null, db = null;
let profile = null;       // { uid, playerId, name, photo, isGuest }
const listeners = new Set();
let saveTimer = null, pendingSave = null;

export const Account = {
  enabled: !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey),
  get profile() { return profile; },
  onChange(fn) { listeners.add(fn); fn(profile); return () => listeners.delete(fn); },

  async init(getLocalSave, applyCloudSave) {
    if (!this.enabled) return;
    const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    fb = { A, F };
    const app = initializeApp(FIREBASE_CONFIG);
    auth = NATIVE ? A.initializeAuth(app, { persistence: A.indexedDBLocalPersistence }) : A.getAuth(app);
    db = F.getFirestore(app);
    this._getLocal = getLocalSave; this._apply = applyCloudSave;
    A.onAuthStateChanged(auth, async user => {
      if (!user) { try { await A.signInAnonymously(auth); } catch (e) { console.warn('guest sign-in failed', e); emit(null); } return; }
      try { await loadOrCreate(user); } catch (e) { console.warn('profile load failed', e); profile = basic(user); emit(profile); }
    });
  },

  async signInWithGoogle() {
    if (!this.enabled) throw new Error('Sign-in is not set up yet');
    const { A } = fb; let cred;
    if (NATIVE) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const res = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      cred = A.GoogleAuthProvider.credential(res.credential && res.credential.idToken, res.credential && res.credential.accessToken);
    }
    const cur = auth.currentUser;
    try {
      if (NATIVE) {
        if (cur && cur.isAnonymous) await A.linkWithCredential(cur, cred); else await A.signInWithCredential(auth, cred);
      } else {
        const provider = new A.GoogleAuthProvider();
        if (cur && cur.isAnonymous) await A.linkWithPopup(cur, provider); else await A.signInWithPopup(auth, provider);
      }
    } catch (e) {
      // this Google account already has a profile: switch to it (its cloud save wins)
      if (e && e.code === 'auth/credential-already-in-use') {
        const c2 = A.GoogleAuthProvider.credentialFromError(e) || cred; await A.signInWithCredential(auth, c2);
      } else throw e;
    }
    await loadOrCreate(auth.currentUser, true);
    return profile;
  },

  async signOut() {
    if (!this.enabled) return;
    try { if (NATIVE) { const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication'); await FirebaseAuthentication.signOut(); } } catch (e) { }
    await fb.A.signOut(auth); // onAuthStateChanged will start a fresh guest session
  },

  // called by the game whenever local progress changes (debounced upload)
  queueSave(save) {
    if (!profile || !db) return;
    pendingSave = save; clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush().catch(e => console.warn('cloud save failed', e)), 2500);
  },
  async flushNow() { clearTimeout(saveTimer); await flush(); },
};

function basic(user) { return { uid: user.uid, playerId: null, name: user.displayName || 'Guest Racer', photo: user.photoURL || null, isGuest: user.isAnonymous }; }
function emit(p) { listeners.forEach(fn => { try { fn(p); } catch (e) { } }); }

async function flush() {
  if (!pendingSave || !profile) return;
  const { F } = fb; const s = pendingSave; pendingSave = null;
  const data = { save: JSON.parse(JSON.stringify({ ...s, settings: undefined })), name: profile.name, playerId: profile.playerId, updated: F.serverTimestamp(), guest: profile.isGuest };
  await F.setDoc(F.doc(db, 'players', profile.uid), data, { merge: true });
}

async function newPlayerId(uid) {
  const { F } = fb;
  for (let tries = 0; tries < 8; tries++) {
    const id = String(10000000 + Math.floor(Math.random() * 89999999));
    try {
      await F.runTransaction(db, async tx => {
        const ref = F.doc(db, 'ids', id), snap = await tx.get(ref);
        if (snap.exists()) throw new Error('taken');
        tx.set(ref, { uid, created: F.serverTimestamp() });
      });
      return id;
    } catch (e) { if (e.message !== 'taken') throw e; }
  }
  throw new Error('could not allocate a player ID');
}

let loading = null, loadingUid = null;
function loadOrCreate(user, afterGoogle) {
  // one profile load per user at a time (auth listener + sign-in both call this)
  if (loading && loadingUid === user.uid) return loading;
  loadingUid = user.uid;
  loading = doLoadOrCreate(user, afterGoogle).finally(() => { loading = null; loadingUid = null; });
  return loading;
}
async function doLoadOrCreate(user, afterGoogle) {
  const { F } = fb;
  const ref = F.doc(db, 'players', user.uid), snap = await F.getDoc(ref);
  const p = basic(user);
  if (snap.exists()) {
    const d = snap.data(); p.playerId = d.playerId; if (!user.displayName && d.name) p.name = d.name;
    if (d.save) Account._apply(d.save, afterGoogle);
    if (afterGoogle && !user.isAnonymous && d.guest) await F.setDoc(ref, { guest: false, name: p.name }, { merge: true });
  } else {
    p.playerId = await newPlayerId(user.uid);
    await F.setDoc(ref, { playerId: p.playerId, name: p.name, created: F.serverTimestamp(), guest: user.isAnonymous, save: JSON.parse(JSON.stringify({ ...Account._getLocal(), settings: undefined })) });
  }
  profile = p; emit(profile);
}
