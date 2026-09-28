// Square cropping for the profile photo.
//
// The crop is stored as metadata (a zoom factor plus the centre of the visible
// window) and applied with CSS, never by re-encoding the image. That keeps
// animated GIFs animating, keeps the original bytes in the backup, and makes the
// result identical in every size the avatar is drawn at.
//
// Crop record: { x, y, zoom, ratio }
//   x, y   0..1, the point of the photo shown at the centre of the square
//   zoom   1..MAX_ZOOM
//   ratio  natural width / height, needed to clamp panning without the image loaded
class AvatarCrop {
    static KEY = 'kanji_avatar_crop';
    static FIELD = '[data-avatar-crop]';
    static MIN_ZOOM = 1;
    static MAX_ZOOM = 3;
    static WHEEL_STEP = 1.08;
    static KEY_STEP = 0.02;
    static FRAME_FALLBACK = 240;
    static DEFAULTS = Object.freeze({ x: 0.5, y: 0.5, zoom: 1, ratio: 1 });

    static clamp(value, min, max) {
        if (!Number.isFinite(value)) {
            return min;
        }
        return Math.min(Math.max(value, min), max);
    }

    static round(value) {
        const rounded = Math.round(value * 10000) / 10000;
        return rounded === 0 ? 0 : rounded;
    }

    static ratioOf(width, height) {
        const w = Number(width);
        const h = Number(height);
        return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : 1;
    }

    // How much of the photo is covered by the square frame, in frame units.
    // A wide photo covers width-first (w > 1, h = 1) and a tall photo the reverse.
    static bounds(crop) {
        const zoom = AvatarCrop.clamp(
            Number(crop?.zoom) || 1,
            AvatarCrop.MIN_ZOOM,
            AvatarCrop.MAX_ZOOM
        );
        const ratio = Number(crop?.ratio) > 0 ? Number(crop.ratio) : 1;
        const w = ratio > 1 ? ratio : 1;
        const h = ratio > 1 ? 1 : 1 / ratio;
        const halfW = 1 / (2 * zoom * w);
        const halfH = 1 / (2 * zoom * h);
        return {
            zoom,
            ratio,
            w,
            h,
            halfW,
            halfH,
            minX: halfW,
            maxX: 1 - halfW,
            minY: halfH,
            maxY: 1 - halfH
        };
    }

    static normalize(value) {
        const crop = AvatarCrop.bounds({
            zoom: value?.zoom,
            ratio: value?.ratio
        });
        const x = Number.isFinite(Number(value?.x)) ? Number(value.x) : 0.5;
        const y = Number.isFinite(Number(value?.y)) ? Number(value.y) : 0.5;
        return {
            x: AvatarCrop.round(AvatarCrop.clamp(x, crop.minX, crop.maxX)),
            y: AvatarCrop.round(AvatarCrop.clamp(y, crop.minY, crop.maxY)),
            zoom: AvatarCrop.round(crop.zoom),
            ratio: AvatarCrop.round(crop.ratio)
        };
    }

    // CSS custom properties that place the photo. Percentages are relative to the
    // frame, so the same values work at 44px in the header and 96px on the profile.
    static transform(value) {
        const crop = AvatarCrop.normalize(value);
        const bounds = AvatarCrop.bounds(crop);
        return {
            zoom: crop.zoom,
            tx: AvatarCrop.round(-crop.zoom * (crop.x - 0.5) * bounds.w * 100),
            ty: AvatarCrop.round(-crop.zoom * (crop.y - 0.5) * bounds.h * 100)
        };
    }

    static read() {
        try {
            const value = JSON.parse(localStorage.getItem(AvatarCrop.KEY) || 'null');
            return value && typeof value === 'object' && !Array.isArray(value)
                ? AvatarCrop.normalize(value)
                : null;
        } catch {
            return null;
        }
    }

    static write(value) {
        const crop = AvatarCrop.normalize(value);
        try {
            localStorage.setItem(AvatarCrop.KEY, JSON.stringify(crop));
        } catch {
            throw new Error(
                'The photo was saved, but the crop could not be stored. Browser storage may be full.'
            );
        }
        return crop;
    }

    static clear() {
        try {
            localStorage.removeItem(AvatarCrop.KEY);
        } catch {
            /* A missing crop is the same as an empty crop. */
        }
    }

    // Applies the crop to every avatar image in the document. Passing no crop
    // clears the properties, which is what a Google or default photo needs.
    static apply(root = document, crop = AvatarCrop.read()) {
        const nodes = root?.querySelectorAll ? root.querySelectorAll(AvatarCrop.FIELD) : [];
        for (const node of nodes) {
            if (!crop) {
                node.style.removeProperty('--avatar-zoom');
                node.style.removeProperty('--avatar-tx');
                node.style.removeProperty('--avatar-ty');
                node.style.removeProperty('--avatar-ratio');
                continue;
            }
            const value = AvatarCrop.transform(crop);
            node.style.setProperty('--avatar-zoom', String(value.zoom));
            node.style.setProperty('--avatar-tx', `${value.tx}%`);
            node.style.setProperty('--avatar-ty', `${value.ty}%`);
            node.style.setProperty('--avatar-ratio', String(AvatarCrop.normalize(crop).ratio));
        }
        return nodes.length;
    }

    // Screen pixels to normalized photo units, for one axis.
    static span(bounds, axis) {
        return axis === 'x' ? 1 / bounds.zoom / bounds.w : 1 / bounds.zoom / bounds.h;
    }

    static describe(value) {
        const crop = AvatarCrop.normalize(value);
        const words = (position, low, high) =>
            position < low ? 'start' : position > high ? 'end' : 'middle';
        return `Zoom ${Math.round(crop.zoom * 100)}%, showing the ${words(crop.x, crop.ratio > 1 ? 0.42 : 0.49, crop.ratio > 1 ? 0.58 : 0.51)} horizontally and the ${words(crop.y, crop.ratio > 1 ? 0.49 : 0.42, crop.ratio > 1 ? 0.51 : 0.58)} vertically.`.replace(
            /the start horizontally/,
            'left side'
        );
    }

    constructor(deps = {}) {
        this.storage = deps.storage || AvatarCrop;
        this.root = deps.root || document;
        this.value = { ...AvatarCrop.DEFAULTS };
        this.url = '';
        this.frame = AvatarCrop.FRAME_FALLBACK;
        this.pointers = new Map();
        this.lastDistance = 0;
        this.resolve = null;
        this.ready = false;
    }

    el(id) {
        return this.root.getElementById ? this.root.getElementById(id) : null;
    }

    get dialog() {
        return this.el('avatarCropDialog');
    }

    get isOpen() {
        return Boolean(this.dialog?.open);
    }

    init() {
        const dialog = this.dialog;
        if (!dialog) {
            return;
        }
        for (const id of ['avatarCropClose', 'avatarCropCancel']) {
            this.el(id)?.addEventListener('click', () => this.close(null));
        }
        this.el('avatarCropSave')?.addEventListener('click', () => this.close(this.value));
        this.el('avatarCropReset')?.addEventListener('click', () => this.reset());
        this.el('avatarCropZoomIn')?.addEventListener('click', () => this.zoomBy(1.15));
        this.el('avatarCropZoomOut')?.addEventListener('click', () => this.zoomBy(1 / 1.15));
        this.el('avatarCropZoom')?.addEventListener('input', (event) =>
            this.setZoom(Number(event.target.value), { x: 0, y: 0 })
        );
        dialog.addEventListener('cancel', (event) => {
            // Only this dialog's own Escape cancel may dismiss the crop: an input's
            // bubbling "cancel" event must never close it.
            if (event.target !== dialog) {
                return;
            }
            event.preventDefault();
            this.close(null);
        });
        dialog.addEventListener('close', () => {
            if (this.resolve) {
                const done = this.resolve;
                this.resolve = null;
                done(null);
            }
            if (this.url) {
                URL.revokeObjectURL(this.url);
                this.url = '';
            }
        });
        const stage = this.el('avatarCropStage');
        if (stage) {
            stage.addEventListener('pointerdown', (event) => this.onPointerDown(event));
            stage.addEventListener('pointermove', (event) => this.onPointerMove(event));
            stage.addEventListener('pointerup', (event) => this.onPointerUp(event));
            stage.addEventListener('pointercancel', (event) => this.onPointerUp(event));
            stage.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
            stage.addEventListener('keydown', (event) => this.onKeydown(event));
        }
    }

    open({ src, crop = null, name = 'Profile photo' } = {}) {
        const dialog = this.dialog;
        this.value = AvatarCrop.normalize({ ...AvatarCrop.DEFAULTS, ...(crop || {}) });
        this.ready = false;
        if (!dialog || !src) {
            // Without a dialog (tests, or a browser without <dialog>) keep the
            // previous crop rather than blocking the upload.
            return Promise.resolve(crop ? this.value : null);
        }
        const image = this.el('avatarCropImage');
        const title = this.el('avatarCropTitle');
        if (title) {
            title.textContent = 'Adjust your photo';
        }
        const caption = this.el('avatarCropCaption');
        if (caption) {
            caption.textContent = name;
        }
        const note = this.el('avatarCropStatus');
        if (note) {
            note.textContent = 'Drag to move the square. Use the slider or pinch to zoom.';
        }
        for (const id of ['avatarCropImage', 'avatarCropSource']) {
            const node = this.el(id);
            if (node) {
                node.src = src;
            }
        }
        this.url = '';
        image.onload = () => {
            this.frame = this.el('avatarCropStage')?.clientWidth || AvatarCrop.FRAME_FALLBACK;
            const ratio = AvatarCrop.ratioOf(image.naturalWidth, image.naturalHeight);
            const given = crop?.ratio;
            // Trust the decoded image, but keep a stored ratio when decoding gives none.
            this.value = AvatarCrop.normalize({
                ...this.value,
                ratio: ratio === 1 && given ? given : ratio
            });
            this.ready = true;
            this.render();
        };
        image.onerror = () => {
            this.ready = false;
            this.render();
            if (note) {
                note.textContent =
                    'This image could not be displayed in your browser. Try PNG, JPEG, WebP or GIF.';
            }
        };
        if (!dialog.open) {
            dialog.showModal();
        }
        this.previousFocus = document.activeElement;
        this.el('avatarCropStage')?.focus?.();
        this.render();
        return new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    close(result) {
        const dialog = this.dialog;
        const done = this.resolve;
        this.resolve = null;
        if (dialog?.open) {
            dialog.close();
        }
        if (!this.resolve && this.url) {
            URL.revokeObjectURL(this.url);
            this.url = '';
        }
        if (this.previousFocus?.focus) {
            try {
                this.previousFocus.focus();
            } catch {
                /* focus restoration is best effort */
            }
        }
        if (done) {
            done(result ? AvatarCrop.normalize(result) : null);
        }
    }

    reset() {
        this.value = AvatarCrop.normalize({
            ...AvatarCrop.DEFAULTS,
            ratio: this.value.ratio
        });
        this.render();
    }

    setZoom(zoom, anchor = { x: 0, y: 0 }) {
        const next = AvatarCrop.clamp(zoom, AvatarCrop.MIN_ZOOM, AvatarCrop.MAX_ZOOM);
        const before = AvatarCrop.bounds(this.value);
        const spanX = AvatarCrop.span(before, 'x');
        const spanY = AvatarCrop.span(before, 'y');
        const frame = this.frame || AvatarCrop.FRAME_FALLBACK;
        // Keep whatever sits under the pointer or cursor in place while zooming.
        const pointX = this.value.x + (anchor.x / frame) * spanX;
        const pointY = this.value.y + (anchor.y / frame) * spanY;
        const after = AvatarCrop.bounds({ ...this.value, zoom: next });
        this.value = AvatarCrop.normalize({
            ...this.value,
            zoom: next,
            x: pointX - (anchor.x / frame) * AvatarCrop.span(after, 'x'),
            y: pointY - (anchor.y / frame) * AvatarCrop.span(after, 'y')
        });
        this.render();
    }

    zoomBy(factor, anchor = { x: 0, y: 0 }) {
        this.setZoom(this.value.zoom * factor, anchor);
    }

    pan(dx, dy) {
        const bounds = AvatarCrop.bounds(this.value);
        const frame = this.frame || AvatarCrop.FRAME_FALLBACK;
        // Dragging right reveals what is left of the photo.
        const stepX = (dx / frame) * AvatarCrop.span(bounds, 'x');
        const stepY = (dy / frame) * AvatarCrop.span(bounds, 'y');
        this.value = AvatarCrop.normalize({
            ...this.value,
            x: this.value.x - stepX,
            y: this.value.y - stepY
        });
        this.render();
    }

    onPointerDown(event) {
        if (!this.ready) {
            return;
        }
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.el('avatarCropStage')?.setPointerCapture?.(event.pointerId);
        this.el('avatarCropStage')?.classList.add('is-dragging');
        this.lastDistance = 0;
    }

    onPointerMove(event) {
        if (!this.pointers.has(event.pointerId) || !this.ready) {
            return;
        }
        const previous = this.pointers.get(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 1) {
            this.pan(event.clientX - previous.x, event.clientY - previous.y);
            return;
        }
        const [first, second] = [...this.pointers.values()];
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        if (this.lastDistance) {
            const stage = this.el('avatarCropStage');
            const box = stage?.getBoundingClientRect?.() || { left: 0, top: 0, width: this.frame };
            const middle = {
                x: (first.x + second.x) / 2 - box.left - box.width / 2,
                y: (first.y + second.y) / 2 - box.top - box.width / 2
            };
            this.zoomBy(distance / this.lastDistance, middle);
        }
        this.lastDistance = distance;
    }

    onPointerUp(event) {
        this.pointers.delete(event.pointerId);
        this.lastDistance = 0;
        if (!this.pointers.size) {
            this.el('avatarCropStage')?.classList.remove('is-dragging');
        }
    }

    onWheel(event) {
        if (!this.ready) {
            return;
        }
        event.preventDefault();
        const stage = this.el('avatarCropStage');
        const box = stage?.getBoundingClientRect?.() || { left: 0, top: 0, width: this.frame };
        this.zoomBy(event.deltaY > 0 ? 1 / AvatarCrop.WHEEL_STEP : AvatarCrop.WHEEL_STEP, {
            x: event.clientX - box.left - box.width / 2,
            y: event.clientY - box.top - box.width / 2
        });
    }

    onKeydown(event) {
        const step = AvatarCrop.KEY_STEP;
        const frame = this.frame || AvatarCrop.FRAME_FALLBACK;
        const actions = {
            ArrowLeft: () => this.pan(step * frame, 0),
            ArrowRight: () => this.pan(-step * frame, 0),
            ArrowUp: () => this.pan(0, step * frame),
            ArrowDown: () => this.pan(0, -step * frame),
            '+': () => this.zoomBy(1.15),
            '=': () => this.zoomBy(1.15),
            '-': () => this.zoomBy(1 / 1.15),
            _: () => this.zoomBy(1 / 1.15),
            r: () => this.reset()
        };
        const action = actions[event.key];
        if (!action || !this.ready) {
            return;
        }
        event.preventDefault();
        action();
    }

    render() {
        if (!this.dialog) {
            return;
        }
        const image = this.el('avatarCropImage');
        if (image) {
            image.style.setProperty('--avatar-zoom', String(this.value.zoom));
            const transform = AvatarCrop.transform(this.value);
            image.style.setProperty('--avatar-tx', `${transform.tx}%`);
            image.style.setProperty('--avatar-ty', `${transform.ty}%`);
        }
        const slider = this.el('avatarCropZoom');
        if (slider) {
            slider.min = String(AvatarCrop.MIN_ZOOM);
            slider.max = String(AvatarCrop.MAX_ZOOM);
            slider.value = String(this.value.zoom);
            slider.disabled = !this.ready;
        }
        for (const id of ['avatarCropZoomIn', 'avatarCropZoomOut', 'avatarCropReset']) {
            const button = this.el(id);
            if (button) {
                button.disabled = !this.ready;
            }
        }
        const save = this.el('avatarCropSave');
        if (save) {
            save.disabled = !this.ready;
        }
        const status = this.el('avatarCropStatus');
        if (status && this.ready) {
            status.textContent = AvatarCrop.describe(this.value);
        }
        const frame = this.el('avatarCropFrame');
        if (frame) {
            frame.dataset.zoomed = this.value.zoom > AvatarCrop.MIN_ZOOM ? 'true' : 'false';
        }
    }
}
window.AvatarCrop = AvatarCrop;
window.addEventListener('DOMContentLoaded', () => {
    window.avatarCrop = new AvatarCrop();
    window.avatarCrop.init();
});
