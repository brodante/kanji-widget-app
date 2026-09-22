/* global openCustomThemeDB */
// Static-site OAuth: access tokens stay in memory, never in a backup or storage.
class BackupManager {
    static keys = [
        'kanji_progress',
        'kanji_recent',
        'kanji_settings',
        'kanji_srs_data',
        'kanji_ai_settings',
        'kanji_ai_cache',
        'kanjiSettings',
        'theme',
        'lastDarkTheme',
        'lastLightTheme',
        'dailyStreak',
        'lastStudyDate',
        'aiSenseiFabPos'
    ];
    static allowed(key) {
        return this.keys.includes(key) || /^customTheme:slot[123]:settings$/.test(key);
    }
    static scrub(value) {
        if (!value || typeof value !== 'object') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((v) => this.scrub(v));
        }
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
                k,
                /key|token|secret|password/i.test(k) ? '' : this.scrub(v)
            ])
        );
    }
    static async media(write, slots = ['slot1', 'slot2', 'slot3', 'avatar']) {
        const db = await openCustomThemeDB();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('images', write ? 'readwrite' : 'readonly');
                const store = tx.objectStore('images');
                const result = {};
                for (const slot of slots) {
                    if (write) {
                        if (write[slot]) {
                            store.put(write[slot], slot);
                        } else {
                            store.delete(slot);
                        }
                    } else {
                        const req = store.get(slot);
                        req.onsuccess = () => {
                            if (req.result) {
                                result[slot] = req.result;
                            }
                        };
                    }
                }
                tx.oncomplete = () => resolve(result);
                tx.onerror = tx.onabort = () =>
                    reject(tx.error || new Error('Theme storage failed.'));
            });
        } finally {
            db.close();
        }
    }
    static async snapshot() {
        const storage = {};
        for (const key of Object.keys(localStorage).filter((k) => this.allowed(k))) {
            let value = localStorage.getItem(key);
            try {
                value = JSON.stringify(this.scrub(JSON.parse(value)));
            } catch {
                /* plain string */
            }
            storage[key] = value;
        }
        const media = {};
        for (const [slot, blob] of Object.entries(await this.media())) {
            media[slot] = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        }
        return {
            app: 'kanji-widgets',
            version: 3,
            createdAt: new Date().toISOString(),
            storage,
            media
        };
    }
    static validate(data) {
        if (
            data?.app !== 'kanji-widgets' ||
            data.version !== 3 ||
            !data.storage ||
            typeof data.storage !== 'object' ||
            Array.isArray(data.storage) ||
            !data.media ||
            typeof data.media !== 'object' ||
            Array.isArray(data.media)
        ) {
            throw new Error('Not a supported full Kanji Widgets backup.');
        }
        for (const [key, value] of Object.entries(data.storage)) {
            if (!this.allowed(key) || typeof value !== 'string') {
                throw new Error('Invalid backup storage entry.');
            }
            if (
                key.startsWith('kanji') ||
                key.startsWith('customTheme:') ||
                key === 'aiSenseiFabPos'
            ) {
                const parsed = JSON.parse(value);
                if (!parsed || typeof parsed !== 'object') {
                    throw new Error('Invalid settings or progress.');
                }
            }
        }
        if (data.storage.kanji_progress) {
            const p = JSON.parse(data.storage.kanji_progress);
            if (!['mastered', 'studied', 'skipped'].every((k) => Array.isArray(p[k]))) {
                throw new Error('Invalid progress data.');
            }
        }
        for (const [slot, value] of Object.entries(data.media)) {
            if (
                !/^(slot[123]|avatar)$/.test(slot) ||
                typeof value !== 'string' ||
                !/^data:(image\/[a-zA-Z0-9.+-]+|video\/(mp4|webm|ogg));base64,[A-Za-z0-9+/=\s]+$/.test(
                    value
                )
            ) {
                throw new Error('Invalid theme media.');
            }
            if (slot === 'avatar') {
                const encoded = value.split(',')[1].replace(/\s/g, '');
                const size =
                    (encoded.length * 3) / 4 -
                    (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
                if (!value.startsWith('data:image/') || size >= 2 * 1024 * 1024) {
                    throw new Error('Profile photo must be an image under 2 MB.');
                }
            }
        }
        return data;
    }
    static async restore(data, { recovery = true } = {}) {
        this.validate(data);
        if (recovery) {
            await this.createRecovery();
        }
        const media = {};
        for (const [slot, value] of Object.entries(data.media)) {
            media[slot] = await (await fetch(value)).blob();
        }
        const previous = Object.fromEntries(
            Object.keys(localStorage)
                .filter((k) => this.allowed(k))
                .map((k) => [k, localStorage.getItem(k)])
        );
        const oldMedia = await this.media();
        // Preserve this device's credentials; never import credentials from a backup.
        const incoming = { ...data.storage };
        for (const key of ['kanji_ai_settings', 'kanjiSettings', 'kanji_settings']) {
            if (incoming[key]) {
                const clean = this.scrub(JSON.parse(incoming[key]));
                const old = JSON.parse(previous[key] || '{}');
                for (const k of Object.keys(old)) {
                    if (/key|token|secret|password/i.test(k)) {
                        clean[k] = old[k];
                    }
                }
                incoming[key] = JSON.stringify(clean);
            }
        }
        const apply = (entries) => {
            Object.keys(localStorage)
                .filter((k) => this.allowed(k))
                .forEach((k) => localStorage.removeItem(k));
            Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v));
        };
        try {
            apply(incoming);
            await this.media(media);
        } catch (error) {
            apply(previous);
            await this.media(oldMedia);
            throw error;
        }
    }
    static download(data, name) {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    static isPinned(file) {
        const props = file.appProperties || {};
        return (
            props.pinned === 'true' ||
            (props.pinned !== 'false' && props.backupKind !== 'checkpoint')
        );
    }

    static driveError(status, reason) {
        if (reason === 'storageQuotaExceeded') {
            return 'Your Google Drive is full. Free space in Drive, then retry. Local data is safe.';
        }
        if (status === 429 || /rateLimit|userRateLimit/i.test(reason)) {
            return 'Google Drive is rate-limiting requests. Wait a few minutes and retry; local changes are kept.';
        }
        if (status === 403) {
            return 'Google Drive access is denied. Enable Drive API in the OAuth project, check test-user access, then reconnect and grant Drive permission.';
        }
        if (status === 404) {
            return 'This cloud file or folder no longer exists or is inaccessible. Reconnect and refresh history before retrying.';
        }
        if (status >= 500) {
            return 'Google Drive is temporarily unavailable. Retry later; your local data has not been cleared.';
        }
        return `Drive request failed (${status}). Reconnect and retry; if it persists, check the Google OAuth/Drive setup guide.`;
    }

    // Isolated from theme storage and from exports to avoid recursive recovery snapshots.
    static async recoveryStore(action, data) {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('KanjiWidgetsRecovery', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('recovery');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('recovery', action === 'get' ? 'readonly' : 'readwrite');
                const store = tx.objectStore('recovery');
                const req =
                    action === 'get'
                        ? store.get('before-restore')
                        : action === 'put'
                          ? store.put(data, 'before-restore')
                          : store.delete('before-restore');
                tx.oncomplete = () => resolve(req.result);
                tx.onerror = tx.onabort = () =>
                    reject(tx.error || new Error('Recovery storage failed.'));
            });
        } finally {
            db.close();
        }
    }

    static async createRecovery() {
        try {
            const data = await this.snapshot();
            const config = JSON.parse(localStorage.getItem('kanji_drive_backup') || '{}');
            data.recoveryOwner = config.dataOwner || '';
            await this.recoveryStore('put', data);
        } catch {
            throw new Error(
                'Restore stopped: a recovery copy could not be saved (storage may be full or unavailable). Export your data and free browser storage before retrying. Nothing was restored.'
            );
        }
    }

    static async undoRestore() {
        const data = await this.recoveryStore('get');
        if (!data) {
            throw new Error('No recovery copy is available on this device.');
        }
        await this.restore(data, { recovery: false });
        // Keep recovery until the user deletes it or starts another restore.
        return data.recoveryOwner || '__recovered_local_data__';
    }

    needsAccountChoice() {
        return Boolean(
            this.user?.emailAddress &&
            this.config.dataOwner &&
            this.config.dataOwner !== this.user.emailAddress
        );
    }

    static summary(data) {
        const parse = (key) => {
            try {
                return JSON.parse(data.storage[key] || '{}');
            } catch {
                return {};
            }
        };
        const progress = parse('kanji_progress');
        const srs = parse('kanji_srs_data');
        const cards = srs.cards || srs;
        return `Studied: ${progress.studied?.length || 0} · Mastered: ${progress.mastered?.length || 0} · Review entries: ${Object.keys(cards).length} · Theme: ${data.storage.theme || 'default'} · Media: ${Object.keys(data.media).length}`;
    }

    showComparison(local, cloud, file) {
        const panel = document.getElementById('saveComparison');
        if (!panel) {
            return;
        }
        panel.replaceChildren();
        for (const [name, data, time] of [
            ['This device', local, 'Current local state'],
            ['Cloud', cloud, new Date(file.modifiedTime || file.createdTime).toLocaleString()]
        ]) {
            const section = document.createElement('div');
            const heading = document.createElement('strong');
            heading.textContent = name;
            const detail = document.createElement('p');
            detail.textContent = `${time} — ${BackupManager.summary(data)}`;
            section.append(heading, detail);
            panel.append(section);
        }
        const changed = Object.keys({ ...local.storage, ...cloud.storage }).filter(
            (key) => local.storage[key] !== cloud.storage[key]
        );
        const detail = document.createElement('p');
        detail.textContent = `Different saved sections: ${changed.join(', ') || 'none'}. Uploaded media differs: ${JSON.stringify(local.media) !== JSON.stringify(cloud.media) ? 'yes' : 'no'}. Restore replaces these sections; it does not merge them.`;
        panel.append(detail);
    }

    renderSaveStatus() {
        const element = document.getElementById('saveHealth');
        if (!element) {
            return;
        }
        const connected = this.authorized() && this.user;
        const account = connected
            ? 'Google connected'
            : this.config.dataOwner
              ? 'Reconnect required'
              : 'Guest · data stored on this device';
        const state = this.busy
            ? 'Working…'
            : this.lastError
              ? 'Action failed — see details below'
              : this.needsAccountChoice()
                ? 'Account choice required; uploads blocked'
                : this.pendingCloud
                  ? 'Cloud changes need review'
                  : this.localDirty === true
                    ? 'Unsaved cloud changes'
                    : this.localDirty === false
                      ? 'Matches last checked cloud save'
                      : 'Cloud state not checked';
        const upload = this.config.lastBackup
            ? new Date(this.config.lastBackup).toLocaleString()
            : 'None from this device';
        element.textContent = `${account} · ${state}${navigator.onLine === false ? ' · Offline' : ''}. Last successful upload from this device: ${upload}.`;
    }

    async refreshSaveStatus() {
        this.renderSaveStatus();
        if (this.inspecting || this.busy) {
            return;
        }
        this.inspecting = true;
        try {
            const base = this.user && this.config.syncStates?.[this.user.emailAddress];
            this.localDirty = base
                ? (await BackupManager.fingerprint(await BackupManager.snapshot())) !== base.hash
                : undefined;
        } catch {
            this.localDirty = undefined;
        } finally {
            this.inspecting = false;
            this.renderSaveStatus();
        }
    }

    async clearLocalData() {
        if (
            !confirm(
                'Disconnect and erase learning progress, settings, uploaded themes, avatar, local backups, API keys and recovery copy ON THIS DEVICE? Google Drive files will NOT be deleted. Export first if needed.'
            )
        ) {
            return;
        }
        this.config.autoSync = false;
        this.config.frequency = 'never';
        this.save();
        if (window.app?.localBackupTimer) {
            clearInterval(window.app.localBackupTimer);
        }
        document.getElementById('driveDisconnect').click();
        // The button may be disabled by run(); always drop in-memory authorization here.
        if (this.token) {
            window.google?.accounts.oauth2.revoke(this.token, () => {});
        }
        this.token = null;
        this.user = null;
        await BackupManager.media({});
        await BackupManager.recoveryStore('delete');
        for (const key of Object.keys(localStorage)) {
            if (
                BackupManager.allowed(key) ||
                key.startsWith('autoBackup_') ||
                ['kanji_drive_backup', 'lastLocalBackup', 'kanji_cache'].includes(key)
            ) {
                localStorage.removeItem(key);
            }
        }
        location.reload();
    }

    async deleteCloudBackups() {
        await this.list();
        const files = [...this.files];
        if (
            !confirm(
                `Move ALL ${files.length} app backups in the connected Google account to Drive trash, INCLUDING PINNED backups? Local progress and Google access will remain. This does not touch unrelated Drive files.`
            )
        ) {
            return;
        }
        // Pause before the first deletion, including when a later request fails.
        this.config.autoSync = false;
        this.config.frequency = 'never';
        this.save();
        document.getElementById('accountAutoSync').checked = false;
        document.getElementById('driveFrequency').value = 'never';
        let deleted = 0;
        try {
            for (const file of files) {
                await this.api(`/files/${encodeURIComponent(file.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{"trashed":true}'
                });
                deleted++;
            }
        } catch (error) {
            throw new Error(
                `${deleted} backups moved to trash before an error: ${error.message}. Refresh history before retrying.`
            );
        }
        this.pendingCloud = null;
        if (this.user) {
            delete this.config.syncStates?.[this.user.emailAddress];
        }
        // Avoid recreating backups straight after an explicit deletion request.
        this.config.autoSync = false;
        this.config.frequency = 'never';
        this.save();
        document.getElementById('accountAutoSync').checked = false;
        document.getElementById('driveFrequency').value = 'never';
        await this.list();
        this.status(
            `${deleted} cloud backups moved to trash. Automatic saves are off; local data is unchanged.`
        );
    }

    async diagnoseDrive() {
        if (
            !confirm(
                'Test Drive checkpoint updates using a temporary file? No learning data will be uploaded. The test file will be moved to trash afterwards.'
            )
        ) {
            return;
        }
        let id,
            result = '';
        try {
            const folder = await this.ensureFolder();
            const file = await this.api('/files?fields=id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Kanji checkpoint diagnostic (safe to delete)',
                    parents: [folder],
                    mimeType: 'application/json',
                    appProperties: { kanjiDiagnostic: 'v1' }
                })
            });
            id = file.id;
            const write = (value, etag) =>
                this.api(
                    `/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(etag ? { 'If-Match': etag } : {})
                        },
                        body: JSON.stringify({ diagnostic: value })
                    }
                );
            const read = () => this.api(`/files/${encodeURIComponent(id)}?alt=media`, {}, true);
            await write(1);
            const first = await read();
            if (!first.etag || first.data?.diagnostic !== 1) {
                throw new Error(
                    'Drive did not expose a usable revision token/readback. Safe in-place updates could not be verified; separate checkpoints will be used.'
                );
            }
            await write(2, first.etag);
            const second = await read();
            if (second.data?.diagnostic !== 2) {
                throw new Error('Checkpoint readback failed.');
            }
            let rejected = false;
            try {
                await write(3, first.etag);
            } catch (error) {
                if (error.status === 412) {
                    rejected = true;
                } else {
                    throw error;
                }
            }
            if (!rejected || (await read()).data?.diagnostic !== 2) {
                throw new Error(
                    'Drive did not protect the checkpoint from a stale revision. In-place saving has been disabled for safety.'
                );
            }
            this.config.checkpointVerified = true;
            result =
                'PASS: create, read, update, and stale-revision rejection verified on this Google account. Still test real two-device conflicts before relying on sync.';
        } catch (error) {
            this.config.checkpointVerified = false;
            result = `NOT VERIFIED: ${error.message}`;
        } finally {
            this.config.diagnosticAccount = this.user?.emailAddress || '';
            this.config.checkpointDiagnostics = this.config.checkpointDiagnostics || {};
            if (this.user?.emailAddress) {
                this.config.checkpointDiagnostics[this.user.emailAddress] =
                    this.config.checkpointVerified;
            }
            this.config.diagnosticResult = `${this.config.diagnosticAccount || 'Not connected'}: ${result}`;
            this.save();
            if (id) {
                try {
                    await this.api(`/files/${encodeURIComponent(id)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{"trashed":true}'
                    });
                } catch {
                    result += ` Cleanup failed. Delete temporary diagnostic file ${id} in Drive manually.`;
                }
            }
            document.getElementById('driveDiagnosticResult').textContent = result;
            this.status(result);
        }
    }

    initSafety() {
        document.getElementById('undoRestore').onclick = () =>
            this.run(async () => {
                if (
                    !confirm(
                        'Undo the last restore? This replaces current local data with its recovery copy, including any changes since that restore.'
                    )
                ) {
                    return;
                }
                this.config.dataOwner = await BackupManager.undoRestore();
                this.config.syncStates = {};
                this.save();
                location.reload();
            });
        document.getElementById('downloadRecovery').onclick = () =>
            this.run(async () => {
                const data = await BackupManager.recoveryStore('get');
                if (!data) {
                    throw new Error('No recovery copy is available on this device.');
                }
                BackupManager.download(data, 'kanji-before-restore.json');
            });
        document.getElementById('downloadBoth').onclick = () =>
            this.run(async () =>
                BackupManager.download(await BackupManager.snapshot(), 'kanji-this-device.json')
            );
        document.getElementById('downloadCloudConflict').onclick = () =>
            this.run(async () => {
                if (!this.pendingCloud) {
                    throw new Error(
                        'No cloud copy is selected. Quick save to check for conflicts.'
                    );
                }
                const cloud = BackupManager.validate(
                    await this.api(`/files/${encodeURIComponent(this.pendingCloud.id)}?alt=media`)
                );
                BackupManager.download(cloud, 'kanji-cloud-copy.json');
            });
        document.getElementById('privacyExport').onclick = () =>
            this.run(async () =>
                BackupManager.download(await BackupManager.snapshot(), 'kanji-full-export.json')
            );
        document.getElementById('deleteCloudBackups').onclick = () =>
            this.run(() => this.deleteCloudBackups());
        document.getElementById('clearLocalAccount').onclick = () =>
            this.run(() => this.clearLocalData());
        document.getElementById('driveDiagnostic').onclick = () =>
            this.run(() => this.diagnoseDrive());
        document.getElementById('driveDiagnosticResult').textContent =
            this.config.diagnosticResult || 'Not yet tested with your Google account.';
        setInterval(() => this.refreshSaveStatus(), 30000);
        window.addEventListener('offline', () => this.refreshSaveStatus());
        window.addEventListener('online', () => this.refreshSaveStatus());
        this.refreshSaveStatus();
    }

    constructor() {
        try {
            this.config = JSON.parse(localStorage.getItem('kanji_drive_backup') || '{}');
        } catch {
            this.config = {};
        }
        this.token = null;
        this.expires = 0;
        this.busy = false;
        this.retryAfter = 0;
        this.files = [];
    }
    save() {
        localStorage.setItem('kanji_drive_backup', JSON.stringify(this.config));
    }
    status(text) {
        document.getElementById('driveStatus').textContent = text;
        const accountStatus = document.getElementById('accountStatus');
        if (accountStatus) {
            accountStatus.textContent = text;
        }
        this.renderAccount();
    }
    authorized() {
        return this.token && Date.now() < this.expires;
    }
    async run(fn) {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.lastError = '';
        this.status('Working… Local learning data stays on this device.');
        document
            .querySelectorAll(
                '#driveBackup button, #accountConnect, #accountDisconnect, #accountSync, #accountBackup, #syncUseCloud, #syncUseLocal'
            )
            .forEach((b) => {
                b.disabled = true;
            });
        try {
            await fn();
        } catch (e) {
            this.lastError = e.message;
            this.status(e.message);
            this.retryAfter = Date.now() + 300000;
        } finally {
            this.busy = false;
            this.refreshSaveStatus?.();
            document
                .querySelectorAll(
                    '#driveBackup button, #accountConnect, #accountDisconnect, #accountSync, #accountBackup, #syncUseCloud, #syncUseLocal'
                )
                .forEach((b) => {
                    b.disabled = false;
                });
        }
    }
    async loadIdentity() {
        if (window.google?.accounts?.oauth2) {
            return;
        }
        if (this.identityPromise) {
            return this.identityPromise;
        }
        this.identityPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            const timer = setTimeout(
                () =>
                    reject(new Error('Google sign-in timed out. Check your connection and retry.')),
                15000
            );
            script.onload = () => {
                clearTimeout(timer);
                resolve();
            };
            script.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Cannot load Google sign-in. Check your connection.'));
            };
            document.head.appendChild(script);
        }).catch((error) => {
            this.identityPromise = null;
            throw error;
        });
        return this.identityPromise;
    }
    connect() {
        if (this.busy || this.connecting) {
            return;
        }
        const clientId = window.KANJI_BACKUP_CONFIG?.googleClientId || this.config.clientId;
        if (!clientId) {
            this.status('Set up a Google OAuth client ID first. See the setup guide below.');
            return;
        }
        if (!window.google?.accounts?.oauth2) {
            this.run(async () => {
                await this.loadIdentity();
                this.status(
                    'Google is ready. Click Connect with Google again to open the account chooser.'
                );
            });
            return;
        }
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (response) => {
                this.connecting = false;
                if (response.error || !response.access_token) {
                    this.status('Google access was not granted. Try connecting again.');
                    return;
                }
                if (
                    !window.google.accounts.oauth2.hasGrantedAllScopes(
                        response,
                        'https://www.googleapis.com/auth/drive.file'
                    )
                ) {
                    this.status('Drive file access is required for backups.');
                    return;
                }
                this.token = response.access_token;
                this.expires = Date.now() + Number(response.expires_in) * 1000 - 60000;
                this.folder = null;
                this.user = null;
                this.pendingCloud = null;
                this.run(async () => {
                    const about = await this.api(
                        '/about?fields=user(displayName,emailAddress,photoLink)'
                    );
                    this.user = about.user;
                    document.getElementById('saveComparison')?.replaceChildren();
                    if (!this.config.dataOwner) {
                        this.config.dataOwner = this.user.emailAddress;
                        this.save();
                    }
                    this.status(
                        `Connected as ${about.user.emailAddress}. Access lasts about one hour; reconnect when requested.`
                    );
                    await this.sync(false, true);
                });
            },
            error_callback: () => {
                this.connecting = false;
                this.status('Sign-in was closed or blocked. Allow popups and try again.');
            }
        });
        this.connecting = true;
        try {
            client.requestAccessToken({ prompt: 'select_account' });
        } catch (error) {
            this.connecting = false;
            this.status(error.message);
        }
    }
    async api(path, options = {}, withEtag = false) {
        if (!this.authorized()) {
            this.token = null;
            throw new Error(
                'Connect with Google to authorize Drive backups (access expired or not connected).'
            );
        }
        let response;
        try {
            response = await fetch(
                `https://www.googleapis.com${path.startsWith('/upload/') ? path : `/drive/v3${path}`}`,
                {
                    ...options,
                    headers: { ...options.headers, Authorization: `Bearer ${this.token}` }
                }
            );
        } catch {
            throw new Error(
                'Cannot reach Google Drive. Check your internet connection; local progress is unchanged. Retry when online.'
            );
        }
        if (response.status === 401) {
            this.token = null;
            throw new Error('Google access expired. Reconnect to continue.');
        }
        if (response.status === 412) {
            const error = new Error(
                'Cloud checkpoint changed on another device. Nothing was overwritten. Quick save again to review it.'
            );
            error.status = 412;
            throw error;
        }
        if (!response.ok) {
            let details = {};
            try {
                details = await response.json();
            } catch {
                /* Non-JSON service error */
            }
            const reason = details.error?.errors?.[0]?.reason || '';
            throw new Error(BackupManager.driveError(response.status, reason));
        }
        if (response.status === 204) {
            return null;
        }
        let data;
        try {
            data = await response.json();
        } catch (error) {
            if (!withEtag) {
                throw error;
            }
            data = null;
        }
        return withEtag ? { data, etag: response.headers.get('ETag') } : data;
    }
    async find(q) {
        const files = [];
        let pageToken = '';
        do {
            const result = await this.api(
                `/files?${new URLSearchParams({
                    q,
                    spaces: 'drive',
                    fields: 'nextPageToken,files(id,name,createdTime,modifiedTime,size,appProperties)',
                    pageSize: '100',
                    orderBy: 'modifiedTime desc',
                    pageToken
                })}`
            );
            files.push(...result.files);
            pageToken = result.nextPageToken || '';
        } while (pageToken);
        return files;
    }
    async ensureFolder() {
        if (this.folder) {
            return this.folder;
        }
        const folders = await this.find(
            "trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='kanjiBackupFolder' and value='v1' }"
        );
        const folder =
            folders[0] ||
            (await this.api('/files?fields=id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Kanji Widgets Backups',
                    mimeType: 'application/vnd.google-apps.folder',
                    appProperties: { kanjiBackupFolder: 'v1' }
                })
            }));
        this.folder = folder.id;
        const link = document.getElementById('driveFolder');
        link.href = `https://drive.google.com/drive/folders/${encodeURIComponent(this.folder)}`;
        link.hidden = false;
        return this.folder;
    }
    async list() {
        const folder = await this.ensureFolder();
        this.files = await this.find(
            `trashed = false and '${folder}' in parents and appProperties has { key='kanjiBackup' and value='v3' }`
        );
        const list = document.getElementById('driveFiles');
        list.replaceChildren();
        if (!this.files.length) {
            list.textContent = 'No cloud backups yet.';
        }
        for (const file of this.files) {
            const row = document.createElement('li');
            const label = document.createElement('span');
            label.textContent = `${BackupManager.isPinned(file) ? '📌 Pinned · ' : ''}${file.appProperties?.backupKind === 'checkpoint' ? 'Quick-save checkpoint' : 'Saved backup'} · ${file.name} · ${new Date(file.modifiedTime || file.createdTime).toLocaleString()} · ${Math.ceil(Number(file.size || 0) / 1024)} KB`;
            row.append(label);
            for (const action of [
                'Download',
                'Restore',
                BackupManager.isPinned(file) ? 'Unpin' : 'Pin',
                'Delete'
            ]) {
                const button = document.createElement('button');
                button.className = 'backup-btn';
                button.textContent = action;
                button.onclick = () =>
                    this.run(async () => {
                        if (action === 'Pin' || action === 'Unpin') {
                            if (
                                action === 'Unpin' &&
                                !confirm('Allow automatic retention to remove this backup?')
                            ) {
                                return;
                            }
                            await this.api(`/files/${encodeURIComponent(file.id)}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    appProperties: { pinned: action === 'Pin' ? 'true' : 'false' }
                                })
                            });
                            await this.list();
                            return;
                        }
                        if (action === 'Delete') {
                            if (
                                !confirm(
                                    `Move ${BackupManager.isPinned(file) ? 'PINNED backup ' : ''}${file.name} to Drive trash? This is separate from disconnecting Google.`
                                )
                            ) {
                                return;
                            }
                            await this.api(`/files/${encodeURIComponent(file.id)}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: '{"trashed":true}'
                            });
                            await this.list();
                            this.status('Backup moved to Drive trash.');
                            return;
                        }
                        if (
                            action === 'Restore' &&
                            !confirm(
                                'Replace this device’s progress, settings and custom themes with this backup? This does not merge devices.'
                            )
                        ) {
                            return;
                        }
                        const data = BackupManager.validate(
                            await this.api(`/files/${encodeURIComponent(file.id)}?alt=media`)
                        );
                        if (action === 'Download') {
                            BackupManager.download(data, file.name);
                        } else {
                            await BackupManager.restore(data);
                            await this.remember(file.id, await BackupManager.snapshot());
                            location.reload();
                        }
                    });
                row.append(button);
            }
            list.append(row);
        }
    }
    async backup({
        data = null,
        checkpoint = false,
        target = null,
        etag = null,
        allowAccountSwitch = false
    } = {}) {
        if (this.needsAccountChoice() && !allowAccountSwitch) {
            throw new Error(
                'Account changed. Choose cloud data or explicitly save this device’s copy before uploading.'
            );
        }
        const folder = await this.ensureFolder();
        data = data || (await BackupManager.snapshot());
        const prefix =
            (this.config.prefix || 'kanji-backup').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) ||
            'kanji-backup';
        const name = `${prefix}-${checkpoint ? 'quicksave-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const boundary = `kanji_${crypto.randomUUID()}`;
        const metadata = {
            name,
            appProperties: {
                kanjiBackup: 'v3',
                backupKind: checkpoint ? 'checkpoint' : 'manual',
                pinned: checkpoint ? 'false' : 'true'
            }
        };
        if (!target) {
            metadata.parents = [folder];
        }
        if (target && !etag) {
            throw new Error('Cannot safely update a checkpoint without its revision.');
        }
        const body = new Blob([
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            JSON.stringify(metadata),
            `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
            JSON.stringify(data),
            `\r\n--${boundary}--`
        ]);
        const uploaded = await this.api(
            `/upload/drive/v3/files${target ? `/${encodeURIComponent(target.id)}` : ''}?uploadType=multipart&fields=id`,
            {
                method: target ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    ...(etag ? { 'If-Match': etag } : {})
                },
                body
            }
        );
        if (this.user) {
            await this.remember(uploaded.id, data);
        }
        this.pendingCloud = null;
        this.config.lastBackup = Date.now();
        this.save();
        await this.list();
        const keep = Number(this.config.keep || 0);
        if ([5, 10, 20].includes(keep)) {
            for (const file of this.files
                .filter((file) => !BackupManager.isPinned(file))
                .slice(keep)) {
                await this.api(`/files/${encodeURIComponent(file.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{"trashed":true}'
                });
            }
            await this.list();
        }
        this.status(
            `${target ? 'Checkpoint updated' : checkpoint ? 'New checkpoint saved; previous copies kept according to your retention setting' : 'New backup created'} ${new Date(this.config.lastBackup).toLocaleString()}.`
        );
    }
    static due(config, now = Date.now()) {
        const days = { daily: 1, weekly: 7, monthly: 30 }[config.frequency];
        if (!days) {
            return false;
        }
        const [hour, minute] = (config.time || '19:00').split(':').map(Number);
        const next = new Date(Math.max(config.lastChecked || 0, config.lastBackup || 0) || now);
        next.setHours(hour, minute, 0, 0);
        if (config.lastBackup || config.lastChecked) {
            next.setDate(next.getDate() + days);
        }
        return now >= next.getTime();
    }
    tick() {
        if (
            this.busy ||
            !navigator.onLine ||
            document.hidden ||
            Date.now() < this.retryAfter ||
            (!this.config.autoSync && !BackupManager.due(this.config))
        ) {
            return;
        }
        if (!this.authorized()) {
            this.status(
                'Connect with Google to resume automatic backup/sync. Your changes remain on this device.'
            );
            return;
        }
        const task = () => this.run(() => this.sync(BackupManager.due(this.config)));
        if (navigator.locks) {
            navigator.locks
                .request('kanji-drive-backup', { ifAvailable: true }, async (lock) => {
                    if (!lock) {
                        return;
                    }
                    const latest = JSON.parse(localStorage.getItem('kanji_drive_backup') || '{}');
                    this.config = latest;
                    if (latest.autoSync || BackupManager.due(latest)) {
                        await task();
                    }
                })
                .catch((e) => this.status(e.message));
        } else {
            task();
        }
    }
    init() {
        this.initAccount();
        const root = document.getElementById('driveBackup');
        for (const [id, key, fallback] of [
            ['driveClientId', 'clientId', ''],
            ['driveFrequency', 'frequency', 'never'],
            ['driveTime', 'time', '19:00'],
            ['driveKeep', 'keep', '0'],
            ['drivePrefix', 'prefix', 'kanji-backup']
        ]) {
            const input = document.getElementById(id);
            input.value = this.config[key] ?? fallback;
            input.onchange = () => {
                if (!input.checkValidity()) {
                    input.reportValidity();
                    return;
                }
                this.config[key] = input.value;
                this.save();
                if (key === 'clientId') {
                    this.token = null;
                    this.folder = null;
                }
                this.status('Backup preferences saved.');
                this.tick();
            };
        }
        if (window.KANJI_BACKUP_CONFIG?.googleClientId) {
            document.getElementById('driveClientSetup').hidden = true;
        }
        root.querySelector('#driveConnect').onclick = () => this.connect();
        root.querySelector('#driveDisconnect').onclick = () => {
            if (this.token) {
                window.google?.accounts.oauth2.revoke(this.token, () => {});
            }
            this.token = null;
            this.folder = null;
            this.expires = 0;
            this.user = null;
            this.pendingCloud = null;
            document.getElementById('driveFiles').replaceChildren();
            document.getElementById('driveFolder').hidden = true;
            this.status(
                'Disconnected. Cloud files are kept; automatic backups require reconnecting.'
            );
        };
        root.querySelector('#driveQuickSave').onclick = () => this.run(() => this.sync());
        root.querySelector('#driveNow').onclick = () => this.run(() => this.backup());
        root.querySelector('#driveRefresh').onclick = () => this.run(() => this.list());
        this.initSafety();
        this.status(
            this.config.lastBackup
                ? `Last upload from this device: ${new Date(this.config.lastBackup).toLocaleString()}. Connect to browse Drive.`
                : 'Not connected. Local learning works without Google.'
        );
        setInterval(() => this.tick(), 60000);
        document.addEventListener('visibilitychange', () => this.tick());
        window.addEventListener('online', () => this.tick());
        this.tick();
    }

    renderAccount() {
        const button = document.getElementById('accountBtn');
        if (!button) {
            return;
        }
        const connected = Boolean(this.authorized() && this.user);
        button.dataset.connected = String(connected);
        button.setAttribute(
            'aria-label',
            this.pendingCloud ? 'Account & sync — cloud copy needs review' : 'Account & sync'
        );
        document.getElementById('accountHeading').textContent = connected
            ? this.user.displayName || 'Google account'
            : 'Guest user';
        document.getElementById('accountIdentity').textContent = connected
            ? this.user.emailAddress
            : 'Your learning data is saved on this device. Connect to resume cloud access.';
        document.getElementById('accountConnect').textContent = connected
            ? 'Switch Google account'
            : 'Connect with Google';
        document.getElementById('accountDisconnect').hidden = !connected;
        document.getElementById('syncConflict').hidden =
            !this.pendingCloud && !this.needsAccountChoice();
        this.renderAvatar();
        this.renderSaveStatus();
    }

    initAccount() {
        const panel = document.getElementById('accountPanel');
        const button = document.getElementById('accountBtn');
        const close = () => {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        };
        button.onclick = () => {
            panel.hidden = !panel.hidden;
            button.setAttribute('aria-expanded', String(!panel.hidden));
            this.renderAccount();
            if (!panel.hidden) {
                document.getElementById('accountClose').focus();
                // Preload on opening the panel, so the Connect click remains a user gesture.
                this.loadIdentity().catch((e) => this.status(e.message));
            }
        };
        document.getElementById('accountClose').onclick = () => {
            close();
            button.focus();
        };
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !button.contains(e.target)) {
                close();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) {
                close();
                button.focus();
            }
        });
        document.getElementById('accountConnect').onclick = () => this.connect();
        document.getElementById('accountDisconnect').onclick = () =>
            document.getElementById('driveDisconnect').click();
        document.getElementById('accountSync').onclick = () => this.run(() => this.sync());
        document.getElementById('accountBackup').onclick = () => this.run(() => this.backup());
        document.getElementById('accountSettings').onclick = () => {
            close();
            document.getElementById('settingsBtn').click();
            document.getElementById('driveBackup').scrollIntoView({ block: 'start' });
        };
        const auto = document.getElementById('accountAutoSync');
        auto.checked = Boolean(this.config.autoSync);
        auto.onchange = () => {
            this.config.autoSync = auto.checked;
            this.save();
            this.status(
                'Sync preference saved. Cloud changes always ask before replacing this device.'
            );
            this.tick();
        };
        document.getElementById('syncUseCloud').onclick = () =>
            this.run(async () => {
                const file = this.pendingCloud;
                if (!file) {
                    this.status(
                        'No cloud copy exists in this account. Choose Save this device’s copy to explicitly upload here, or disconnect.'
                    );
                    return;
                }
                if (
                    !file ||
                    !confirm(
                        'Replace local progress, settings and themes with the cloud copy? A recovery copy will be saved on this device first. You can undo this restore in Settings.'
                    )
                ) {
                    return;
                }
                const data = BackupManager.validate(
                    await this.api(`/files/${encodeURIComponent(file.id)}?alt=media`)
                );
                await BackupManager.restore(data);
                // Hash the restored state, including any normalized settings.
                await this.remember(file.id, await BackupManager.snapshot());
                location.reload();
            });
        document.getElementById('syncUseLocal').onclick = () =>
            this.run(async () => {
                if (
                    !confirm(
                        'Make this device’s data the newest cloud copy? Other devices will be asked before replacing their data.'
                    )
                ) {
                    return;
                }
                await this.backup({ allowAccountSwitch: true });
            });
        this.renderAccount();
        this.initAvatar();
    }

    static validateAvatar(file) {
        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Choose an image file or animated GIF.');
        }
        if (!file.size || file.size >= 2 * 1024 * 1024) {
            throw new Error('Choose an image smaller than 2 MB.');
        }
    }

    renderAvatar() {
        const photo = this.user?.photoLink;
        // Google photo links are used only while authorized; never persisted or backed up.
        const googlePhoto =
            this.authorized() && typeof photo === 'string' && photo.startsWith('https://')
                ? photo
                : '';
        const source = this.avatarURL || googlePhoto;
        for (const id of ['accountAvatar', 'accountAvatarPreview']) {
            const image = document.getElementById(id);
            if (!image) {
                continue;
            }
            const fallback = image.nextElementSibling;
            if (image.dataset.source === source) {
                continue;
            }
            image.dataset.source = source;
            image.hidden = true;
            fallback.hidden = false;
            image.onload = () => {
                image.hidden = false;
                fallback.hidden = true;
            };
            image.onerror = () => {
                image.hidden = true;
                fallback.hidden = false;
            };
            if (source) {
                image.src = source;
            } else {
                image.removeAttribute('src');
            }
        }
    }

    async setAvatar(file) {
        let url;
        if (file) {
            BackupManager.validateAvatar(file);
            url = URL.createObjectURL(file);
            try {
                // Decode without canvas conversion: animated GIFs retain every frame.
                await new Promise((resolve, reject) => {
                    const image = new Image();
                    const timer = setTimeout(
                        () => reject(new Error('Image could not be loaded. Try a different file.')),
                        10000
                    );
                    image.onload = () => {
                        clearTimeout(timer);
                        resolve();
                    };
                    image.onerror = () => {
                        clearTimeout(timer);
                        reject(
                            new Error(
                                'This image format cannot be displayed in your browser. Try PNG, JPEG, WebP or GIF.'
                            )
                        );
                    };
                    image.src = url;
                });
            } catch (error) {
                URL.revokeObjectURL(url);
                throw error;
            }
        }
        try {
            await BackupManager.media(file ? { avatar: file } : {}, ['avatar']);
        } catch (error) {
            if (url) {
                URL.revokeObjectURL(url);
            }
            throw error;
        }
        if (this.avatarURL) {
            URL.revokeObjectURL(this.avatarURL);
        }
        this.avatarURL = url || '';
        this.renderAvatar();
        document.getElementById('avatarStatus').textContent = file
            ? 'Profile photo saved. Included in your next backup or sync.'
            : 'Custom photo removed. Using your Google photo when connected.';
    }

    async initAvatar() {
        const input = document.getElementById('avatarFile');
        const upload = document.getElementById('avatarUpload');
        const feedback = document.getElementById('avatarStatus');
        upload.disabled = true;
        try {
            const media = await BackupManager.media(undefined, ['avatar']);
            if (media.avatar) {
                this.avatarURL = URL.createObjectURL(media.avatar);
            }
        } catch {
            feedback.textContent =
                'Profile photo storage is unavailable. Your Google photo can still be displayed.';
        } finally {
            upload.disabled = false;
            this.renderAvatar();
        }
        upload.onclick = () => input.click();
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) {
                return;
            }
            upload.disabled = true;
            try {
                await this.setAvatar(file);
            } catch (error) {
                feedback.textContent = error.message;
            } finally {
                input.value = '';
                upload.disabled = false;
                this.renderAvatar();
            }
        };
    }

    static async fingerprint(data) {
        // Order storage keys deterministically; timestamps and local credentials are excluded.
        const ordered = (object) =>
            Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
        const bytes = new TextEncoder().encode(
            JSON.stringify({ storage: ordered(data.storage), media: ordered(data.media) })
        );
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    async remember(id, data) {
        if (!this.user?.emailAddress) {
            return;
        }
        const states = this.config.syncStates || {};
        states[this.user.emailAddress] = { id, hash: await BackupManager.fingerprint(data) };
        this.config.dataOwner = this.user.emailAddress;
        this.config.syncStates = states;
        this.save();
    }

    // Do not replace a checkpoint if it would erase durable progress or uploaded media.
    static losesData(previous, next) {
        if (Object.keys(previous.storage).some((key) => !(key in next.storage))) {
            return true;
        }
        if (Object.entries(previous.media).some(([key, value]) => next.media[key] !== value)) {
            return true;
        }
        const oldProgress = JSON.parse(previous.storage.kanji_progress || '{}');
        const newProgress = JSON.parse(next.storage.kanji_progress || '{}');
        for (const key of ['mastered', 'studied', 'skipped']) {
            if ((oldProgress[key] || []).some((item) => !(newProgress[key] || []).includes(item))) {
                return true;
            }
        }
        const oldSrs = JSON.parse(previous.storage.kanji_srs_data || '{}');
        const newSrs = JSON.parse(next.storage.kanji_srs_data || '{}');
        const missingKey = (old, current) =>
            old &&
            typeof old === 'object' &&
            !Array.isArray(old) &&
            Object.keys(old).some(
                (key) => !current || !(key in Object(current)) || missingKey(old[key], current[key])
            );
        return Boolean(missingKey(oldSrs, newSrs));
    }

    async sync(_scheduled = false, checkOnly = false) {
        if (!this.authorized() || !this.user) {
            throw new Error('Connect with Google before syncing.');
        }
        await this.list();
        const newest = this.files[0];
        const data = await BackupManager.snapshot();
        const hash = await BackupManager.fingerprint(data);
        const base = this.config.syncStates?.[this.user.emailAddress];
        if (this.needsAccountChoice()) {
            this.pendingCloud = newest || null;
            if (newest) {
                const cloudData = BackupManager.validate(
                    await this.api(`/files/${encodeURIComponent(newest.id)}?alt=media`)
                );
                this.showComparison(data, cloudData, newest);
            }
            this.status(
                'Different Google account connected. Automatic uploads are blocked. Choose its cloud copy, or explicitly save this device’s copy to this account.'
            );
            return;
        }
        let cloud, etag;
        if (newest) {
            // Read content on every check: a checkpoint can change without its ID changing.
            const result = await this.api(
                `/files/${encodeURIComponent(newest.id)}?alt=media`,
                {},
                true
            );
            etag = result.etag;
            try {
                cloud = BackupManager.validate(result.data);
            } catch {
                if (checkOnly) {
                    this.status(
                        'Latest cloud file is not a valid backup. Quick save will create a separate checkpoint, keeping that file.'
                    );
                    return;
                }
                await this.backup({ data, checkpoint: true });
                return;
            }
            const cloudHash = await BackupManager.fingerprint(cloud);
            if (cloudHash === hash) {
                await this.remember(newest.id, data);
                this.pendingCloud = null;
                this.config.lastChecked = Date.now();
                this.save();
                this.status(
                    'Already saved — no changes, so no upload or extra backup was created.'
                );
                return;
            }
            if (!base || newest.id !== base.id || cloudHash !== base.hash) {
                this.pendingCloud = newest;
                this.showComparison(data, cloud, newest);
                this.status(
                    `Cloud copy from ${new Date(newest.modifiedTime || newest.createdTime).toLocaleString()} needs review. Choose cloud or this device; automatic saving is paused.`
                );
                return;
            }
        }
        if (checkOnly) {
            this.status(
                newest
                    ? 'Connected. This device has unsaved changes. Quick save or enable automatic sync to save them.'
                    : 'Connected. No cloud save yet. Choose Quick save or enable automatic sync.'
            );
            return;
        }
        const canUpdate =
            newest?.appProperties?.backupKind === 'checkpoint' &&
            !BackupManager.isPinned(newest) &&
            this.config.checkpointDiagnostics?.[this.user.emailAddress] !== false &&
            !(
                this.config.diagnosticAccount === this.user.emailAddress &&
                this.config.checkpointVerified === false
            ) &&
            etag &&
            cloud &&
            !BackupManager.losesData(cloud, data);
        await this.backup({
            data,
            checkpoint: true,
            target: canUpdate ? newest : null,
            etag: canUpdate ? etag : null
        });
    }
}
window.BackupManager = BackupManager;
window.addEventListener('DOMContentLoaded', () => {
    window.driveBackup = new BackupManager();
    window.driveBackup.init();
});
