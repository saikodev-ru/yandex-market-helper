// renum.js — Universal MP3 TTS (Unified + Merch Session)
(function () {
    'use strict';
    console.log('🔊 RENUM started');

    const CONFIG = {
        DEBOUNCE_DELAY: 300,
        NUMBER_SPEED: 1.1,
        SUCCESS_SPEED: 1.1,
        VOLUME: 1.0,
        OVERLAP_MS: 550
    };

    // Динамические пути на основе voiceProfile
    // При смене профиля через попап — следующее воспроизведение
    // автоматически использует новые файлы без перезагрузки страницы.
    // Fallback: если файл профиля не найден — используется alice.
    let voiceProfile = 'default';

    function getProfile() {
        return (voiceProfile && voiceProfile !== 'default') ? voiceProfile : 'alice';
    }

    function getMp3Path() {
        return `sounds/${getProfile()}/num/`;
    }
    function getFallbackMp3Path() {
        const profile = getProfile();
        return profile !== 'alice' ? 'sounds/alice/num/' : null;
    }
    function getSuccessSoundPath() {
        return `sounds/${getProfile()}/ordertype/success-ship.mp3`;
    }
    function getFallbackSuccessSoundPath() {
        const profile = getProfile();
        return profile !== 'alice' ? 'sounds/alice/ordertype/success-ship.mp3' : null;
    }

    let observer = null;
    let acceptancePageDetected = false;
    let merchSessionDetected = false;
    let acceptanceLastValue = null;
    let merchLastValue = null;
    let consolidationLastValue = null;

    // ================= AUDIO CONTEXT =================
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // ================= BEEP FUNCTION =================
    function playBeepSound(audioContext) {
        try {
            // три одинаковых быстрых сигнала подряд
                playBeep(audioContext, 0, 550);
                playBeep(audioContext, 0, 100);
                playBeep(audioContext, 0.07, 650);
                playBeep(audioContext, 0.07, 100);

            function playBeep(ctx, startTime, freq) {
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);

                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

                // Очень короткий сигнал с уменьшенной громкостью на 25%
                gainNode.gain.setValueAtTime(0, ctx.currentTime + startTime);
                gainNode.gain.linearRampToValueAtTime(0.125, ctx.currentTime + startTime + 0.02);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + startTime + 0.05);

                oscillator.start(ctx.currentTime + startTime);
                oscillator.stop(ctx.currentTime + startTime + 0.08);
            }
        } catch (error) {
            console.log('Ошибка в playBeepSound:', error);
        }
    }

    function playHighBeep() {
        playBeepSound(audioCtx);
    }

    // ================= AUDIO =================
    async function speakWithMp3(number) {
        if (typeof number !== 'number') return;

        // короткий сигнал перед числом
        playHighBeep();

        // Пробуем сначала профильный файл (например mita), потом alice
        const profileUrl = chrome.runtime.getURL(`${getMp3Path()}${number}.mp3`);
        const fallbackUrl = getFallbackMp3Path()
            ? chrome.runtime.getURL(`${getFallbackMp3Path()}${number}.mp3`)
            : null;

        if (await checkFileExists(profileUrl)) {
            playAudio(profileUrl, fallbackUrl);
            return;
        }

        // Файл не найден — разбираем на компоненты с fallback
        const seq = buildSequence(number);
        playSequence(seq);
    }

    async function checkFileExists(url) {
        try {
            const r = await fetch(url, { method: 'HEAD' });
            return r.ok;
        } catch {
            return false;
        }
    }

    function playAudio(src, fallbackSrc = null, speed = CONFIG.NUMBER_SPEED) {
        try {
            chrome.runtime.sendMessage({
                action: 'mh-play-audio',
                src,
                volume: CONFIG.VOLUME,
                speed,
                fallbackSrc,
                requestId: 'renum_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
            }).catch(() => {
                // Fallback: попробовать локальное воспроизведение
                try {
                    const a = new Audio(fallbackSrc || src);
                    a.volume = CONFIG.VOLUME;
                    a.playbackRate = speed;
                    a.play().catch(() => {
                        // Если fallback тоже не работает — пробуем основной
                        if (fallbackSrc) {
                            try {
                                const a2 = new Audio(src);
                                a2.volume = CONFIG.VOLUME;
                                a2.playbackRate = speed;
                                a2.play().catch(() => {});
                            } catch (e3) {}
                        }
                    });
                } catch (e) {}
            });
        } catch (e) {
            // Fallback: локальное воспроизведение
            try {
                const a = new Audio(fallbackSrc || src);
                a.volume = CONFIG.VOLUME;
                a.playbackRate = speed;
                a.play().catch(() => {});
            } catch (e2) {}
        }
    }

    function playSuccess() {
        const src = chrome.runtime.getURL(getSuccessSoundPath());
        const fallback = getFallbackSuccessSoundPath()
            ? chrome.runtime.getURL(getFallbackSuccessSoundPath())
            : null;
        playAudio(src, fallback, CONFIG.SUCCESS_SPEED);
    }

    function playSequence(seq) {
        seq.forEach(({ src, fallback }, i) => {
            setTimeout(() => playAudio(src, fallback), i * CONFIG.OVERLAP_MS);
        });
    }

    function buildSequence(num) {
        const out = [];
        if (num <= 20) {
            out.push(urlWithFallback(num));
        } else if (num < 100) {
            out.push(urlWithFallback(Math.floor(num / 10) * 10));
            if (num % 10) out.push(urlWithFallback(num % 10));
        } else if (num < 1000) {
            out.push(urlWithFallback(Math.floor(num / 100) * 100));
            if (num % 100) out.push(...buildSequence(num % 100));
        }
        return out;
    }

    const urlWithFallback = n => ({
        src: chrome.runtime.getURL(`${getMp3Path()}${n}.mp3`),
        fallback: getFallbackMp3Path()
            ? chrome.runtime.getURL(`${getFallbackMp3Path()}${n}.mp3`)
            : null
    });

    // ================= HELPERS =================
    function debounce(fn, ms) {
        let t;
        return () => {
            clearTimeout(t);
            t = setTimeout(fn, ms);
        };
    }

    // ================= PAGE DETECTION =================
    function isUnifiedAcceptance() {
        if (!location.href.includes('/unified-acceptance')) return false;
        const btn = document.querySelector('[data-e2e="unified-acceptance-finish-btn"]');
        if (!btn) return false;
        return /Завершить/i.test(btn.textContent || '');
    }

    function isMerchSession() {
        return /acceptance-request\/merch-session/.test(location.href);
    }

    function isConsolidation() {
        return /\/tpl-outlet\/\d{8}\/consolidation/.test(location.href);
    }

    // Читаем число из активного таба (aria-selected="true")
    // Элемент: role="tab" aria-selected="true" > span:last-child (число)
    function getConsolidationValue() {
        const activeTab = document.querySelector(
            '[role="tab"][aria-selected="true"]'
        );
        if (!activeTab) return null;
        const spans = activeTab.querySelectorAll('span');
        if (!spans.length) return null;
        // Последний span содержит счётчик (число)
        const last = spans[spans.length - 1];
        const val = parseInt(last.textContent.trim(), 10);
        return Number.isFinite(val) ? val : null;
    }

    function getUnifiedTarget() {
        const spans = document.querySelectorAll(
            '[data-e2e-i18n-key="pages.tpl-outlet-unified-acceptance:not-accepted.title"]'
        );
        for (const s of spans) {
            const t = s.textContent || '';
            const m = t.match(/В\s+очереди\s+(\d+)/i);
            if (m) return parseInt(m[1], 10);
        }
        return null;
    }

    function getMerchValue() {
        const active = document.querySelector(
            'button[value="ACCEPTED"][aria-checked="true"], button[value="AWAITING"][aria-checked="true"]'
        );
        if (!active) return null;
        const spans = active.querySelectorAll('span');
        if (!spans.length) return null;
        const val = parseInt(spans[spans.length - 1].textContent.trim(), 10);
        return Number.isFinite(val) ? val : null;
    }

    // ================= CORE =================
    const handleChange = debounce(() => {
        acceptancePageDetected = isUnifiedAcceptance();
        merchSessionDetected = isMerchSession();

        if (merchSessionDetected) {
            const n = getMerchValue();
            if (n === null || n === merchLastValue) return;
            merchLastValue = n;
            speakWithMp3(n);
            return;
        }

        if (isConsolidation()) {
            const n = getConsolidationValue();
            if (n === null || n === consolidationLastValue) return;
            consolidationLastValue = n;
            if (n === 0) playSuccess();
            else speakWithMp3(n);
            return;
        }

        if (acceptancePageDetected) {
            const n = getUnifiedTarget();
            if (n === null || n === acceptanceLastValue) return;
            acceptanceLastValue = n;
            if (n === 0) playSuccess();
            else speakWithMp3(n);
        }
    }, CONFIG.DEBOUNCE_DELAY);

    // Читаем voiceProfile из chrome.storage.sync и слушаем изменения
    function initVoiceProfile() {
        try {
            chrome.storage.sync.get(['voiceProfile'], ({ voiceProfile: profile }) => {
                voiceProfile = profile || 'default';
                console.log('🔊 RENUM voiceProfile:', voiceProfile);
            });
            chrome.storage.onChanged.addListener((changes) => {
                if (changes.voiceProfile) {
                    voiceProfile = changes.voiceProfile.newValue || 'default';
                    console.log('🔊 RENUM voiceProfile changed:', voiceProfile);
                }
            });
        } catch (e) {
            console.log('RENUM: ошибка чтения voiceProfile:', e);
        }
    }

    function init() {
        initVoiceProfile();
        observer = new MutationObserver(handleChange);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        setTimeout(handleChange, 1000);
        console.log('✅ RENUM active');
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else init();

    // ================= DEBUG =================
    window.testRenum = n => speakWithMp3(n ?? 42);

})();