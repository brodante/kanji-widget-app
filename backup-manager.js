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
    static async media(write) {
        const db = await openCustomThemeDB();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('images', write ? 'readwrite' : 'readonly');
                const store = tx.objectStore('images');
                const result = {};
                for (const slot of ['slot1', 'slot2', 'slot3']) {
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
                !/^slot[123]$/.test(slot) ||
                typeof value !== 'string' ||
                !/^data:(image\/[a-zA-Z0-9.+-]+|video\/(mp4|webm|ogg));base64,[A-Za-z0-9+/=\s]+$/.test(
                    value
                )
            ) {
                throw new Error('Invalid theme media.');
            }
        }
        return data;
    }
    static async restore(data) {
        this.validate(data);
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
            this.status(e.message);
            this.retryAfter = Date.now() + 300000;
        } finally {
            this.busy = false;
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
                    const about = await this.api('/about?fields=user(displayName,emailAddress)');
                    this.user = about.user;
                    this.status(
                        `Connected as ${about.user.emailAddress}. Access lasts about one hour; reconnect when requested.`
                    );
                    await this.sync();
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
    async api(path, options = {}) {
        if (!this.authorized()) {
            this.token = null;
            throw new Error(
                'Connect with Google to authorize Drive backups (access expired or not connected).'
            );
        }
        const response = await fetch(
            `https://www.googleapis.com${path.startsWith('/upload/') ? path : `/drive/v3${path}`}`,
            {
                ...options,
                headers: { ...options.headers, Authorization: `Bearer ${this.token}` }
            }
        );
        if (response.status === 401) {
            this.token = null;
            throw new Error('Google access expired. Reconnect to continue.');
        }
        if (!response.ok) {
            throw new Error(
                `Drive request failed (${response.status}). Check connectivity, Drive API setup, permissions and storage quota.`
            );
        }
        return response.status === 204 ? null : response.json();
    }
    async find(q) {
        const files = [];
        let pageToken = '';
        do {
            const result = await this.api(
                `/files?${new URLSearchParams({
                    q,
                    spaces: 'drive',
                    fields: 'nextPageToken,files(id,name,createdTime,size)',
                    pageSize: '100',
                    orderBy: 'createdTime desc',
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
            label.textContent = `${file.name} · ${new Date(file.createdTime).toLocaleString()} · ${Math.ceil(Number(file.size || 0) / 1024)} KB`;
            row.append(label);
            for (const action of ['Download', 'Restore', 'Delete']) {
                const button = document.createElement('button');
                button.className = 'backup-btn';
                button.textContent = action;
                button.onclick = () =>
                    this.run(async () => {
                        if (action === 'Delete') {
                            if (!confirm(`Move ${file.name} to Drive trash?`)) {
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
                            location.reload();
                        }
                    });
                row.append(button);
            }
            list.append(row);
        }
    }
    async backup() {
        const folder = await this.ensureFolder();
        const data = await BackupManager.snapshot();
        const prefix =
            (this.config.prefix || 'kanji-backup').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) ||
            'kanji-backup';
        const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const boundary = `kanji_${crypto.randomUUID()}`;
        const metadata = { name, parents: [folder], appProperties: { kanjiBackup: 'v3' } };
        const body = new Blob([
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            JSON.stringify(metadata),
            `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
            JSON.stringify(data),
            `\r\n--${boundary}--`
        ]);
        const uploaded = await this.api('/upload/drive/v3/files?uploadType=multipart&fields=id', {
            method: 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body
        });
        if (this.user) {
            await this.remember(uploaded.id, data);
        }
        this.pendingCloud = null;
        this.config.lastBackup = Date.now();
        this.save();
        await this.list();
        const keep = Number(this.config.keep || 0);
        if ([5, 10, 20].includes(keep)) {
            for (const file of this.files.slice(keep)) {
                await this.api(`/files/${encodeURIComponent(file.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{"trashed":true}'
                });
            }
            await this.list();
        }
        this.status(`Backup saved ${new Date(this.config.lastBackup).toLocaleString()}.`);
    }
    static due(config, now = Date.now()) {
        const days = { daily: 1, weekly: 7, monthly: 30 }[config.frequency];
        if (!days) {
            return false;
        }
        const [hour, minute] = (config.time || '19:00').split(':').map(Number);
        const next = new Date(config.lastBackup || now);
        next.setHours(hour, minute, 0, 0);
        if (config.lastBackup) {
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
        root.querySelector('#driveNow').onclick = () => this.run(() => this.backup());
        root.querySelector('#driveRefresh').onclick = () => this.run(() => this.list());
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
        document.getElementById('syncConflict').hidden = !this.pendingCloud;
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
                if (
                    !file ||
                    !confirm(
                        'Replace local progress, settings and themes with the cloud copy? Download a local backup first if you want to keep both.'
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
                await this.backup();
            });
        this.renderAccount();
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
        this.config.syncStates = states;
        this.save();
    }

    async sync(forceBackup = false) {
        if (!this.authorized() || !this.user) {
            throw new Error('Connect with Google before syncing.');
        }
        await this.list();
        const newest = this.files[0];
        const data = await BackupManager.snapshot();
        const hash = await BackupManager.fingerprint(data);
        const base = this.config.syncStates?.[this.user.emailAddress];
        if (newest && newest.id !== base?.id) {
            const cloud = BackupManager.validate(
                await this.api(`/files/${encodeURIComponent(newest.id)}?alt=media`)
            );
            if ((await BackupManager.fingerprint(cloud)) === hash) {
                await this.remember(newest.id, data);
            } else {
                this.pendingCloud = newest;
                this.status(
                    `Cloud copy from ${new Date(newest.createdTime).toLocaleString()} is available. Open Account & sync to choose cloud or this device. Automatic uploads paused to protect both versions.`
                );
                document
                    .getElementById('accountBtn')
                    .setAttribute('aria-label', 'Account & sync — cloud copy needs review');
                return;
            }
        } else if (!newest || hash !== base?.hash || forceBackup) {
            await this.backup();
        }
        this.pendingCloud = null;
        this.status(`Up to date with Google Drive. Checked ${new Date().toLocaleTimeString()}.`);
    }
}
window.BackupManager = BackupManager;
window.addEventListener('DOMContentLoaded', () => {
    window.driveBackup = new BackupManager();
    window.driveBackup.init();
});
