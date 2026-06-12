// new-placement.js - RENUM Ultimate (Fixed Duplicates & Column UI)
(function() {
    'use strict';

    const CONFIG = {
        MP3_PATH: 'sounds/num/',
        SUCCESS_SOUND: 'sounds/success-ship.mp3',
        NUMBER_SPEED: 1.2,
        VOLUME: 1.0,
        OVERLAP_MS: 500,
        RETRY_LIMIT: 20,
        RETRY_DELAY: 150
    };

    let lastVoicedNumber = null;
    let currentAudioObjects = [];
    let activeTimers = [];
    let voiceDebounceTimer = null;
    let isAssigning = false;
    let currentInput = "";
    let audioCtx = null;
    let scanBuffer = "";
    let lastKeyTime = Date.now();

    // =========================
    // AUDIO ENGINE
    // =========================
    function getAudioContext() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function clearAllAudio() {
        currentAudioObjects.forEach(a => { try { a.pause(); a.currentTime = 0; } catch(e) {} });
        currentAudioObjects = [];
        activeTimers.forEach(t => clearTimeout(t));
        activeTimers = [];
    }

    function playBeepSequence() {
        const ctx = getAudioContext();
        const playBeep = (startTime, freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
            gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + startTime + 0.02);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startTime + 0.05);
            osc.start(ctx.currentTime + startTime);
            osc.stop(ctx.currentTime + startTime + 0.08);
        };
        playBeep(0, 550); playBeep(0.1, 550);
    }

    function playError8Bit() {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    }

    // =========================
    // OVERLAY FIX
    // =========================
    function hideOverlay() {
        const overlay = document.querySelector('div.mez-bg-themeLayerBgTransparent.mez-fixed.mez-z-600');
        if (overlay) {
            overlay.style.setProperty('display', 'none', 'important');
        }
    }

    // =========================
    // SCAN & DUPLICATE LOGIC
    // =========================
    function checkIsDuplicate(barcode) {
        if (!barcode) return false;
        const cleanBarcode = barcode.replace(/\D/g, '');
        if (cleanBarcode.length < 5) return false;

        const infoSpans = document.querySelectorAll('.mez-flex-col.mez-gap-\\[4px\\] span');
        let found = false;
        infoSpans.forEach(span => {
            const cleanText = span.textContent.replace(/\D/g, '');
            if (cleanText === cleanBarcode) found = true;
        });
        return found;
    }

    // =========================
    // VOICE SYSTEM
    // =========================
    async function speakWithMp3(number) {
        if (isNaN(number)) return;
        clearAllAudio();
        const fullUrl = chrome.runtime.getURL(`${CONFIG.MP3_PATH}${number}.mp3`);
        const getSeq = (n) => {
            const s = [];
            if (n <= 20) s.push(chrome.runtime.getURL(`${CONFIG.MP3_PATH}${n}.mp3`));
            else if (n < 100) {
                const t = Math.floor(n / 10) * 10, o = n % 10;
                s.push(chrome.runtime.getURL(`${CONFIG.MP3_PATH}${t}.mp3`));
                if (o > 0) s.push(chrome.runtime.getURL(`${CONFIG.MP3_PATH}${o}.mp3`));
            } else if (n < 1000) {
                const h = Math.floor(n / 100) * 100, r = n % 100;
                s.push(chrome.runtime.getURL(`${CONFIG.MP3_PATH}${h}.mp3`));
                if (r > 0) s.push(...getSeq(r));
            }
            return s;
        };
        const exists = await fetch(fullUrl, {method:'HEAD'}).then(r => r.ok).catch(()=>false);
        const files = exists ? [fullUrl] : getSeq(number);
        files.forEach((src, i) => {
            const t = setTimeout(() => {
                const a = new Audio(src); a.volume = CONFIG.VOLUME;
                a.playbackRate = CONFIG.NUMBER_SPEED;
                currentAudioObjects.push(a); a.play().catch(()=>{});
            }, i * CONFIG.OVERLAP_MS);
            activeTimers.push(t);
        });
    }

    // =========================
    // OBSERVER & HANDLERS
    // =========================
    function initObserver() {
        const observer = new MutationObserver(() => {
            const fridge = document.querySelector('[aria-label="fridge-content"]');
            if (fridge) {
                hideOverlay();
                const numberSpan = fridge.querySelector('.bg-themeSysSuccess span');
                if (numberSpan) {
                    const text = numberSpan.textContent.trim();
                    if (text && text !== lastVoicedNumber) {
                        lastVoicedNumber = text;
                        clearTimeout(voiceDebounceTimer);
                        voiceDebounceTimer = setTimeout(() => {
                            const n = parseInt(text, 10);
                            if (!isNaN(n)) speakWithMp3(n);
                        }, 50);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    // Глобальный слушатель
    document.addEventListener('keydown', (e) => {
        if (isAssigning) return;

        const now = Date.now();

        if (e.key === 'Enter') {
            if (checkIsDuplicate(scanBuffer)) {
                playError8Bit();
            } else {
                lastVoicedNumber = null;
            }
            scanBuffer = "";
        } else if (e.key.length === 1) {
            if (now - lastKeyTime > 150) scanBuffer = "";
            scanBuffer += e.key;
        }
        lastKeyTime = now;

        if (e.key === "\\") {
            const editBtn = document.querySelector('.bg-themeSysSuccess')?.closest('[role="button"]') ||
                            document.querySelector('svg[aria-label="icon-edit"]')?.closest('[role="button"]');

            if (editBtn) {
                e.preventDefault();
                e.stopPropagation();

                isAssigning = true;
                currentInput = "";
                playBeepSequence();
                editBtn.click();

                const handleCellInput = (ke) => {
                    ke.preventDefault();
                    ke.stopPropagation();
                    ke.stopImmediatePropagation();

                    if (ke.key === 'Escape' || ke.key === 'Enter') {
                        finish();
                        return;
                    }

                    if (ke.key >= '0' && ke.key <= '9') {
                        currentInput += ke.key;
                        if (currentInput.length === 3) {
                            const val = currentInput;
                            setTimeout(() => {
                                const target = Array.from(document.querySelectorAll('div[role="button"], button'))
                                               .find(c => c.textContent.trim() === val);
                                if (target) {
                                    target.scrollIntoView({block:'center'});
                                    target.click();
                                }
                            }, 350);
                            finish();
                        }
                    }
                };

                const finish = () => {
                    document.removeEventListener('keydown', handleCellInput, true);
                    isAssigning = false;
                    currentInput = "";
                };

                document.addEventListener('keydown', handleCellInput, true);
            }
        }
    }, false);

    // =========================
    // BLOCKED SOUND INTERCEPT
    // =========================
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'playBlockedNumber') {
            speakWithMp3(msg.number);
        }
    });

    initObserver();
})();