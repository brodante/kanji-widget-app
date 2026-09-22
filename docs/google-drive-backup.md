# Google Drive backups on GitHub Pages

No paid hosting, backend or client secret is needed. This feature uses Google Identity Services' browser OAuth token flow and the Drive `drive.file` scope. **Connect with Google authorizes backups; it is not a server-side login system or continuous multi-device sync.** The application still works locally without Google.

## Account menu and multi-device use

The header's **user-circle icon** opens Account & sync. It shows Guest user until Google access is authorized, then shows the account name/email. You can connect/switch accounts, disconnect, sync now, back up now, or jump directly to backup settings/history. The mobile header wraps into two rows instead of squeezing the Settings button offscreen.

1. On device A, connect Google and select **Sync automatically while this app is open**. Sync now checks immediately; automatic checks run about every minute while visible and online.
2. On device B, connect the **same Google account using the same site/OAuth client**. A differing cloud copy is presented for review. Choose **Use cloud copy** to restore it (replacing device B's local data). Restore reloads the app, so reconnect afterward.
3. Changes on a device upload automatically when its known cloud copy has not changed. Unchanged snapshots do not create duplicate sync backups. Scheduled backups can still create periodic snapshots.
4. When another device has a newer differing cloud copy, automatic uploads pause. Choose cloud or explicitly **Save this device's copy**. No field-by-field merge or silent cloud restore is performed. A direct **Back up now** is an explicit upload and makes that device's copy the latest.

Baselines are scoped to each Google account on each device. Google access tokens remain in memory, so reloads/expired access require reconnecting. This is foreground snapshot sync, **not permanent SSO, real-time collaborative editing, or closed-browser sync**. Simultaneous uploads can both create history entries; the newest entry becomes the proposed cloud state. Keep history if you use multiple devices; automatic retention applies across them.

The public client ID supplied in the attachment filename has been configured in `backup-config.js`. The uploaded JSON itself was not accessible in the workspace, so its authorized origins/console settings could not be verified. Never commit the downloaded `client_secret_*.json` file. Only the public client ID belongs in frontend code.

## Deploying the account button

Changes in a working branch are not automatically live on `kanji.qd.je`. The existing Pages workflow deploys pushes to `main` (or a manually dispatched workflow). Review/merge these changes through your normal process and verify the Pages workflow succeeds. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source when using this workflow. The repository was last observed using legacy branch deployment (`main`, `/`), so this setting needs review. This update includes the backup scripts, drawing script, theme assets and required `database/` files in the deployment artifact, and bumps the service-worker cache version. After deployment, reload the site; if an old installed PWA still appears, close/reopen it and reload online. Do not clear site storage without exporting your local data first.

## Owner setup for kanji.qd.je

1. In GitHub Pages settings, configure the custom domain `kanji.qd.je`, wait for its certificate, and enable **Enforce HTTPS**. Use `https://kanji.qd.je`, not HTTP. Browser storage is origin-specific: export data on the old origin before moving to HTTPS or another host, then import it on the new origin.
2. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/), and enable **Google Drive API**.
3. In **Google Auth Platform**, configure Branding, Audience and Data Access. Choose an external audience if people outside your organization will use it. Request `https://www.googleapis.com/auth/drive.file` only. This restricts access to files created/opened through this app, not users' entire Drives.
4. While the app is in Testing, explicitly add the Google accounts you will test with under Test users. For public use, move to Production and complete any consent, domain/brand verification or policy requirements Google displays. Provide an accurate privacy policy explaining backup data, Drive access, retention and revocation.
5. Create an OAuth client of type **Web application**. Add **Authorized JavaScript origins**:
    - `https://kanji.qd.je`
    - Your exact GitHub Pages origin if it also serves the app (no repository path).
    - Optionally `http://localhost:5000` for development. For a hosted preview, add its exact HTTPS origin separately.
      Origins have no paths or trailing slash. This popup token flow needs no redirect URI. Do not create an Android/Desktop client.
6. Put the **public client ID**, ending in `.apps.googleusercontent.com`, in `backup-config.js`:
    ```js
    window.KANJI_BACKUP_CONFIG = {
        googleClientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com'
    };
    ```
    This ID is public and safe to commit. **Never put a client secret, access token or refresh token in the repository.** Alternatively, enter a public client ID in Settings → Google connection setup for a device-local test.
7. Deploy these files with your normal GitHub Pages workflow. Open the header Account & sync menu → Connect with Google (also available in Settings → Backup & Data). Opening the account panel preloads Google’s library; if it is still loading, follow the prompt to click Connect again. Grant Drive access and click Back up now.

### About free/shared subdomains

A custom HTTPS subdomain can host this client-side code; buying hosting is not required. However, a free subdomain is **not a guarantee of Google OAuth/domain verification approval**. Google's console may require verification of the registrable/authorized domain, and a shared-domain provider may not give you that control. If `kanji.qd.je` is rejected or verification cannot be completed, ask your subdomain provider about verification, or use a domain you control and can verify. Do not enter `qd.je` as though you own it. An `origin_mismatch` error generally means the current browser origin is absent from the OAuth client's JavaScript origins.

## Backup behavior

- Creates/reuses an app-tagged **Kanji Widgets Backups** folder in the selected account's My Drive. The app deliberately manages its own folder rather than requesting permission to arbitrary existing folders. “Open backup folder” opens it in Drive.
- Full version-3 backups include progress, SRS cards, recent kanji, streak, preferences from both settings stores, theme selection, custom CSS/theme configuration, uploaded custom-theme media, AI preferences/cache and floating button position.
- Downloaded kanji/offline caches, bundled assets, old backup copies, device-local backup connection/schedule settings, API keys and OAuth credentials are excluded. AI keys already on the restoring device are preserved. Re-enter them on new devices. AI cached responses and custom themes may contain personal content: treat downloaded JSON files as private. Files are not app-encrypted.
- Automatic scheduling is off by default. Choose daily, every 7 days or every 30 days and a local time. The first backup is due at that time today. Subsequent due dates are counted from the last successful upload's local date. A manual upload resets the schedule. Missed runs are caught up once the app is visible, online and authorized. Checks run every minute and when returning to the app or coming online.
- Tokens exist only in memory and normally expire in about an hour. Reloading or closing the app loses access. Expired access requires another explicit Connect click. The app never opens automatic consent popups and cannot back up while closed, offline or reliably while backgrounded. Truly unattended backups require a backend with secure refresh-token handling, outside this GitHub Pages-only design.
- History supports refresh, download, restore and move-to-trash. Optional retention keeps the newest 5, 10 or 20 app backups in the folder; the default keeps all. Retention includes backups made by other devices using this OAuth app. If a partial operation fails after upload, inspect history before retrying.
- Restore requires confirmation and **replaces**, rather than merges, the current device's included data. Invalid versions/keys/media are rejected before mutation. Storage failures attempt rollback. Keep a local backup before restoring. Existing legacy local JSON imports remain supported; old exports did not include all themes/settings.
- Local Create Backup and local automatic snapshots now use the full format too. Local automatic copies remain in this browser's storage (last five); they are not external disaster recovery. Large media can exceed localStorage quota, so use downloaded or Drive copies for those themes.
- Disconnect revokes the current Google access grant when available and clears the in-memory token. Existing Drive files are kept. You can also remove the app from your Google account's third-party connections; file deletion is separate.

## Manual acceptance test (requires configured OAuth client)

1. Create progress and a custom theme with an uploaded image/video; download a local backup.
2. Connect a test Google account, upload, refresh history and open the folder. Confirm the JSON contains no API keys/tokens.
3. Change settings and progress, restore, and verify the original state and uploaded media after reload.
4. Test a second device with the same Google account, reconnect and restore.
5. Select a retention limit and upload beyond it; verify only app-tagged backups are moved to trash.
6. Disconnect, deny consent, block popups, go offline and reload; confirm local learning still works and failures never claim success. Set a due schedule and verify reconnect catches it up, while token expiry asks for reconnection.

GitHub OAuth was not added: its usual authorization-code exchange requires a protected backend/client secret. Google Drive supplies both account authorization and a user-owned backup destination without introducing a server.
