// shift-end.js — FNAF-стиль анимация окончания смены
(function() {
    'use strict';

    let active = false;

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'showShiftEndAnimation' && !active) {
            showAnimation(msg.time || '21:00');
        }
    });

    function showAnimation(timeStr) {
        active = true;

        // ── Структура оверлея ──
        const overlay = document.createElement('div');
        overlay.id = 'mh-fnaf';
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', zIndex: '2147483647',
            background: '#000', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column',
            opacity: '0', transition: 'opacity 0.8s ease',
            cursor: 'pointer', overflow: 'hidden',
        });
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.style.opacity = '1');

        // ── Canvas для статического шума ──
        const canvas = document.createElement('canvas');
        Object.assign(canvas.style, {
            position: 'absolute', inset: '-50%', width: '200%', height: '200%',
            opacity: '0', transition: 'opacity 0.15s',
            pointerEvents: 'none', imageRendering: 'pixelated',
        });
        overlay.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        let staticInterval = null;

        function drawStatic() {
            canvas.width = 320;
            canvas.height = 180;
            const img = ctx.createImageData(320, 180);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.random() * 255 | 0;
                img.data[i] = img.data[i+1] = img.data[i+2] = v;
                img.data[i+3] = 255;
            }
            ctx.putImageData(img, 0, 0);
        }

        // ── Scanlines ──
        const scanlines = document.createElement('div');
        Object.assign(scanlines.style, {
            position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0',
            transition: 'opacity 0.3s',
            background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 3px)',
        });
        overlay.appendChild(scanlines);

        // ── Время ──
        const timeEl = document.createElement('div');
        Object.assign(timeEl.style, {
            fontSize: 'clamp(80px, 15vw, 160px)', fontWeight: '800',
            fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif',
            color: '#fff', letterSpacing: '0.04em',
            textShadow: '0 0 40px rgba(255,255,255,0.4), 0 0 80px rgba(255,255,255,0.2), 0 0 120px rgba(255,255,255,0.1)',
            fontVariantNumeric: 'tabular-nums',
            opacity: '0', transform: 'scale(0.85)',
            transition: 'opacity 0.8s ease, transform 0.8s cubic-bezier(.22,1,.36,1), text-shadow 0.5s',
            zIndex: '2', position: 'relative',
        });
        timeEl.textContent = timeStr;
        overlay.appendChild(timeEl);

        // ── Подзаголовок ──
        const subEl = document.createElement('div');
        Object.assign(subEl.style, {
            fontSize: 'clamp(16px, 3vw, 28px)', fontWeight: '600',
            fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif',
            color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em',
            textTransform: 'uppercase', marginTop: '12px',
            opacity: '0', transform: 'translateY(10px)',
            transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
            zIndex: '2', position: 'relative',
        });
        subEl.textContent = 'СМЕНА ОКОНЧЕНА';
        overlay.appendChild(subEl);

        // ── Таймлайн ──
        // 0ms      — fade in black
        // 800ms    — start static noise + scanlines
        // 1600ms   — stop static, reveal time + subtitle, play chime
        // 2500ms   — create stars
        // 4500ms   — start fade out
        // 5500ms   — remove everything

        // Phase 2: Static (800ms)
        setTimeout(() => {
            canvas.style.opacity = '0.18';
            scanlines.style.opacity = '1';
            staticInterval = setInterval(drawStatic, 60);
            drawStatic();

            // Flicker effect
            let flicks = 0;
            const flicker = setInterval(() => {
                overlay.style.opacity = (Math.random() * 0.3 + 0.7).toString();
                if (++flicks > 12) {
                    clearInterval(flicker);
                    overlay.style.opacity = '1';
                }
            }, 50);
        }, 800);

        // Phase 3: Reveal (1600ms)
        setTimeout(() => {
            // Stop static
            clearInterval(staticInterval);
            canvas.style.opacity = '0';
            scanlines.style.opacity = '0';

            // Show time
            timeEl.style.opacity = '1';
            timeEl.style.transform = 'scale(1)';
            subEl.style.opacity = '1';
            subEl.style.transform = 'translateY(0)';

            // Glow pulse
            setTimeout(() => {
                timeEl.style.textShadow = '0 0 60px rgba(255,255,255,0.6), 0 0 120px rgba(255,255,255,0.35), 0 0 200px rgba(255,255,255,0.15)';
            }, 800);

            // Play chime
            playChime();
        }, 1600);

        // Phase 4: Stars (2500ms)
        setTimeout(() => createStars(overlay), 2500);

        // Phase 5: Fade out (5000ms)
        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 1.2s ease';
        }, 5000);

        // Cleanup (6200ms)
        setTimeout(() => {
            overlay.remove();
            active = false;
        }, 6200);

        // Click/key to dismiss
        function dismiss() {
            clearTimeout(dismissTimer);
            overlay.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', dismiss);
        }
        const dismissTimer = setTimeout(dismiss, 6200);
        overlay.addEventListener('click', dismiss);
        document.addEventListener('keydown', dismiss);
    }

    // ── Звёзды ──
    function createStars(container) {
        const count = 30;
        for (let i = 0; i < count; i++) {
            const star = document.createElement('div');
            const size = Math.random() * 3 + 1;
            const x = Math.random() * 100;
            const y = Math.random() * 100;
            const dur = Math.random() * 2 + 1.5;
            const delay = Math.random() * 1.5;
            const drift = (Math.random() - 0.5) * 80;

            Object.assign(star.style, {
                position: 'absolute',
                left: x + '%', top: y + '%',
                width: size + 'px', height: size + 'px',
                borderRadius: '50%',
                background: `rgba(255,255,255,${Math.random() * 0.5 + 0.5})`,
                boxShadow: `0 0 ${size * 2}px rgba(255,255,255,0.4)`,
                opacity: '0',
                zIndex: '1',
                pointerEvents: 'none',
                animation: `mhStar ${dur}s ${delay}s ease-out forwards, mhTwinkle ${dur * 0.6}s ${delay}s ease-in-out infinite alternate`,
                transform: `translateX(${drift}px)`,
            });
            container.appendChild(star);
        }

        // Inject keyframes once
        if (!document.getElementById('mh-fnaf-styles')) {
            const style = document.createElement('style');
            style.id = 'mh-fnaf-styles';
            style.textContent = `
                @keyframes mhStar {
                    0% { opacity: 0; transform: translateY(0) scale(0); }
                    30% { opacity: 1; transform: translateY(-20px) scale(1); }
                    100% { opacity: 0; transform: translateY(-80px) scale(0.3); }
                }
                @keyframes mhTwinkle {
                    0% { opacity: 0.3; }
                    100% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ── Колокольчик FNAF (C5 → E5 → G5 → C6) ──
    function playChime() {
        try {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99, 1046.50];
            const startTime = ac.currentTime + 0.1;

            notes.forEach((freq, i) => {
                const t = startTime + i * 0.28;

                // Основной тон
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain);
                gain.connect(ac.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.25, t + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                osc.start(t);
                osc.stop(t + 0.9);

                // Обертон для «колокольчика»
                const osc2 = ac.createOscillator();
                const gain2 = ac.createGain();
                osc2.connect(gain2);
                gain2.connect(ac.destination);
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(freq * 3, t);
                gain2.gain.setValueAtTime(0, t);
                gain2.gain.linearRampToValueAtTime(0.06, t + 0.02);
                gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                osc2.start(t);
                osc2.stop(t + 0.4);
            });

            // Автоматически закрываем AudioContext
            setTimeout(() => ac.close().catch(() => {}), 3000);
        } catch(e) {}
    }
})();