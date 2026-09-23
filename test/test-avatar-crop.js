// Square avatar cropping: the record, the maths behind it, the dialog and the
// guarantee that an animated GIF is never re-encoded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
// Values come from the jsdom realm, so compare their data, not their prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value));

async function setup(options = {}) {
    const dom = new JSDOM(read('index.html'), {
        url: 'https://kanji.qd.je',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    window.eval(read('avatar-crop.js'));
    const dialog = window.document.getElementById('avatarCropDialog');
    // jsdom has no <dialog> implementation, so give it the two methods and the
    // reflected open property the component relies on.
    Object.defineProperty(dialog, 'open', {
        get: () => dialog.hasAttribute('open'),
        configurable: true
    });
    dialog.showModal = () => {
        dialog.setAttribute('open', '');
    };
    dialog.close = () => {
        dialog.removeAttribute('open');
        dialog.dispatchEvent(new window.Event('close'));
    };
    const stage = window.document.getElementById('avatarCropStage');
    Object.defineProperty(stage, 'clientWidth', { value: 200, configurable: true });
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });
    const crop = new window.AvatarCrop();
    crop.init();
    window.avatarCrop = crop;
    // A decoded image, without a real decode: jsdom reports 0x0 for every bitmap.
    const image = window.document.getElementById('avatarCropImage');
    const sizes = options.sizes || { width: 1200, height: 600 };
    Object.defineProperty(image, 'naturalWidth', { value: sizes.width, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: sizes.height, configurable: true });
    image.onload = null;
    window.URL.createObjectURL = () => options.url || 'blob:photo';
    window.URL.revokeObjectURL = () => {};
    return { dom, window, crop, dialog, stage, image, sizes };
}

// jsdom never decodes images, so the harness fires onload by hand. The promise
// resolves later, when the dialog is saved or cancelled.
function openCrop(harness, value = { x: 0.5, y: 0.5, zoom: 1 }) {
    const pending = harness.crop.open({
        src: harness.window.URL.createObjectURL(),
        crop: value,
        name: 'photo.png'
    });
    harness.image.onload?.();
    return pending;
}

// ---------------------------------------------------------------- the record

test('crop records are normalised, clamped and stored separately from the photo', async () => {
    const { dom, window } = await setup();
    try {
        const AvatarCrop = window.AvatarCrop;
        assert.deepEqual(plain(AvatarCrop.normalize({})), { x: 0.5, y: 0.5, zoom: 1, ratio: 1 });
        // Zoom 3 on a 2:1 photo: the window spans 1/6 of the width and 1/3 of the
        // height, so the centre can sit within those bounds and no further.
        assert.deepEqual(plain(AvatarCrop.normalize({ x: 5, y: -3, zoom: 99, ratio: 2 })), {
            x: 0.9167,
            y: 0.1667,
            zoom: 3,
            ratio: 2
        });
        assert.equal(AvatarCrop.normalize({ zoom: 0.1 }).zoom, 1, 'zoom never goes below 1');
        assert.equal(AvatarCrop.normalize({ ratio: -5 }).ratio, 1, 'a broken ratio is ignored');
        assert.deepEqual(plain(AvatarCrop.normalize(null)), { x: 0.5, y: 0.5, zoom: 1, ratio: 1 });

        assert.equal(AvatarCrop.read(), null);
        const written = AvatarCrop.write({ x: 0.2, y: 0.8, zoom: 2, ratio: 0.5 });
        assert.deepEqual(plain(AvatarCrop.read()), plain(written));
        assert.equal(
            window.localStorage.getItem(AvatarCrop.KEY),
            JSON.stringify(written),
            'the crop is a small record, not image data'
        );
        AvatarCrop.clear();
        assert.equal(AvatarCrop.read(), null);
        window.localStorage.setItem(AvatarCrop.KEY, '{not json');
        assert.equal(AvatarCrop.read(), null, 'damaged storage must not break the avatar');
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('a pan is limited to the photo, so a crop can never show empty space', async () => {
    const { dom, window } = await setup();
    try {
        const AvatarCrop = window.AvatarCrop;
        // Wide photo: only horizontal movement is possible at zoom 1.
        const wide = AvatarCrop.bounds({ zoom: 1, ratio: 2 });
        assert.deepEqual([wide.minX, wide.maxX], [0.25, 0.75]);
        assert.deepEqual([wide.minY, wide.maxY], [0.5, 0.5]);
        // Tall photo: the opposite.
        const tall = AvatarCrop.bounds({ zoom: 1, ratio: 0.5 });
        assert.deepEqual([tall.minX, tall.maxX], [0.5, 0.5]);
        assert.deepEqual([tall.minY, tall.maxY], [0.25, 0.75]);
        // Square photo: nothing to pan until it is zoomed.
        const square = AvatarCrop.bounds({ zoom: 1, ratio: 1 });
        assert.deepEqual(
            [square.minX, square.maxX, square.minY, square.maxY],
            [0.5, 0.5, 0.5, 0.5]
        );
        const zoomed = AvatarCrop.bounds({ zoom: 2, ratio: 1 });
        assert.deepEqual([zoomed.minX, zoomed.maxX], [0.25, 0.75]);
        // Out-of-range values are pulled back inside the photo.
        assert.equal(AvatarCrop.normalize({ x: 0, y: 0, zoom: 1, ratio: 2 }).x, 0.25);
        assert.equal(AvatarCrop.normalize({ x: 1, y: 1, zoom: 1, ratio: 0.5 }).y, 0.75);
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('the transform puts the chosen point of the photo at the centre of the frame', async () => {
    const { dom, window } = await setup();
    try {
        const AvatarCrop = window.AvatarCrop;
        // Centred: no offset at all.
        assert.deepEqual(plain(AvatarCrop.transform({ x: 0.5, y: 0.5, zoom: 1, ratio: 2 })), {
            zoom: 1,
            tx: 0,
            ty: 0
        });
        // Far left of a wide photo: the element moves right by half of the overflow.
        const left = AvatarCrop.transform({ x: 0.25, y: 0.5, zoom: 1, ratio: 2 });
        assert.equal(left.tx, 50);
        assert.equal(left.ty, 0);
        const right = AvatarCrop.transform({ x: 0.75, y: 0.5, zoom: 1, ratio: 2 });
        assert.equal(right.tx, -50);
        // Top of a tall photo moves it down, and the axis without overflow never moves.
        const tall = AvatarCrop.transform({ x: 0.5, y: 0.25, zoom: 1, ratio: 0.5 });
        assert.equal(tall.tx, 0);
        assert.equal(tall.ty, 50);
        // Zooming doubles the offset for the same visible point.
        const zoomed = AvatarCrop.transform({ x: 0.25, y: 0.5, zoom: 2, ratio: 2 });
        assert.equal(zoomed.tx, 100);
        assert.equal(zoomed.zoom, 2);
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('the crop is applied to every avatar and cleared for a Google photo', async () => {
    const { dom, window } = await setup();
    try {
        const doc = window.document;
        const nodes = [...doc.querySelectorAll('[data-avatar-crop]')];
        assert.equal(nodes.length, 3, 'header, account panel and profile page');
        assert.equal(window.AvatarCrop.apply(doc, null), 3);
        for (const node of nodes) {
            assert.equal(node.style.getPropertyValue('--avatar-zoom'), '');
        }
        window.AvatarCrop.write({ x: 0.25, y: 0.5, zoom: 2, ratio: 2 });
        window.AvatarCrop.apply(doc);
        for (const node of nodes) {
            assert.equal(node.style.getPropertyValue('--avatar-zoom'), '2');
            assert.equal(node.style.getPropertyValue('--avatar-tx'), '100%');
            assert.equal(node.style.getPropertyValue('--avatar-ty'), '0%');
        }
        window.AvatarCrop.apply(doc, null);
        for (const node of nodes) {
            assert.equal(node.style.getPropertyValue('--avatar-tx'), '');
        }
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

// ---------------------------------------------------------------- the dialog

test('the dialog opens on the whole photo, framed in a square', async () => {
    const { dom, window, crop, image } = await setup();
    try {
        const doc = window.document;
        const pending = openCrop(harnessFrom(window, crop, image), {
            x: 0.5,
            y: 0.5,
            zoom: 1
        });
        assert.equal(doc.getElementById('avatarCropDialog').open, true);
        assert.equal(image.src, 'blob:photo');
        assert.equal(doc.getElementById('avatarCropSource').src, 'blob:photo');
        assert.equal(doc.getElementById('avatarCropCaption').textContent, 'photo.png');
        assert.equal(image.style.getPropertyValue('--avatar-zoom'), '1');
        const frame = doc.getElementById('avatarCropFrame');
        assert.ok(frame.classList.contains('avatar-frame'), 'the preview uses the real frame');
        assert.match(doc.getElementById('avatarCropStatus').textContent, /Zoom 100%/);
        assert.equal(doc.getElementById('avatarCropSave').textContent.trim(), 'Use this crop');
        crop.close(null);
        assert.equal(await pending, null);
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('zoom, panning and reset move the photo and stay inside it', async () => {
    const { dom, window, crop, image } = await setup();
    try {
        const harness = harnessFrom(window, crop, image);
        const pending = openCrop(harness);
        const doc = window.document;
        // Wide 1200x600 photo: at zoom 1 the frame can pan 25%..75% horizontally.
        crop.pan(-100, 0);
        assert.equal(crop.value.x, 0.75, 'dragging left reveals the right of the photo');
        assert.equal(crop.value.y, 0.5, 'a wide photo cannot pan vertically at zoom 1');
        crop.pan(1000, 0);
        assert.equal(crop.value.x, 0.25, 'panning stops at the edge of the photo');
        crop.setZoom(2);
        assert.equal(crop.value.zoom, 2);
        assert.equal(doc.getElementById('avatarCropZoom').value, '2');
        crop.pan(0, -100);
        assert.ok(crop.value.y > 0.5, 'zooming unlocks vertical panning');
        assert.equal(doc.getElementById('avatarCropFrame').dataset.zoomed, 'true');
        crop.reset();
        assert.deepEqual(plain({ x: crop.value.x, y: crop.value.y, zoom: crop.value.zoom }), {
            x: 0.5,
            y: 0.5,
            zoom: 1
        });
        crop.setZoom(99);
        assert.equal(crop.value.zoom, 3, 'zoom is clamped');
        crop.setZoom(0.1);
        assert.equal(crop.value.zoom, 1);
        crop.close(null);
        await pending;
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('keyboard, wheel and pointer gestures all drive the crop', async () => {
    const { dom, window, crop, image, stage } = await setup();
    try {
        const harness = harnessFrom(window, crop, image);
        const pending = openCrop(harness);
        const before = { ...crop.value };
        stage.dispatchEvent(
            new window.KeyboardEvent('keydown', {
                key: 'ArrowLeft',
                bubbles: true,
                cancelable: true
            })
        );
        assert.ok(crop.value.x < before.x, 'left arrow nudges the photo');
        stage.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })
        );
        assert.ok(crop.value.zoom > before.zoom, 'plus key zooms in');
        stage.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
        );
        assert.equal(crop.value.zoom, 1, 'r resets');

        const pointer = (type, x, y) =>
            stage.dispatchEvent(
                new window.PointerEvent(type, {
                    pointerId: 1,
                    clientX: x,
                    clientY: y,
                    bubbles: true
                })
            );
        pointer('pointerdown', 100, 100);
        pointer('pointermove', 80, 100);
        pointer('pointerup', 80, 100);
        assert.ok(crop.value.x > 0.5, 'dragging left moves the visible window right');

        const wheel = new window.WheelEvent('wheel', {
            deltaY: -100,
            clientX: 100,
            clientY: 100,
            bubbles: true,
            cancelable: true
        });
        stage.dispatchEvent(wheel);
        assert.ok(crop.value.zoom > 1, 'the wheel zooms');
        assert.equal(wheel.defaultPrevented, true, 'the page must not scroll behind the dialog');

        crop.close(null);
        await pending;
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('save returns the crop and cancel or Escape keeps the previous one', async () => {
    const { dom, window, crop, image } = await setup();
    try {
        const doc = window.document;
        const harness = harnessFrom(window, crop, image);
        const saving = openCrop(harness, { x: 0.5, y: 0.5, zoom: 1, ratio: 2 });
        crop.setZoom(2);
        crop.pan(-50, 0);
        const chosen = { ...crop.value };
        doc.getElementById('avatarCropSave').click();
        const saved = await saving;
        assert.deepEqual(plain(saved), plain(chosen));
        assert.equal(doc.getElementById('avatarCropDialog').open, false);

        const cancelling = openCrop(harness, { x: 0.4, y: 0.5, zoom: 1, ratio: 2 });
        crop.setZoom(3);
        doc.getElementById('avatarCropCancel').click();
        assert.equal(await cancelling, null, 'cancelling discards the change');

        const escaping = openCrop(harness, { x: 0.4, y: 0.5, zoom: 1, ratio: 2 });
        const event = new window.Event('cancel', { cancelable: true });
        doc.getElementById('avatarCropDialog').dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
        assert.equal(await escaping, null);

        // Without a dialog (old browsers, tests) the caller keeps working.
        const bare = new window.AvatarCrop({ root: new window.Object() });
        assert.equal(await bare.open({ src: 'blob:x' }), null);
        assert.deepEqual(plain(await bare.open({ src: 'blob:x', crop: { x: 0.3, ratio: 2 } })), {
            x: 0.3,
            y: 0.5,
            zoom: 1,
            ratio: 2
        });
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('a GIF is previewed and stored untouched, and nothing is drawn to a canvas', async () => {
    const { dom, window, crop, image } = await setup();
    try {
        const source = read('avatar-crop.js');
        assert.equal(
            /createElement\(['"]canvas|toDataURL|drawImage|getImageData/.test(source),
            false
        );
        const harness = harnessFrom(window, crop, image);
        const pending = openCrop(harness);
        const doc = window.document;
        assert.equal(doc.getElementById('avatarCropImage').src, 'blob:photo');
        // The preview is a live <img>, which is what keeps an animated GIF animating.
        assert.equal(doc.querySelectorAll('#avatarCropImage').length, 1);
        crop.setZoom(1.5);
        crop.close(crop.value);
        assert.equal((await pending).zoom, 1.5);
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

// ------------------------------------------------------- upload integration

test('uploading runs the crop step and stores the original bytes with the record', async () => {
    const { dom, window } = await setup();
    try {
        window.eval(read('ui-feedback.js'));
        window.eval(read('backup-manager.js'));
        const writes = [];
        window.BackupManager.media = async (data, slots) => {
            writes.push({ data, slots });
            return {};
        };
        window.URL.createObjectURL = () => 'blob:gif';
        window.URL.revokeObjectURL = () => {};
        const manager = new window.BackupManager();
        const photo = new window.File(['GIF89a-frames'], 'photo.gif', { type: 'image/gif' });
        window.BackupManager.decodeAvatar = async () => ({ naturalWidth: 900, naturalHeight: 600 });
        const opened = [];
        window.avatarCrop = {
            open: async (options) => {
                opened.push(options);
                return { x: 0.2, y: 0.5, zoom: 2, ratio: 1.5 };
            }
        };
        await manager.uploadAvatar(photo);
        assert.equal(opened.length, 1, 'the crop dialog is always part of an upload');
        assert.equal(opened[0].name, 'photo.gif');
        assert.equal(
            writes[0].data.avatar,
            photo,
            'the original file is stored, never a re-encode'
        );
        assert.deepEqual(plain(window.AvatarCrop.read()), { x: 0.2, y: 0.5, zoom: 2, ratio: 1.5 });
        assert.equal(manager.avatarURL, 'blob:gif');

        // Cancelling leaves the previous photo and crop alone.
        const before = window.AvatarCrop.read();
        window.avatarCrop = { open: async () => null };
        await assert.rejects(() => manager.uploadAvatar(photo), /cancelled/);
        assert.deepEqual(plain(window.AvatarCrop.read()), plain(before));
        assert.equal(writes.length, 1);

        // Adjusting only rewrites the record; the stored bytes stay untouched.
        manager.avatarURL = 'blob:gif';
        window.avatarCrop = { open: async () => ({ x: 0.5, y: 0.5, zoom: 3, ratio: 1.5 }) };
        const applied = await manager.adjustAvatar();
        assert.equal(applied.zoom, 3);
        assert.equal(window.AvatarCrop.read().zoom, 3);
        assert.equal(writes.length, 1, 'no second media write for a re-crop');
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('removing the photo also removes the crop, and backups carry the record', async () => {
    const { dom, window } = await setup();
    try {
        window.eval(read('ui-feedback.js'));
        window.eval(read('backup-manager.js'));
        window.BackupManager.media = async () => ({});
        window.URL.createObjectURL = () => 'blob:photo';
        window.URL.revokeObjectURL = () => {};
        const manager = new window.BackupManager();
        window.AvatarCrop.write({ x: 0.2, y: 0.5, zoom: 2, ratio: 1.5 });
        await manager.setAvatar(null);
        assert.equal(window.AvatarCrop.read(), null, 'no stale crop survives removal');
        assert.equal(manager.avatarURL, '');
        assert.ok(
            window.BackupManager.keys.includes('kanji_avatar_crop'),
            'a full backup must restore the crop with the photo'
        );
        assert.equal(
            read('cloud-sync.js').includes('kanji_avatar_crop'),
            false,
            'progress sync carries no media, so it must not carry the crop either'
        );
    } finally {
        // Settle any dialog still open, so a failed assertion reports itself instead
        // of leaving a pending promise behind.
        if (window.avatarCrop?.isOpen) {
            window.avatarCrop.close(null);
        }
        dom.window.close();
    }
});

test('the crop assets are versioned, precached, deployed and wired to both surfaces', () => {
    const html = read('index.html');
    const worker = read('sw.js');
    const deploy = read('.github/workflows/deploy.yml');
    assert.ok(html.includes('avatar-crop.js?v=avatar-v1'));
    assert.ok(worker.includes("'/avatar-crop.js?v=avatar-v1'"));
    assert.match(worker, /kanji-widgets-v22/);
    assert.ok(deploy.includes('cp avatar-crop.js deploy/'));
    const dom = new JSDOM(html);
    try {
        const doc = dom.window.document;
        const ids = [...doc.querySelectorAll('[id]')].map((node) => node.id);
        assert.equal(new Set(ids).size, ids.length, 'duplicate IDs break avatar controls');
        // Only the two avatars that can change the photo carry the see-through cover. The
        // small header icon opens the account popup and must stay free of photo controls.
        for (const id of ['accountAvatarEdit', 'profilePageAvatarEdit']) {
            const control = doc.getElementById(id);
            assert.ok(control, `${id} must offer the photo`);
            assert.ok(control.querySelector('.avatar-edit-cover'), `${id} needs its pencil cover`);
            assert.ok(control.querySelector('[data-avatar-crop]'), `${id} shows the cropped image`);
        }
        assert.equal(
            doc
                .getElementById('accountBtn')
                .querySelector('.avatar-edit-cover, .avatar-edit-badge'),
            null,
            'the header icon is only the popup opener'
        );
        assert.ok(doc.getElementById('profilePageAdjustPhoto'));
        assert.equal(doc.querySelectorAll('[data-avatar-crop]').length, 3);
        assert.equal(
            doc.querySelectorAll('.avatar-frame').length,
            4,
            'three avatars and the crop preview'
        );
        assert.ok(doc.getElementById('avatarCropStage').hasAttribute('tabindex'));
    } finally {
        dom.window.close();
    }
});

function harnessFrom(window, crop, image) {
    return { window, crop, image };
}
