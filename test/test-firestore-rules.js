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
    serverTimestamp,
    Timestamp
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
test('the owner can delete their own progress, but listing and other paths stay closed', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(ref('alice'), entry()));
    await assertSucceeds(deleteDoc(ref('alice')));
    await assertFails(getDocs(collection(db, 'users/alice/sync')));
    await assertFails(setDoc(doc(db, 'users/alice/other/item'), entry()));
    await assertFails(setDoc(doc(db, 'public/item'), entry()));
});

test('account deletion: only the owner deletes their progress, and nobody can delete a username', async () => {
    await assertSucceeds(setDoc(ref('alice'), entry()));
    await assertFails(deleteDoc(ref('bob', 'alice')));
    const guest = doc(env.unauthenticatedContext().firestore(), 'users/alice/sync/progress');
    await assertFails(deleteDoc(guest));
    await assertSucceeds(setDoc(ref('alice'), entry(2)));
    await assertSucceeds(deleteDoc(ref('alice')));
});

// ---------------------------------------------------------------------------
// Username registry (username-policy.js / username-directory.js)
// ---------------------------------------------------------------------------
const usernameRef = (user, name) =>
    doc(env.authenticatedContext(user).firestore(), 'usernames', name);
const accountRef = (user, owner = user) =>
    doc(env.authenticatedContext(user).firestore(), 'users', owner);
const nameEntry = (uid, extra = {}) => ({
    uid,
    display: uid,
    kind: 'user',
    email: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra
});
const accountEntry = (uid, extra = {}) => ({
    uid,
    username: uid,
    display: uid,
    email: '',
    updatedAt: serverTimestamp(),
    ...extra
});
const days = (count) => Timestamp.fromDate(new Date(Date.now() + count * 86400000));

test('a username is a public single-document read and can never be listed', async () => {
    await assertSucceeds(setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('alice')));
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(guest, 'usernames', 'dante_kanji')));
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDocs(collection(alice, 'usernames')));
    await assertFails(getDocs(collection(guest, 'usernames')));
});

test('the first account owns a username and a second account cannot take it', async () => {
    await assertSucceeds(setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('bob', 'dante_kanji'), nameEntry('bob')));
    await assertSucceeds(getDoc(usernameRef('bob', 'dante_kanji')));
});

test('only the accepted username shape can be registered', async () => {
    await assertFails(setDoc(usernameRef('alice', 'admin'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('alice', 'ab'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('alice', 'Dante_Kanji'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('alice', 'dante kanji'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('alice', 'dante__kanji'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('alice', 'dante_'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('alice', '1dante'), nameEntry('alice')));
    await assertFails(setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('bob')));
    await assertFails(
        setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('alice', { kind: 'reserved' }))
    );
    await assertFails(
        setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('alice', { extra: true }))
    );
    await assertFails(
        setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('alice', { display: 'x'.repeat(21) }))
    );
});

test('renaming reserves the previous username instead of freeing it', async () => {
    await assertSucceeds(setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('alice')));
    await assertFails(
        setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('bob')),
        'a different account cannot release a name'
    );
    await assertSucceeds(
        setDoc(
            usernameRef('alice', 'dante_kanji'),
            {
                uid: '',
                display: 'dante_kanji',
                kind: 'reserved',
                email: '',
                releasedAt: serverTimestamp(),
                reservedUntil: days(30)
            },
            { merge: true }
        )
    );
    const reservation = await getDoc(usernameRef('bob', 'dante_kanji'));
    if (!reservation.exists() || reservation.data().kind !== 'reserved') {
        throw new Error('the reservation was not stored');
    }
    await assertFails(setDoc(usernameRef('bob', 'dante_kanji'), nameEntry('bob')));
});

test('a lapsed reservation can be claimed by another account', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'usernames', 'lapsed_name'), {
            uid: '',
            display: 'lapsed_name',
            kind: 'reserved',
            email: '',
            reservedUntil: Timestamp.fromDate(new Date(Date.now() - 1000))
        });
    });
    await assertSucceeds(setDoc(usernameRef('bob', 'lapsed_name'), nameEntry('bob')));
    await assertFails(setDoc(usernameRef('carol', 'lapsed_name'), nameEntry('carol')));
});

test('a deleted account releases its username as a reservation instead of freeing it', async () => {
    await assertSucceeds(setDoc(usernameRef('alice', 'dante_kanji'), nameEntry('alice')));
    await assertSucceeds(
        setDoc(
            usernameRef('alice', 'dante_kanji'),
            {
                uid: '',
                display: 'dante_kanji',
                kind: 'reserved',
                email: '',
                releasedAt: serverTimestamp(),
                reservedUntil: Timestamp.fromDate(new Date(Date.now() + 86400000))
            },
            { merge: true }
        )
    );
    // Still not claimable before the window lapses, and never deletable.
    await assertFails(setDoc(usernameRef('bob', 'dante_kanji'), nameEntry('bob')));
    await assertFails(deleteDoc(usernameRef('alice', 'dante_kanji')));
});

test('account records are owner-only, validated and deletable only by their owner', async () => {
    await assertSucceeds(setDoc(accountRef('alice'), accountEntry('alice')));
    await assertFails(getDoc(accountRef('bob', 'alice')));
    await assertFails(setDoc(accountRef('bob', 'alice'), accountEntry('bob')));
    await assertFails(setDoc(accountRef('alice'), accountEntry('alice', { username: 'Dante' })));
    await assertFails(setDoc(accountRef('alice'), accountEntry('alice', { extra: true })));
    await assertFails(
        setDoc(accountRef('alice'), accountEntry('alice', { email: 'x'.repeat(255) }))
    );
    await assertSucceeds(
        setDoc(accountRef('alice'), accountEntry('alice', { email: 'alice@example.com' }), {
            merge: true
        })
    );
    // Account deletion is the one case where the owner removes the record.
    await assertFails(deleteDoc(accountRef('bob', 'alice')));
    await assertSucceeds(deleteDoc(accountRef('alice')));
});
