// Run only against the emulator: npm run test:rules. Never targets production.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds
} = require('@firebase/rules-unit-testing');
const {
    doc,
    collection,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp
} = require('firebase/firestore');
let env;
before(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        throw new Error('Firestore emulator required. Use npm run test:rules.');
    }
    env = await initializeTestEnvironment({
        projectId: 'demo-kanji-widget',
        firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') }
    });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
    await env?.cleanup();
});
const entry = (revision = 1) => ({
    version: 1,
    revision,
    payload: '{}',
    updatedAt: serverTimestamp()
});
const ref = (user, owner = 'alice') =>
    doc(env.authenticatedContext(user).firestore(), 'users', owner, 'sync', 'progress');

test('owner can create/read/update only their progress document', async () => {
    await assertSucceeds(setDoc(ref('alice'), entry()));
    await assertSucceeds(getDoc(ref('alice')));
    await assertSucceeds(setDoc(ref('alice'), entry(2)));
});
test('unauthenticated and cross-user reads/writes are denied', async () => {
    await assertSucceeds(setDoc(ref('alice'), entry()));
    const guest = doc(env.unauthenticatedContext().firestore(), 'users/alice/sync/progress');
    await assertFails(getDoc(guest));
    await assertFails(setDoc(guest, entry(2)));
    await assertFails(getDoc(ref('bob')));
    await assertFails(setDoc(ref('bob'), entry(2)));
});
test('stale revision, malformed envelope, extras, oversize, wrong version and client clock are denied', async () => {
    const alice = ref('alice');
    await assertFails(setDoc(alice, entry(2)));
    await assertFails(setDoc(alice, { ...entry(), extra: true }));
    await assertFails(setDoc(alice, { ...entry(), version: 2 }));
    await assertFails(setDoc(alice, { ...entry(), payload: 5 }));
    await assertFails(setDoc(alice, { ...entry(), payload: 'x'.repeat(350001) }));
    await assertFails(setDoc(alice, { ...entry(), updatedAt: new Date(0) }));
    await assertSucceeds(setDoc(alice, entry()));
    await assertFails(setDoc(alice, entry()));
    await assertFails(setDoc(alice, entry(3)));
});
test('listing, deletion and other paths are denied even for the owner', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(ref('alice'), entry()));
    await assertFails(deleteDoc(ref('alice')));
    await assertFails(getDocs(collection(db, 'users/alice/sync')));
    await assertFails(setDoc(doc(db, 'users/alice/other/item'), entry()));
    await assertFails(setDoc(doc(db, 'public/item'), entry()));
});
