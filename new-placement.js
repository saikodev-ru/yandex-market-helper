// new-placement.js - RENUM Ultimate (Fixed Duplicates & Column UI)
(function() {
    'use strict';

    const CONFIG = {
        MP3_PATH: 'sounds/alice/num/',
        SUCCESS_SOUND: 'sounds/alice/ordertype/success-ship.mp3',
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
		playBeep(0, 100); playBeep(0.1, 100);
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
    // UI TRANSFORMATION
    // =========================
    function enhanceFridgeUI() {
        // Установка ширины боковой панели (fridge-content)
        const fridgeContainer = document.querySelector('[aria-label="fridge-content"]');
        if (fridgeContainer) {
            // Измените '800px' на нужное вам значение
            fridgeContainer.style.setProperty('width', '800px', 'important');
            fridgeContainer.style.setProperty('max-width', '95vw', 'important');
        }

        const boxImg = document.querySelector('img[src*="3dBoxXl"]');
        if (boxImg) {
            const imgWrapper = boxImg.closest('.mez-inline-flex');
            if (imgWrapper) imgWrapper.style.setProperty('display', 'none', 'important');
        }

        const mainRow = document.querySelector('.bg-themeSysSuccess')?.closest('.mez-flex-row');
        if (mainRow) {
            mainRow.style.setProperty('display', 'flex', 'important');
            mainRow.style.setProperty('flex-direction', 'column', 'important');
            mainRow.style.setProperty('gap', '20px', 'important');
            mainRow.style.setProperty('width', '100%', 'important');
        }

        const successBlock = document.querySelector('.bg-themeSysSuccess');
        if (successBlock) {
            successBlock.style.setProperty('order', '-1', 'important');
            successBlock.style.setProperty('background-color', '#0052CC', 'important');
            successBlock.style.setProperty('width', '100%', 'important');
            successBlock.style.setProperty('border-radius', '24px', 'important');
            successBlock.style.setProperty('padding', '35px 10px', 'important');
            const numSpan = successBlock.querySelector('span');
            if (numSpan) {
                numSpan.style.setProperty('font-size', '140px', 'important');
                numSpan.style.setProperty('line-height', '0.8', 'important');
            }
        }

        const textWrapper = document.querySelector('.mez-flex-col.mez-gap-\\[8px\\].flex-1');
        if (textWrapper) {
            textWrapper.style.setProperty('width', '100%', 'important');
            textWrapper.style.setProperty('order', '1', 'important');
            const infoItems = textWrapper.querySelectorAll('.mez-flex-col.mez-gap-\\[4px\\]');
            infoItems.forEach(item => {
                const label = item.querySelector('.mez-text-themeTextSecondary');
                const val = item.querySelector('.mez-text-m-body2:not(.mez-text-themeTextSecondary)');
                if (label && val) {
                    if (label.textContent.includes('Заказ')) {
                        val.style.setProperty('font-size', '52px', 'important');
                        val.style.setProperty('font-weight', '800', 'important');
                    } else if (label.textContent.includes('Грузоместо')) {
                        val.style.setProperty('font-size', '26px', 'important');
                        val.style.setProperty('opacity', '0.7', 'important');
                    }
                }
            });
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
                enhanceFridgeUI();
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

    initObserver();
})();

(function() {
    'use strict';

    const hubMatch = window.location.pathname.match(/\/tpl-outlet\/(\d+)\//);
    if (!hubMatch) return;
    const hubId = hubMatch[1];
    
    let isCreating = false;

    const getUrl = (p = 1) => `https://hubs.market.yandex.ru/tpl-outlet/${hubId}/placement?number=${p}&platformType=tpl-outlet`;

    function cleanIframe(frame, loader) {
        try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            if (!doc || doc.location.href === 'about:blank') return;

            const tableDiv = doc.querySelector('div[tabindex="0"].mez-overflow-auto');
            
            if (tableDiv) {
                loader.style.display = 'none';
                frame.style.opacity = '1';

                const styleId = 'custom-cleaner-style';
                if (!doc.getElementById(styleId)) {
                    const style = doc.createElement('style');
                    style.id = styleId;
                    style.textContent = `
                        html, body { background: #111 !important; margin: 0; padding: 0; overflow: hidden !important; cursor: default !important; }
                        div[tabindex="0"].mez-overflow-auto {
                            position: fixed !important;
                            top: 0 !important; left: 0 !important;
                            width: 100vw !important; height: 100vh !important;
                            z-index: 999999 !important;
                            background: #111 !important;
                        }
                        header, nav, aside, [class*="Header"], [class*="Sidebar"], [class*="Footer"], button, a { 
                            display: none !important; 
                        }
                        table { background: #111 !important; width: 100% !important; pointer-events: none !important; }
                        td, th { border-color: #333 !important; color: #ccc !important; font-size: 13px !important; }
                    `;
                    doc.head.appendChild(style);
                }
            }
        } catch (e) {}
    }

    function injectUI() {
        if (document.getElementById('custom-placement-block') || isCreating) return;
        isCreating = true;

        const target = Array.from(document.querySelectorAll('span')).find(el => 
            el.getAttribute('data-i18n-key')?.includes('labels.order.barcode') || el.textContent.trim() === 'Заказ'
        );
        const parent = target?.closest('.mez-flex-col')?.parentElement;
        
        if (!parent) {
            isCreating = false;
            return;
        }

        const block = document.createElement('div');
        block.id = 'custom-placement-block';
        block.style.cssText = 'margin-top: 15px; background: #111; border-radius: 12px; border: 1px solid #333; order: 9999 !important; width: 100%; height: 450px; position: relative; overflow: hidden;';

        block.innerHTML = `
            <div id="page-nav-btns" style="position: absolute; top: 8px; right: 8px; z-index: 10; display: flex; gap: 4px; opacity: 0.4; transition: opacity 0.3s;">
                ${[1, 2, 3, 4].map(p => `<button data-p="${p}" style="background: ${p===1?'#ffba00':'#222'}; color: ${p===1?'#000':'#ffba00'}; border: 1px solid #444; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 10px; font-weight: bold;">${p}</button>`).join('')}
            </div>

            <div id="placement-loader" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #111; z-index: 5;">
                <div style="width: 30px; height: 30px; border: 3px solid #333; border-top: 3px solid #ffba00; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>

            <iframe id="placement-iframe" style="width: 200%; height: 200%; border: none; transform: scale(0.5); transform-origin: 0 0; background: #111; opacity: 0; transition: opacity 0.5s; pointer-events: none;"></iframe>

            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                #custom-placement-block:hover #page-nav-btns { opacity: 1; }
            </style>
        `;

        parent.appendChild(block);

        const frame = document.getElementById('placement-iframe');
        const loader = document.getElementById('placement-loader');
        
        frame.src = getUrl(1);

        setInterval(() => cleanIframe(frame, loader), 500);

        block.querySelectorAll('#page-nav-btns button').forEach(btn => {
            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const p = this.getAttribute('data-p');
                loader.style.display = 'flex';
                frame.style.opacity = '0';
                
                block.querySelectorAll('#page-nav-btns button').forEach(b => {
                    b.style.background = '#222'; b.style.color = '#ffba00';
                });
                this.style.background = '#ffba00'; this.style.color = '#000';
                
                frame.src = getUrl(p);
            };
        });
        
        isCreating = false;
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            setTimeout(() => {
                const frame = document.getElementById('placement-iframe');
                const loader = document.getElementById('placement-loader');
                if (frame && loader) {
                    loader.style.display = 'flex';
                    frame.style.opacity = '0';
                    frame.src = frame.src; 
                }
            }, 2500);
        }
    }, true);

    const observer = new MutationObserver(() => {
        if (!document.getElementById('custom-placement-block')) injectUI();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();