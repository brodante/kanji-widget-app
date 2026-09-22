/* global BackupManager */
// One bounded document per user. No media, AI settings, credentials or Drive tokens.
class CloudSync {
    static KEY = 'kanji_cloud_sync_v1';
    static LIMIT = 350000;
    static keys = [
        'kanji_progress',
        'kanji_recent',
        'kanji_srs_data',
        'kanji_profile',
        'kanji_settings',
        'kanjiSettings'
    ];

    static payload() {
        const data = {};
        for (const key of this.keys) {
            const value = localStorage.getItem(key);
            data[key] =
                value === null ? null : JSON.stringify(BackupManager.scrub(JSON.parse(value)));
        }
        return this.validatePayload(JSON.stringify(data));
    }

    static validatePayload(payload) {
        if (typeof payload !== 'string' || new TextEncoder().encode(payload).length > this.LIMIT) {
            throw new Error(
                'Progress is too large for cloud sync. Export a local backup; your data is safe.'
            );
        }
        const data = JSON.parse(payload);
        if (
            !data ||
            Array.isArray(data) ||
            Object.keys(data).length !== this.keys.length ||
            Object.keys(data).some((key) => !this.keys.includes(key))
        ) {
            throw new Error('Unsupported cloud data. Nothing was restored.');
        }
        const storage = {};
        for (const key of this.keys) {
            if (data[key] !== null) {
                if (typeof data[key] !== 'string') {
                    throw new Error('Invalid cloud progress.');
                }
                const parsed = JSON.parse(data[key]);
                if (
                    !parsed ||
                    typeof parsed !== 'object' ||
                    (key === 'kanji_recent' ? !Array.isArray(parsed) : Array.isArray(parsed))
                ) {
                    throw new Error('Invalid cloud progress shape.');
                }
                storage[key] = JSON.stringify(BackupManager.scrub(parsed));
                data[key] = storage[key];
            }
        }
        BackupManager.validate({ app: 'kanji-widgets', version: 3, storage, media: {} });
        return JSON.stringify(Object.fromEntries(this.keys.map((key) => [key, data[key]])));
    }

    static record(snapshot) {
        if (!snapshot.exists()) {
            return null;
        }
        const data = snapshot.data();
        if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1) {
            throw new Error('Unsupported cloud version. Update the app before syncing.');
        }
        return { ...data, payload: this.validatePayload(data.payload) };
    }

    constructor() {
        this.generation = 0;
        this.uid = null;
        this.remote = undefined;
        this.busy = false;
        this.enabled = false;
        this.message = 'Sign in with Google to save your progress across devices.';
        this.lastCheck = 0;
        this.reload = () => location.reload();
    }

    metadata() {
        try {
            return JSON.parse(localStorage.getItem(CloudSync.KEY) || 'null');
        } catch {
            return null;
        }
    }

    valid(generation) {
        return generation === this.generation && this.uid === window.kanjiAuth?.user?.uid;
    }

    async accountChanged() {
        const uid = window.kanjiAuth?.user?.uid || null;
        if (uid === this.uid) {
            return;
        }
        this.generation++;
        this.uid = uid;
        this.remote = undefined;
        this.enabled = false;
        this.message = uid
            ? 'Checking your cloud progress…'
            : 'Signed out. Progress stays on this device.';
        this.render();
        if (uid) {
            await this.check();
        }
    }

    async connect() {
        if (!this.sdk) {
            this.sdk =
                await import('https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js');
        }
        this.db = this.sdk.getFirestore(window.kanjiAuth.auth.app);
        return this.sdk.doc(this.db, 'users', this.uid, 'sync', 'progress');
    }

    async task(action) {
        if (this.busy || !this.uid) {
            return;
        }
        const generation = this.generation;
        this.busy = true;
        this.render();
        try {
            if (!navigator.onLine) {
                throw new Error('Offline. Keep learning; changes stay here until you reconnect.');
            }
            const ref = await this.connect();
            if (!this.valid(generation)) {
                return;
            }
            await action(ref, generation);
        } catch (error) {
            if (this.valid(generation)) {
                this.enabled = false;
                this.message =
                    error.code === 'permission-denied'
                        ? 'Cloud access is blocked. The site owner needs to publish the Firestore security rules, then choose Check cloud.'
                        : error.code === 'resource-exhausted'
                          ? 'Cloud quota reached. Local learning is safe. Wait for the quota to reset, then choose Check cloud.'
                          : error.message ||
                            'Cloud sync unavailable. Local progress is safe. Choose Check cloud to retry.';
            }
        } finally {
            this.busy = false;
            this.render();
            if (generation !== this.generation && this.uid) {
                this.check();
            }
        }
    }

    async check() {
        return this.task(async (ref, generation) => {
            const remote = CloudSync.record(await this.sdk.getDocFromServer(ref));
            if (!this.valid(generation)) {
                return;
            }
            this.remote = remote;
            this.lastCheck = Date.now();
            const meta = this.metadata();
            this.enabled = Boolean(
                remote &&
                meta?.uid === this.uid &&
                meta.revision === remote.revision &&
                meta.payload === remote.payload
            );
            this.message = this.enabled
                ? 'Cloud sync is on. Changes save while this app is open. Uploaded media stays local.'
                : remote
                  ? 'Review needed: this account has a cloud copy. Choose which progress to keep. Nothing has been replaced.'
                  : 'First cloud save: choose Save this device to associate its progress with this Google account.';
            if (meta?.uid && meta.uid !== this.uid) {
                this.enabled = false;
                this.message =
                    'Different account. This browser still contains the previous learner’s data. Review it before saving to this account.';
            }
        });
    }

    remember(remote) {
        localStorage.setItem(
            CloudSync.KEY,
            JSON.stringify({ uid: this.uid, revision: remote.revision, payload: remote.payload })
        );
        this.remote = remote;
        this.enabled = true;
        // Only one default automatic save system. Drive stays available for manual backups.
        const drive = window.driveBackup;
        if (drive?.config) {
            drive.config.autoSync = false;
            drive.config.frequency = 'never';
            drive.save();
            document.getElementById('accountAutoSync').checked = false;
            document.getElementById('driveFrequency').value = 'never';
        }
    }

    async save(explicit = false) {
        if (this.remote === undefined || (!explicit && !this.enabled)) {
            return;
        }
        if (
            explicit &&
            !confirm(
                `Save this device’s progress to ${window.kanjiAuth.user.email || 'this Google account'}? This replaces its current cloud progress. Download the cloud copy first if you want to keep both.`
            )
        ) {
            return;
        }
        return this.task(async (ref, generation) => {
            const payload = CloudSync.payload();
            const meta = this.metadata();
            if (
                !explicit &&
                (meta?.uid !== this.uid ||
                    meta.revision !== this.remote?.revision ||
                    meta.payload !== this.remote?.payload)
            ) {
                throw new Error(
                    'Local data was restored or changed in another tab. Choose Check cloud and review before saving.'
                );
            }
            if (!explicit && payload === meta.payload) {
                return;
            }
            const expected = this.remote?.revision || 0;
            // A recovery copy is required before explicitly replacing an existing cloud copy.
            if (explicit) {
                await BackupManager.createRecovery();
            }
            if (!this.valid(generation)) {
                return;
            }
            const next = { version: 1, revision: expected + 1, payload };
            const committed = await this.sdk.runTransaction(this.db, async (tx) => {
                const current = CloudSync.record(await tx.get(ref));
                if (!this.valid(generation)) {
                    throw new Error('Account changed. Save cancelled.');
                }
                if ((current?.revision || 0) !== expected) {
                    throw new Error(
                        'Another device saved newer progress. Choose Check cloud and review both copies.'
                    );
                }
                if (current?.payload === payload) {
                    return current;
                }
                tx.set(ref, { ...next, updatedAt: this.sdk.serverTimestamp() });
                return next;
            });
            if (!this.valid(generation)) {
                return;
            }
            this.remember(committed);
            this.message = `Progress saved at ${new Date().toLocaleTimeString()}. Media is not included.`;
        });
    }

    async restore() {
        if (
            !this.remote ||
            !confirm(
                'Use the cloud progress on this device? Current progress will be kept in a local recovery copy. Uploaded media and AI credentials stay on this device.'
            )
        ) {
            return;
        }
        const selected = this.remote;
        return this.task(async (ref, generation) => {
            const current = CloudSync.record(await this.sdk.getDocFromServer(ref));
            if (!this.valid(generation)) {
                return;
            }
            if (current?.revision !== selected.revision) {
                throw new Error('Cloud progress changed. Choose Check cloud before restoring.');
            }
            const before = CloudSync.payload();
            const snapshot = await BackupManager.snapshot();
            if (!this.valid(generation) || before !== CloudSync.payload()) {
                throw new Error('Local progress changed. Review again before restoring.');
            }
            const entries = JSON.parse(current.payload);
            for (const key of CloudSync.keys) {
                if (entries[key] === null) {
                    if (['kanji_settings', 'kanjiSettings'].includes(key)) {
                        snapshot.storage[key] = '{}';
                    } else {
                        delete snapshot.storage[key];
                    }
                } else {
                    snapshot.storage[key] = entries[key];
                }
            }
            document.body.inert = true;
            try {
                await BackupManager.restore(snapshot, { cloudSync: true });
                if (!this.valid(generation)) {
                    throw new Error(
                        'Account changed. Restored data is local; review before enabling sync again.'
                    );
                }
                this.remember(current);
                this.reload();
            } finally {
                document.body.inert = false;
            }
        });
    }

    invalidate() {
        this.generation++;
        this.enabled = false;
        this.remote = undefined;
        this.message =
            'Local data was restored. Choose Check cloud and review before saving again.';
        this.render();
    }

    pause() {
        if (this.busy) {
            return;
        }
        localStorage.removeItem(CloudSync.KEY);
        this.enabled = false;
        this.message =
            'Automatic cloud saves paused on this device. Choose Save this device to resume.';
        this.render();
    }

    download() {
        if (this.remote) {
            BackupManager.download(
                { ...this.remote, app: 'kanji-cloud-progress' },
                'kanji-cloud-progress.json'
            );
        }
    }

    render() {
        document.querySelectorAll('[data-cloud-status]').forEach((node) => {
            node.textContent = this.message;
        });
        document.querySelectorAll('[data-cloud-action]').forEach((button) => {
            const action = button.dataset.cloudAction;
            button.disabled =
                this.busy ||
                !this.uid ||
                ((action === 'restore' || action === 'download') && !this.remote) ||
                (action === 'save' && this.remote === undefined);
            if (action === 'restore') {
                button.hidden = this.enabled || !this.remote;
            }
        });
        document.querySelectorAll('[data-cloud-summary]').forEach((node) => {
            try {
                const count = (payload) => {
                    const data = JSON.parse(payload);
                    const progress = JSON.parse(data.kanji_progress || '{}');
                    return `${(progress.studied || []).length} studied, ${(progress.mastered || []).length} mastered`;
                };
                node.textContent =
                    this.remote && !this.enabled
                        ? `This device: ${count(CloudSync.payload())}. Cloud: ${count(this.remote.payload)} (revision ${this.remote.revision}).`
                        : '';
            } catch {
                node.textContent = '';
            }
        });
    }

    init() {
        document.querySelectorAll('[data-cloud-action]').forEach((button) => {
            button.onclick = () => {
                const actions = {
                    check: () => this.check(),
                    save: () => this.save(true),
                    restore: () => this.restore(),
                    download: () => this.download(),
                    pause: () => this.pause()
                };
                actions[button.dataset.cloudAction]();
            };
        });
        window.addEventListener('kanji-auth-changed', () => this.accountChanged());
        window.addEventListener('online', () => this.check());
        window.addEventListener('storage', (event) => {
            if (event.key === CloudSync.KEY) {
                this.invalidate();
            }
        });
        window.addEventListener('focus', () => {
            if (Date.now() - this.lastCheck > 60000) {
                this.check();
            }
        });
        this.timer = setInterval(() => {
            if (document.hidden || !this.uid || this.busy || !this.enabled || !navigator.onLine) {
                return;
            }
            if (Date.now() - this.lastCheck > 300000) {
                this.check();
            } else {
                this.save();
            }
        }, 30000);
        this.accountChanged();
        this.render();
    }
}
window.CloudSync = CloudSync;
window.addEventListener('DOMContentLoaded', () => {
    window.kanjiCloud = new CloudSync();
    window.kanjiCloud.init();
});
