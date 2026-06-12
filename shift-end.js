// shift-end.js — Flip-clock анимация окончания смены
(function() {
    'use strict';

    let active = false;
    const FONT = "'SF Mono','Cascadia Code','Fira Code','Consolas','Menlo','Courier New',monospace";

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'showShiftEndAnimation' && !active) {
            showAnimation(msg.time || '21:00');
        }
    });

    function prevMinute(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date(); d.setHours(h, m, 0, 0);
        d.setMinutes(d.getMinutes() - 1);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function showAnimation(targetTime) {
        active = true;

        const prev = prevMinute(targetTime);
        const pChars = prev.split('');
        const tChars = targetTime.split('');

        // ── Оверлей ──
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', zIndex: '2147483647',
            background: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: '0', transition: 'opacity 0.9s ease',
            cursor: 'pointer',
        });
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.style.opacity = '1');

        // ── Контейнер цифр ──
        const clock = document.createElement('div');
        Object.assign(clock.style, {
            display: 'flex', alignItems: 'center',
            fontSize: 'clamp(72px, 16vw, 170px)',
            fontWeight: '800', color: '#fff',
            fontFamily: FONT, lineHeight: '1',
            letterSpacing: '0.01em',
            textShadow: '0 0 30px rgba(255,255,255,0.25)',
            transition: 'text-shadow 1.2s ease',
        });
        overlay.appendChild(clock);

        // ── Создаём слоты для каждой позиции ──
        const digitSlots = [];

        for (let i = 0; i < 5; i++) {
            if (tChars[i] === ':') {
                const colon = document.createElement('div');
                colon.textContent = ':';
                Object.assign(colon.style, {
                    width: '0.35em', textAlign: 'center',
                    lineHeight: '1.15', opacity: '0.5',
                });
                clock.appendChild(colon);
                continue;
            }

            const changed = pChars[i] !== tChars[i];
            const slot = document.createElement('div');
            Object.assign(slot.style, {
                position: 'relative',
                width: '0.62em', height: '1.15em',
                overflow: 'hidden', borderRadius: '6px',
                background: changed ? 'rgba(255,255,255,0.03)' : 'transparent',
            });

            const track = document.createElement('div');
            Object.assign(track.style, {
                display: 'flex', flexDirection: 'column',
                willChange: 'transform',
                transition: changed
                    ? 'transform 0.9s cubic-bezier(0.23, 1, 0.32, 1)'
                    : 'none',
            });

            const spanOld = document.createElement('span');
            Object.assign(spanOld.style, {
                display: 'block', height: '1.15em',
                lineHeight: '1.15em', textAlign: 'center',
                userSelect: 'none',
            });
            spanOld.textContent = pChars[i];

            const spanNew = document.createElement('span');
            Object.assign(spanNew.style, {
                display: 'block', height: '1.15em',
                lineHeight: '1.15em', textAlign: 'center',
                userSelect: 'none',
            });
            spanNew.textContent = tChars[i];

            track.appendChild(spanOld);
            track.appendChild(spanNew);
            slot.appendChild(track);
            clock.appendChild(slot);

            if (changed) digitSlots.push(track);
        }

        // ── Таймлайн ──
        // 0ms     — fade in black
        // 1200ms  — flip changed digits + play sound
        // 2200ms  — glow intensifies
        // 5000ms  — fade out
        // 6200ms  — remove

        setTimeout(() => {
            digitSlots.forEach(t => t.style.transform = 'translateY(-50%)');
            const audio = new Audio(chrome.runtime.getURL('sounds/6am.mp3'));
            audio.volume = 1.0;
            audio.play().catch(() => {});
        }, 1200);

        setTimeout(() => {
            clock.style.textShadow =
                '0 0 50px rgba(255,255,255,0.45), 0 0 100px rgba(255,255,255,0.2), 0 0 160px rgba(255,255,255,0.08)';
        }, 2200);

        setTimeout(() => {
            overlay.style.transition = 'opacity 1.2s ease';
            overlay.style.opacity = '0';
        }, 5000);

        let dismissed = false;
        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            overlay.style.transition = 'opacity 0.5s ease';
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.remove(); active = false; }, 500);
            overlay.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', dismiss);
        }
        setTimeout(() => { if (!dismissed) { overlay.remove(); active = false; } }, 6200);
        overlay.addEventListener('click', dismiss);
        document.addEventListener('keydown', dismiss);
    }
})();