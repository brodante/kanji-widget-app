/* global BackupManager */
// A dedicated in-app page keeps the current Google authorization in memory.
class ProfilePage {
    static read(key, fallback = {}) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
        } catch {
            return fallback;
        }
    }

    static stats(now = Date.now()) {
        const progress = this.read('kanji_progress');
        const cards = Object.values(this.read('kanji_srs_data')).filter(
            (card) => card && typeof card === 'object'
        );
        const count = (list) =>
            Array.isArray(list)
                ? new Set(list.filter((value) => typeof value === 'string')).size
                : 0;
        const number = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
        const date = (value) =>
            typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now
                ? value
                : null;
        return {
            studied: count(progress.studied),
            mastered: count(progress.mastered),
            reviews: cards.reduce((total, card) => total + number(card.totalReviews), 0),
            due: cards.filter(
                (card) =>
                    typeof card.dueDate === 'number' && card.dueDate > 0 && card.dueDate <= now
            ).length,
            startDate: date(progress.startDate),
            lastStudied: date(progress.lastStudied)
        };
    }

    constructor(manager) {
        this.manager = manager;
        this.dialog = document.getElementById('profilePage');
    }

    open() {
        const nickname = ProfilePage.read('kanji_profile').nickname;
        document.getElementById('profilePageNickname').value =
            typeof nickname === 'string' ? nickname : '';
        document.getElementById('profilePageDevice').value = this.manager.config.deviceLabel || '';
        document.getElementById('accountPanel').hidden = true;
        document.getElementById('accountBtn').setAttribute('aria-expanded', 'false');
        if (location.hash !== '#profile') {
            history.pushState(null, '', '#profile');
        }
        if (!this.dialog.open) {
            this.dialog.showModal();
        }
        document.body.classList.add('profile-page-open');
        this.refresh();
        document.getElementById('profilePageBack').focus();
        this.manager.loadIdentity().catch(() => {
            /* Connect surfaces any network failure. */
        });
    }

    close() {
        if (location.hash === '#profile') {
            history.replaceState(null, '', location.pathname + location.search);
        }
        if (this.dialog.open) {
            this.dialog.close();
        }
        document.body.classList.remove('profile-page-open');
        document.getElementById('accountBtn').focus();
    }

    refresh() {
        if (!this.dialog.open) {
            return;
        }
        const manager = this.manager;
        const connected = manager.authorized() && manager.user;
        const appUser = window.kanjiAuth?.user;
        const nickname = ProfilePage.read('kanji_profile').nickname;
        document.getElementById('profilePageTitle').textContent =
            typeof nickname === 'string' && nickname.trim()
                ? nickname
                : appUser
                  ? appUser.displayName || 'Google account'
                  : connected
                    ? manager.user.displayName || 'Google account'
                    : 'Guest user';
        document.getElementById('profilePageIdentity').textContent = appUser
            ? appUser.email || 'Signed in to KanjiWidgets'
            : connected
              ? manager.user.emailAddress
              : 'Local profile. Connect whenever you want a cloud copy.';
        const stats = ProfilePage.stats();
        const date = (value) =>
            new Date(value).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        document.getElementById('profileLearningSince').textContent = stats.startDate
            ? `Learning since ${date(stats.startDate)}`
            : 'Your learning start date has not been recorded yet.';
        document.getElementById('profileLastStudied').textContent = stats.lastStudied
            ? `Last studied ${date(stats.lastStudied)}`
            : 'Your next study session starts here.';
        for (const [id, value] of Object.entries({
            profileStudied: stats.studied,
            profileMastered: stats.mastered,
            profileReviewTotal: stats.reviews,
            profileReviewDue: stats.due
        })) {
            document.getElementById(id).textContent = String(value);
        }
        document.getElementById('profilePageSaveHealth').textContent =
            document.getElementById('saveHealth').textContent;
        document.getElementById('profilePageCloudStatus').textContent =
            document.getElementById('accountStatus').textContent;
        document.getElementById('profilePageConnect').textContent = connected
            ? 'Switch Drive account'
            : 'Connect with Google Drive';
        document.getElementById('profilePageReview').hidden =
            !manager.pendingCloud && !manager.needsAccountChoice() && !manager.onboardingPending;
        document.getElementById('profilePageReview').textContent = manager.onboardingPending
            ? 'Choose how to save'
            : 'Review cloud changes';
        document.getElementById('profileAppBuild').textContent = `App ${BackupManager.BUILD}`;
        const image = document.getElementById('profilePageAvatar');
        const source = document.getElementById('accountAvatar').dataset.source || '';
        if (source !== image.dataset.source) {
            image.dataset.source = source;
            image.hidden = true;
            image.nextElementSibling.hidden = false;
            image.onload = () => {
                image.hidden = false;
                image.nextElementSibling.hidden = true;
            };
            image.onerror = () => {
                image.hidden = true;
                image.nextElementSibling.hidden = false;
            };
            if (source) {
                image.src = source;
            } else {
                image.removeAttribute('src');
            }
        }
        this.dialog.querySelectorAll('.profile-cloud-action').forEach((button) => {
            button.disabled = manager.busy;
        });
    }

    init() {
        document.getElementById('settingsOpenProfile').onclick = () => {
            document.getElementById('closeSettings').click();
            this.open();
        };
        document.querySelectorAll('[data-settings-target]').forEach((button) => {
            button.onclick = () => {
                const section = document.getElementById(button.dataset.settingsTarget);
                if (!section) {
                    return;
                }
                if (section.tagName === 'DETAILS') {
                    section.open = true;
                }
                section.scrollIntoView({ block: 'start', behavior: 'auto' });
                section.focus({ preventScroll: true });
            };
        });
        document.getElementById('openProfilePage').onclick = () => this.open();
        document.getElementById('profilePageBack').onclick = () => this.close();
        this.dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            this.close();
        });
        this.dialog.addEventListener('close', () => {
            document.body.classList.remove('profile-page-open');
            if (location.hash === '#profile') {
                history.replaceState(null, '', location.pathname + location.search);
            }
        });
        window.addEventListener('hashchange', () => {
            if (location.hash === '#profile') {
                this.open();
            } else if (this.dialog.open) {
                this.close();
            }
        });
        window.addEventListener('storage', () => this.refresh());
        document.getElementById('profilePageForm').onsubmit = (event) => {
            event.preventDefault();
            const feedback = document.getElementById('profilePageFeedback');
            try {
                this.manager.saveProfilePreferences(
                    document.getElementById('profilePageNickname').value,
                    document.getElementById('profilePageDevice').value
                );
                feedback.textContent = 'Profile saved here. Quick save to update your cloud copy.';
            } catch (error) {
                feedback.textContent = error.message;
            }
        };
        const upload = document.getElementById('profilePagePhoto');
        const input = document.getElementById('profilePagePhotoFile');
        upload.onclick = () => input.click();
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) {
                return;
            }
            upload.disabled = true;
            try {
                await this.manager.setAvatar(file);
                document.getElementById('profilePageFeedback').textContent =
                    'Photo saved. It will be included in your next backup.';
            } catch (error) {
                document.getElementById('profilePageFeedback').textContent = error.message;
            } finally {
                input.value = '';
                upload.disabled = false;
                this.refresh();
            }
        };
        document.getElementById('profilePageConnect').onclick = () => this.manager.connect();
        document.getElementById('profilePageQuickSave').onclick = () =>
            this.manager.run(() => this.manager.sync());
        document.getElementById('profilePageNewBackup').onclick = () =>
            this.manager.run(() => this.manager.backup());
        document.getElementById('profilePageExport').onclick = () =>
            this.manager.run(async () =>
                BackupManager.download(await BackupManager.snapshot(), 'kanji-profile-backup.json')
            );
        document.getElementById('profilePageHistory').onclick = () => {
            this.close();
            document.getElementById('accountSettings').click();
        };
        document.getElementById('profilePageReview').onclick = (event) => {
            event.stopPropagation();
            this.close();
            document.getElementById('accountBtn').click();
        };
        if (location.hash === '#profile') {
            this.open();
        }
    }
}
window.ProfilePage = ProfilePage;
window.addEventListener('DOMContentLoaded', () => {
    window.kanjiProfilePage = new ProfilePage(window.driveBackup);
    window.kanjiProfilePage.init();
});
