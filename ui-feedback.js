// Persistent, accessible notices. Place inside an open dialog so its top layer cannot hide them.
window.KanjiFeedback = {
    show(
        message,
        {
            kind = 'error',
            title = kind === 'error' ? 'Please check this' : 'Cloud check complete'
        } = {}
    ) {
        const previousFocus = document.activeElement;
        document.querySelectorAll('.attention-notice').forEach((notice) => notice.remove());
        const notice = document.createElement('section');
        notice.className = `attention-notice attention-notice--${kind}`;
        notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        notice.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
        notice.setAttribute('aria-atomic', 'true');
        const icon = document.createElement('span');
        icon.className = 'attention-icon';
        icon.textContent = kind === 'error' ? '!' : '✓';
        icon.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = title;
        const text = document.createElement('p');
        text.textContent = message;
        copy.append(heading, text);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'attention-close';
        close.setAttribute('aria-label', 'Dismiss notification');
        close.textContent = '×';
        close.onclick = () => {
            const restoreFocus = notice.contains(document.activeElement);
            notice.remove();
            if (restoreFocus && previousFocus?.isConnected) {
                previousFocus.focus();
            }
        };
        notice.append(icon, copy, close);
        (document.querySelector('dialog[open]') || document.body).append(notice);
        // No timeout: errors and check results remain available until dismissed or replaced.
        return notice;
    }
};
