/* global openCustomThemeDB */
// Drive OAuth: access tokens stay in memory, never in a backup or storage.
class BackupManager {
    static BUILD = 'login-v1';
    static DIAGNOSTIC = 'metadata-etag-v1';
    static keys = [
        'kanji_profile',
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
                tx.oncomplete = () => {
                    if (write) {
                        BackupManager.mediaRevision = (BackupManager.mediaRevision || 0) + 1;
                    }
                    resolve(result);
                };
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
            appVersion: this.BUILD,
            version: 3,
            createdAt: new Date().toISOString(),
            storage,
            media
        };
    }
    static validate(data) {
        if (data?.app === 'kanji-widgets' && Number(data.version) > 3) {
            const error = new Error(
                'This backup was created by a newer app. Update KanjiWidgets on this device before restoring or syncing.'
            );
            error.code = 'NEWER_BACKUP';
            throw error;
        }
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
        if (data.storage.kanji_profile) {
            const profile = JSON.parse(data.storage.kanji_profile);
            if (
                Array.isArray(profile) ||
                typeof profile.nickname !== 'string' ||
                profile.nickname.length > 40
            ) {
                throw new Error('Invalid profile nickname in backup.');
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
    // Legacy exports only contain selected sections. Preserve data they never included.
    static async normalizeImport(data) {
        if (data?.app === 'kanji-cloud-progress') {
            if (data.version !== 1 || !window.CloudSync) {
                throw new Error('Update the app before importing this cloud progress file.');
            }
            const entries = JSON.parse(window.CloudSync.validatePayload(data.payload));
            const snapshot = await this.snapshot();
            for (const [key, value] of Object.entries(entries)) {
                if (value === null) {
                    if (['kanji_settings', 'kanjiSettings'].includes(key)) {
                        snapshot.storage[key] = '{}';
                    } else {
                        delete snapshot.storage[key];
                    }
                } else {
                    snapshot.storage[key] = value;
                }
            }
            return this.validate(snapshot);
        }
        if (data?.app === 'kanji-widgets' || data?.version === 3) {
            return this.validate(data);
        }
        if (![1, 2].includes(data?.version)) {
            throw new Error(
                'Unsupported backup version. Update the app if this file came from a newer version.'
            );
        }
        const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
        if (
            !object(data.progress) ||
            !Array.isArray(data.progress.mastered) ||
            !Array.isArray(data.progress.studied)
        ) {
            throw new Error('Invalid legacy progress. Nothing has been imported.');
        }
        if (data.progress.skipped !== undefined && !Array.isArray(data.progress.skipped)) {
            throw new Error('Invalid legacy skipped list.');
        }
        if (data.recent !== undefined && !Array.isArray(data.recent)) {
            throw new Error('Invalid legacy recent list.');
        }
        for (const key of ['settings', 'srsData', 'aiSettings']) {
            if (data[key] !== undefined && !object(data[key])) {
                throw new Error(`Invalid legacy ${key}.`);
            }
        }
        const migrated = await this.snapshot();
        migrated.migratedFrom = data.version;
        migrated.storage.kanji_progress = JSON.stringify(
            this.scrub({ ...data.progress, skipped: data.progress.skipped || [] })
        );
        for (const [old, key] of [
            ['recent', 'kanji_recent'],
            ['srsData', 'kanji_srs_data'],
            ['aiSettings', 'kanji_ai_settings']
        ]) {
            if (data[old] !== undefined) {
                migrated.storage[key] = JSON.stringify(this.scrub(data[old]));
            }
        }
        if (data.settings !== undefined) {
            const settings = this.scrub(data.settings);
            migrated.storage.kanji_settings = JSON.stringify(settings);
            const current = JSON.parse(migrated.storage.kanjiSettings || '{}');
            migrated.storage.kanjiSettings = JSON.stringify({ ...current, ...settings });
        }
        return this.validate(migrated);
    }

    static async restore(data, { recovery = true, cloudSync = false } = {}) {
        this.validate(data);
        // Restores/imports must be reviewed before being automatically uploaded.
        localStorage.removeItem('kanji_cloud_sync_v1');
        if (!cloudSync) {
            window.kanjiCloud?.invalidate();
        }
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
    static savedTime(file) {
        const tagged = Number(file.appProperties?.savedAt);
        return Number.isFinite(tagged) && tagged > 0
            ? tagged
            : Date.parse(file.modifiedTime || file.createdTime) || 0;
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
            ['Cloud', cloud, new Date(BackupManager.savedTime(file)).toLocaleString()]
        ]) {
            const section = document.createElement('div');
            const heading = document.createElement('strong');
            heading.textContent = name;
            const detail = document.createElement('p');
            detail.textContent = `${time}. ${BackupManager.summary(data)}`;
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
              ? 'Action failed. See details below'
              : this.needsAccountChoice()
                ? 'Account choice required; uploads blocked'
                : this.pendingCloud
                  ? 'Cloud changes need review'
                  : this.localDirty === true
                    ? this.config.autoSync && this.nextAutoSave
                        ? 'Changes queued · autosave after 15 seconds idle'
                        : 'Unsaved cloud changes'
                    : this.localDirty === false
                      ? 'Matches last checked cloud save'
                      : 'Cloud state not checked';
        const upload = this.config.lastBackup
            ? new Date(this.config.lastBackup).toLocaleString()
            : 'None from this device';
        element.textContent = `${account} · ${state}${navigator.onLine === false ? ' · Offline' : ''}. Last successful upload from this device: ${upload}.`;
        window.kanjiProfilePage?.refresh();
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
        if (window.kanjiAuth?.user && !(await window.kanjiAuth.signOut())) {
            throw new Error('Could not sign out of the app. Retry before clearing local data.');
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
                [
                    'kanji_drive_backup',
                    'kanji_cloud_sync_v1',
                    'lastLocalBackup',
                    'kanji_cache'
                ].includes(key)
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
        const runtime = `${BackupManager.BUILD} / ${BackupManager.DIAGNOSTIC}`;
        document.getElementById('driveDiagnosticResult').textContent =
            `Running ${runtime} on ${location.origin}…`;
        this.status('Testing a temporary Drive file. Your learning data is not part of this test.');
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
                    `/upload/drive/v2/files/${encodeURIComponent(id)}?uploadType=media&fields=id`,
                    {
                        method: 'PUT',
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
            if (first.data?.diagnostic !== 1) {
                throw new Error(
                    'The temporary test file could not be read back correctly. No learning data was touched.'
                );
            }
            if (!first.etag) {
                throw new Error(
                    'Drive metadata did not return a stable file ETag. Separate checkpoints remain enabled; no learning data was overwritten.'
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
            this.config.checkpointProtocols = this.config.checkpointProtocols || {};
            if (this.user?.emailAddress) {
                this.config.checkpointProtocols[this.user.emailAddress] = 'metadata-etag-v1';
            }
            this.config.checkpointDiagnostics = this.config.checkpointDiagnostics || {};
            if (this.user?.emailAddress) {
                this.config.checkpointDiagnostics[this.user.emailAddress] =
                    this.config.checkpointVerified;
            }
            this.config.diagnosticBuild = BackupManager.BUILD;
            this.config.diagnosticProtocol = BackupManager.DIAGNOSTIC;
            this.config.diagnosticTime = new Date().toISOString();
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
            this.config.diagnosticResult = `${runtime} · ${this.config.diagnosticTime} · ${this.config.diagnosticAccount || 'Not connected'}: ${result}`;
            this.save();
            document.getElementById('driveDiagnosticResult').textContent =
                this.config.diagnosticResult;
            this.status(
                this.config.checkpointVerified
                    ? 'Checkpoint test passed. Details are below.'
                    : 'Checkpoint test needs attention. See the fresh result below.'
            );
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
        document.getElementById('driveDiagnosticBuild').textContent =
            `Loaded app: ${BackupManager.BUILD} · Test: ${BackupManager.DIAGNOSTIC} · Origin: ${location.origin}`;
        document.getElementById('driveDiagnosticResult').textContent = this.config.diagnosticResult
            ? this.config.diagnosticBuild === BackupManager.BUILD
                ? `Saved result (not a new test): ${this.config.diagnosticResult}`
                : 'Older saved result: this used an earlier build. Run the current test for a fresh result.'
            : 'No test has been run on this device.';
        document.getElementById('reloadApp').onclick = async () => {
            if (
                !confirm(
                    'Reload to check for the latest app? Your saved learning data will stay. You will need to reconnect Google.'
                )
            ) {
                return;
            }
            try {
                const registration = await navigator.serviceWorker?.getRegistration();
                if (registration) {
                    await registration.update();
                }
                location.reload();
            } catch {
                this.status(
                    'Could not check for updates. Check your connection, then reload. Do not clear your site data.'
                );
            }
        };
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
                '#profilePage .profile-cloud-action, #driveBackup button, #accountConnect, #accountDisconnect, #accountSync, #accountBackup, #syncUseCloud, #syncUseLocal'
            )
            .forEach((b) => {
                b.disabled = true;
            });
        try {
            await fn();
            this.retryFailures = 0;
            this.retryAfter = 0;
        } catch (e) {
            this.lastError = e.message;
            this.status(e.message);
            window.KanjiFeedback?.show(e.message, { title: 'Backup action needs attention' });
            this.retryFailures = (this.retryFailures || 0) + 1;
            this.retryAfter =
                Date.now() +
                Math.max(
                    BackupManager.retryDelay(this.retryFailures),
                    Number.isFinite(e.retryMs) ? e.retryMs : 0
                );
        } finally {
            this.busy = false;
            if (document.getElementById('accountStatus')?.textContent.startsWith('Working…')) {
                this.status('Ready.');
            }
            this.refreshSaveStatus?.();
            document
                .querySelectorAll(
                    '#profilePage .profile-cloud-action, #driveBackup button, #accountConnect, #accountDisconnect, #accountSync, #accountBackup, #syncUseCloud, #syncUseLocal'
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
                this.files = [];
                this.onboardingPending = false;
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
                    this.onboardingPending = !this.config.onboarded?.[this.user.emailAddress];
                    await this.sync(false, true);
                    this.showOnboarding();
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
        let revisionBefore;
        let revisionPath;
        if (withEtag) {
            const match = /^\/files\/([^?]+)\?alt=media$/.exec(path);
            if (!match) {
                throw new Error('Revision checks require a Drive file content request.');
            }
            revisionPath = `/drive/v2/files/${match[1]}?fields=etag`;
            revisionBefore = await this.api(revisionPath);
        }
        let response;
        try {
            response = await fetch(
                `https://www.googleapis.com${path.startsWith('/upload/') || path.startsWith('/drive/v2/') ? path : `/drive/v3${path}`}`,
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
            const error = new Error(BackupManager.driveError(response.status, reason));
            const retry = response.headers?.get('Retry-After');
            if (retry) {
                error.retryMs = /^\d+$/.test(retry)
                    ? Number(retry) * 1000
                    : Math.max(0, Date.parse(retry) - Date.now());
            }
            throw error;
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
        if (withEtag) {
            const after = await this.api(revisionPath);
            if (revisionBefore.etag && after.etag && revisionBefore.etag !== after.etag) {
                const error = new Error(
                    'Cloud file changed while it was being read. Nothing was overwritten. Quick save again.'
                );
                error.status = 412;
                throw error;
            }
            const etag =
                typeof revisionBefore.etag === 'string' &&
                revisionBefore.etag === after.etag &&
                !revisionBefore.etag.startsWith('W/')
                    ? revisionBefore.etag
                    : null;
            return { data, etag };
        }
        return data;
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
        this.files.sort((a, b) => BackupManager.savedTime(b) - BackupManager.savedTime(a));
        const list = document.getElementById('driveFiles');
        list.replaceChildren();
        if (!this.files.length) {
            list.textContent = 'No cloud backups yet.';
        }
        for (const file of this.files) {
            const row = document.createElement('li');
            const label = document.createElement('span');
            label.textContent = `${BackupManager.isPinned(file) ? '📌 Pinned · ' : ''}${file.appProperties?.backupKind === 'checkpoint' ? 'Quick-save checkpoint' : 'Saved backup'} · ${file.appProperties?.backupLabel ? `“${file.appProperties.backupLabel}” · ` : ''}${file.name}${file.appProperties?.deviceLabel ? ` · From ${file.appProperties.deviceLabel}` : ''} · ${new Date(BackupManager.savedTime(file)).toLocaleString()} · ${Math.ceil(Number(file.size || 0) / 1024)} KB`;
            row.append(label);
            for (const action of [
                'Preview',
                'Label',
                'Download',
                'Restore',
                BackupManager.isPinned(file) ? 'Unpin' : 'Pin',
                'Delete'
            ]) {
                const button = document.createElement('button');
                button.className = 'backup-btn';
                button.textContent = action;
                if (['Delete', 'Restore'].includes(action)) {
                    button.classList.add('danger-action');
                }
                button.onclick = () =>
                    this.run(async () => {
                        if (action === 'Label') {
                            const raw = prompt(
                                'Optional backup label (up to 24 characters). Leave empty to remove it.',
                                file.appProperties?.backupLabel || ''
                            );
                            if (raw === null) {
                                return;
                            }
                            const value = raw.trim();
                            if (
                                value.length > 24 ||
                                Array.from(value).some((char) => char.charCodeAt(0) < 32)
                            ) {
                                throw new Error(
                                    'Use a label up to 24 characters, without control characters.'
                                );
                            }
                            await this.api(`/files/${encodeURIComponent(file.id)}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    appProperties: {
                                        backupLabel: value || null,
                                        savedAt: String(BackupManager.savedTime(file))
                                    }
                                })
                            });
                            await this.list();
                            this.status(
                                'Backup label updated. File contents and pin status were not changed.'
                            );
                            return;
                        }
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
                                    appProperties: {
                                        pinned: action === 'Pin' ? 'true' : 'false',
                                        savedAt: String(BackupManager.savedTime(file))
                                    }
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
                        const data = BackupManager.validate(
                            await this.api(`/files/${encodeURIComponent(file.id)}?alt=media`)
                        );
                        if (action === 'Preview') {
                            const preview = document.createElement('p');
                            preview.className = 'backup-preview';
                            preview.textContent = `Backup v${data.version} · ${data.appVersion || 'App version not recorded'} · ${BackupManager.summary(data)} · Created ${data.createdAt ? new Date(data.createdAt).toLocaleString() : 'unknown'}. No data restored.`;
                            row.querySelector('.backup-preview')?.remove();
                            row.append(preview);
                            this.status('Backup preview loaded; local data is unchanged.');
                            return;
                        }
                        if (action === 'Download') {
                            BackupManager.download(data, file.name);
                        } else {
                            if (
                                !confirm(
                                    `Restore this backup? ${BackupManager.summary(data)}. It replaces local data, not a merge. A recovery copy will be saved first.`
                                )
                            ) {
                                return;
                            }
                            await BackupManager.restore(data);
                            await this.remember(file.id, await BackupManager.snapshot());
                            this.finishOnboarding();
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
        let metadata = {
            name,
            appProperties: {
                kanjiBackup: 'v3',
                backupKind: checkpoint ? 'checkpoint' : 'manual',
                pinned: checkpoint ? 'false' : 'true',
                deviceLabel: (this.config.deviceLabel || '').slice(0, 24),
                savedAt: String(Date.now())
            }
        };
        if (!target) {
            metadata.parents = [folder];
        } else {
            // v2 exposes the file ETag as JSON and accepts it for conditional updates.
            // Its title/properties correspond to v3 name/appProperties.
            metadata = {
                title: name,
                properties: Object.entries({
                    ...target.appProperties,
                    ...metadata.appProperties
                }).map(([key, value]) => ({ key, value, visibility: 'PRIVATE' }))
            };
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
            `/upload/drive/${target ? 'v2' : 'v3'}/files${target ? `/${encodeURIComponent(target.id)}` : ''}?uploadType=multipart&fields=id`,
            {
                method: target ? 'PUT' : 'POST',
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
        if (this.onboardingPending) {
            this.finishOnboarding();
        }
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
        if (this.onboardingPending || this.pendingCloud || this.needsAccountChoice()) {
            return;
        }
        const now = Date.now();
        if (this.config.autoSync && this.nextAutoSave > now) {
            return;
        }
        if (
            !BackupManager.due(this.config) &&
            !this.nextAutoSave &&
            now < (this.nextCloudPoll || 0)
        ) {
            return;
        }
        const task = async () => {
            const signature = this.observedLocalSignature;
            await this.run(() => this.sync(BackupManager.due(this.config)));
            this.nextCloudPoll = Date.now() + 60000;
            if (!this.lastError && signature === this.observedLocalSignature) {
                this.nextAutoSave = 0;
            }
        };
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
        root.addEventListener('toggle', () => {
            if (root.open) {
                this.loadIdentity().catch((error) => this.status(error.message));
            }
        });
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
        this.observeLocalChanges();
        setInterval(() => {
            this.observeLocalChanges();
            this.tick();
        }, 5000);
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
        const appUser = window.kanjiAuth?.user;
        button.dataset.connected = String(connected);
        button.setAttribute(
            'aria-label',
            this.pendingCloud ? 'Account & sync: cloud copy needs review' : 'Account & sync'
        );
        document.getElementById('accountHeading').textContent = appUser
            ? appUser.displayName || 'Google account'
            : connected
              ? this.user.displayName || 'Google account'
              : 'Guest user';
        try {
            const nickname = JSON.parse(localStorage.getItem('kanji_profile') || '{}').nickname;
            if (typeof nickname === 'string' && nickname.trim()) {
                document.getElementById('accountHeading').textContent = nickname;
            }
        } catch {
            /* A malformed local profile must not prevent connecting. */
        }
        document.getElementById('accountIdentity').textContent = appUser
            ? appUser.email || 'Signed in to KanjiWidgets'
            : connected
              ? this.user.emailAddress
              : 'Local profile · connect to save to Drive.';
        document.getElementById('accountConnect').textContent = connected
            ? 'Switch Drive account'
            : 'Connect with Google Drive';
        document.getElementById('accountDisconnect').hidden = !connected;
        document.getElementById('accountOnboarding').hidden = !connected || !this.onboardingPending;
        document.getElementById('syncConflict').hidden =
            !this.pendingCloud && !this.needsAccountChoice();
        this.renderAvatar();
        this.renderSaveStatus();
    }

    initAccount() {
        const panel = document.getElementById('accountPanel');
        const button = document.getElementById('accountBtn');
        const fitPanel = () => {
            const bottom = button.closest('.app-header').getBoundingClientRect().bottom;
            panel.style.setProperty(
                '--account-panel-room',
                `${Math.max(160, window.innerHeight - bottom - 24)}px`
            );
        };
        window.addEventListener('resize', fitPanel);
        this.initProfile();
        document.getElementById('onboardingStart').onclick = () =>
            this.run(async () => {
                if (this.files.length) {
                    this.pendingCloud = this.files[0];
                    const data = BackupManager.validate(
                        await this.api(
                            `/files/${encodeURIComponent(this.pendingCloud.id)}?alt=media`
                        )
                    );
                    this.showComparison(await BackupManager.snapshot(), data, this.pendingCloud);
                    this.status(
                        'Review both copies below. Restore replaces local progress; a recovery copy is saved first.'
                    );
                } else {
                    if (this.needsAccountChoice()) {
                        this.status(
                            'Choose Save this device’s copy below to explicitly transfer your data to this account.'
                        );
                        return;
                    }
                    await this.sync();
                }
                this.finishOnboarding();
            });
        document.getElementById('onboardingLater').onclick = () => {
            this.config.autoSync = false;
            this.config.frequency = 'never';
            this.save();
            document.getElementById('accountAutoSync').checked = false;
            document.getElementById('driveFrequency').value = 'never';
            this.finishOnboarding();
            this.status(
                'Local-only learning selected. You can Quick save or enable sync whenever you are ready.'
            );
        };
        const close = () => {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        };
        button.onclick = () => {
            panel.hidden = !panel.hidden;
            button.setAttribute('aria-expanded', String(!panel.hidden));
            this.renderAccount();
            if (!panel.hidden) {
                fitPanel();
                document.getElementById('accountClose').focus();
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
            document.getElementById('driveBackup').open = true;
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
                this.finishOnboarding();
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

    showOnboarding() {
        const panel = document.getElementById('accountOnboarding');
        panel.hidden = !this.onboardingPending;
        if (!this.onboardingPending) {
            return;
        }
        document.getElementById('onboardingText').textContent = this.files.length
            ? 'This Google account has cloud saves. Review the latest copy before restoring it, or keep learning locally. Nothing has been uploaded by connecting.'
            : 'Your progress currently lives in this browser. Create your first cloud checkpoint to protect it, or continue locally. Automatic sync is optional.';
        document.getElementById('onboardingStart').textContent = this.files.length
            ? 'Review cloud save'
            : 'Create first checkpoint';
    }

    finishOnboarding() {
        if (this.user) {
            this.config.onboarded = { ...this.config.onboarded, [this.user.emailAddress]: true };
            this.save();
        }
        this.onboardingPending = false;
        this.showOnboarding();
    }

    static retryDelay(failures) {
        return Math.min(300000, 15000 * 2 ** Math.min(5, Math.max(0, failures - 1)));
    }

    observeLocalChanges(now = Date.now()) {
        // Cheap storage signature; no repeated base64 conversion of theme videos.
        const signature =
            JSON.stringify(
                Object.keys(localStorage)
                    .filter((key) => BackupManager.allowed(key))
                    .sort()
                    .map((key) => [key, localStorage.getItem(key)])
            ) + (BackupManager.mediaRevision || 0);
        if (
            this.observedLocalSignature !== undefined &&
            signature !== this.observedLocalSignature
        ) {
            this.nextAutoSave = now + 15000;
            this.localDirty = true;
            this.renderSaveStatus();
        }
        this.observedLocalSignature = signature;
    }

    initProfile() {
        const nickname = document.getElementById('profileNickname');
        const device = document.getElementById('profileDeviceLabel');
        const feedback = document.getElementById('profileStatus');
        try {
            nickname.value =
                JSON.parse(localStorage.getItem('kanji_profile') || '{}').nickname || '';
        } catch {
            nickname.value = '';
        }
        device.value = this.config.deviceLabel || '';
        document.getElementById('accountProfileForm').onsubmit = (event) => {
            event.preventDefault();
            const name = nickname.value.trim();
            const label = device.value.trim();
            try {
                this.saveProfilePreferences(name, label);
                feedback.textContent =
                    'Profile saved on this device. Quick save to include your name in the cloud copy. Device labels appear on future saves.';
            } catch (error) {
                feedback.textContent = error.message;
            }
        };
    }

    saveProfilePreferences(name, label) {
        name = name.trim();
        label = label.trim();
        if (
            name.length > 40 ||
            label.length > 24 ||
            Array.from(name + label).some(
                (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
            )
        ) {
            throw new Error(
                'Use a name up to 40 characters and a device label up to 24 characters, without control characters.'
            );
        }
        try {
            localStorage.setItem('kanji_profile', JSON.stringify({ nickname: name }));
            this.config.deviceLabel = label;
            this.save();
        } catch {
            throw new Error(
                'Could not save the complete profile. Browser storage may be full or unavailable. Free space and retry.'
            );
        }
        document.getElementById('profileNickname').value = name;
        document.getElementById('profileDeviceLabel').value = label;
        this.renderAccount();
        this.refreshSaveStatus();
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
        for (const id of ['avatarUpload', 'profilePagePhoto', 'profilePageRemovePhoto']) {
            const control = document.getElementById(id);
            if (control) {
                control.disabled = Boolean(this.avatarBusy);
                if (id === 'profilePageRemovePhoto') {
                    control.hidden = !this.avatarURL;
                }
            }
        }
        const appPhoto = window.kanjiAuth?.user?.photoURL;
        const photo = appPhoto || this.user?.photoLink;
        // App session or authorized Drive photo is a fallback only; custom uploads win.
        const googlePhoto =
            (appPhoto || this.authorized()) &&
            typeof photo === 'string' &&
            photo.startsWith('https://')
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
        window.kanjiProfilePage?.refresh();
    }

    async setAvatar(file) {
        if (this.avatarBusy) {
            throw new Error('Please wait for the current photo change to finish.');
        }
        this.avatarBusy = true;
        this.renderAvatar();
        try {
            return await this.writeAvatar(file);
        } finally {
            this.avatarBusy = false;
            this.renderAvatar();
        }
    }

    async writeAvatar(file) {
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
        window.kanjiProfilePage?.refresh();
        document.getElementById('avatarStatus').textContent = file
            ? 'Profile photo saved on this device. Included in full backups, not Firestore progress sync.'
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
                window.KanjiFeedback?.show(error.message, { title: 'Photo not uploaded' });
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
            } catch (error) {
                if (error.code === 'NEWER_BACKUP') {
                    throw error;
                }
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
                this.status('Already saved. No changes, so no upload or extra backup was created.');
                return;
            }
            if (!base || newest.id !== base.id || cloudHash !== base.hash) {
                this.pendingCloud = newest;
                this.showComparison(data, cloud, newest);
                this.status(
                    `Cloud copy from ${new Date(BackupManager.savedTime(newest)).toLocaleString()} needs review. Choose cloud or this device; automatic saving is paused.`
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
            this.config.checkpointProtocols?.[this.user.emailAddress] === 'metadata-etag-v1' &&
            this.config.checkpointDiagnostics?.[this.user.emailAddress] === true &&
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
