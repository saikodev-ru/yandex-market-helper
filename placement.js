// placement.js - RENUM Placement Handler
(function() {
    'use strict';

    console.log('🔊 RENUM: Placement Handler Active');

    const CONFIG = {
        DEBOUNCE_DELAY: 300,
        NUMBER_SPEED: 1.1,
        SUCCESS_SPEED: 1.1,
        VOLUME: 1.0,
        OVERLAP_MS: 550,
        NOTIFICATION_COOLDOWN: 2000,
        
        // SKU Button config
        BUTTON_SIZE: 26,
        BUTTON_FONT: 16,
        GAP: 6,
        
        // DROP Panel Buttons config
        DROP_BUTTON_WIDTH: 188,
        DROP_BUTTON_HEIGHT: 48,
        DROP_BUTTON_FONT: 15,
        DROP_BUTTONS_GAP: 16,
        DROP_BUTTON_BORDER_RADIUS: 10
    };

    // Динамические пути на основе voiceProfile
    let voiceProfile = 'default';

    function getMp3Path() {
        const profile = (voiceProfile && voiceProfile !== 'default') ? voiceProfile : 'alice';
        return `sounds/${profile}/num/`;
    }
    function getSuccessSoundPath() {
        const profile = (voiceProfile && voiceProfile !== 'default') ? voiceProfile : 'alice';
        return `sounds/${profile}/ordertype/success-ship.mp3`;
    }
    function getDropSoundPath() {
        const profile = (voiceProfile && voiceProfile !== 'default') ? voiceProfile : 'alice';
        return `sounds/${profile}/num/drop.mp3`;
    }
    function getReturnSoundPath() {
        const profile = (voiceProfile && voiceProfile !== 'default') ? voiceProfile : 'alice';
        return `sounds/${profile}/num/return.mp3`;
    }

    // Читаем voiceProfile из chrome.storage.sync
    function initVoiceProfile() {
        try {
            chrome.storage.sync.get(['voiceProfile'], ({ voiceProfile: profile }) => {
                voiceProfile = profile || 'default';
            });
            chrome.storage.onChanged.addListener((changes) => {
                if (changes.voiceProfile) {
                    voiceProfile = changes.voiceProfile.newValue || 'default';
                }
            });
        } catch (e) {}
    }

    // =========================
    // AUDIO SYSTEM
    // =========================
    let observer = null;
    let lastValue = null;
    let notificationHistory = new Map();
    let isProcessing = false;
    const processedSkus = new WeakSet(); // Для отслеживания обработанных span
    const processedDropPanels = new WeakSet(); // Для отслеживания обработанных DROP панелей

    async function checkFileExists(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }
    
    function stopAllOtherAudio() {
        document.querySelectorAll('audio').forEach(a => {
            try {
                a.pause();
                a.currentTime = 0;
            } catch {}
        });
    }
    
    async function speakWithMp3(number) {
        if (number == null || typeof number !== 'number') return;
        stopAllOtherAudio();
        
        const fullNumberUrl = chrome.runtime.getURL(`${getMp3Path()}${number}.mp3`);
        const hasFullFile = await checkFileExists(fullNumberUrl);

        if (hasFullFile) {
            const audio = new Audio(fullNumberUrl);
            audio.volume = CONFIG.VOLUME;
            audio.playbackRate = CONFIG.NUMBER_SPEED;
            await audio.play().catch(() => {});
            return;
        }

        const getSequence = (num) => {
            const seq = [];
            if (num <= 20) {
                seq.push(chrome.runtime.getURL(`${getMp3Path()}${num}.mp3`));
            } else if (num < 100) {
                const tens = Math.floor(num / 10) * 10;
                const ones = num % 10;
                seq.push(chrome.runtime.getURL(`${getMp3Path()}${tens}.mp3`));
                if (ones > 0) seq.push(chrome.runtime.getURL(`${getMp3Path()}${ones}.mp3`));
            } else if (num < 1000) {
                const hundreds = Math.floor(num / 100) * 100;
                const remainder = num % 100;
                seq.push(chrome.runtime.getURL(`${getMp3Path()}${hundreds}.mp3`));
                if (remainder > 0) seq.push(...getSequence(remainder));
            }
            return seq;
        };

        const numberSequence = getSequence(number);
        if (numberSequence.length === 0) return;

        numberSequence.forEach((src, i) => {
            setTimeout(() => {
                const audio = new Audio(src);
                audio.volume = CONFIG.VOLUME;
                audio.playbackRate = CONFIG.NUMBER_SPEED;
                audio.play().catch(() => {});
            }, i * CONFIG.OVERLAP_MS);
        });
    }

    function playSuccess() {
        const audio = new Audio(chrome.runtime.getURL(getSuccessSoundPath()));
        audio.volume = CONFIG.VOLUME;
        audio.playbackRate = CONFIG.SUCCESS_SPEED;
        audio.play().catch(() => {});
    }

    function playDrop() {
        const audio = new Audio(chrome.runtime.getURL(getDropSoundPath()));
        audio.volume = CONFIG.VOLUME;
        audio.play().catch(() => {});
    }

    function playReturn() {
        const audio = new Audio(chrome.runtime.getURL(getReturnSoundPath()));
        audio.volume = CONFIG.VOLUME;
        audio.play().catch(() => {});
    }

    // =========================
    // BEEP для SKU
    // =========================
    function playBeepSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            playBeep(audioContext, 0, 50);
            playBeep(audioContext, 0.1, 90);
            playBeep(audioContext, 0.2, 110);
            playBeep(audioContext, 0.3, 130);
            
            function playBeep(ctx, startTime, freq) {
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
                
                gainNode.gain.setValueAtTime(0, ctx.currentTime + startTime);
                gainNode.gain.linearRampToValueAtTime(0.225, ctx.currentTime + startTime + 0.02);
                gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + startTime + 0.05);
                
                oscillator.start(ctx.currentTime + startTime);
                oscillator.stop(ctx.currentTime + startTime + 0.08);
            }
        } catch (error) {
            console.log('Ошибка в playBeepSequence:', error);
        }
    }

    // =========================
    // ФУНКЦИИ ПЕЧАТИ
    // =========================
    function generatePDFWithQR(sku) {
        console.log('Печать QR для SKU:', sku);
        if (typeof window.generatePDFWithQR === 'function') {
            window.generatePDFWithQR(sku);
        }
    }

    function generatePDFWithDataMatrix() {
        console.log('Печать \\100 с datamatrix');
        if (typeof window.generatePDFWithQR === 'function') {
            window.generatePDFWithQR('\\100');
        }
    }

    function generatePDFWithBrotherSort() {
        console.log('Печать БРАК СОРТ НА ПВЗ');
        // Используем точный текст, который нужен
        const labelText = 'БРАК СОРТ НА ПВЗ';
        
        if (typeof window.generatePDFWithQR === 'function') {
            // Проверяем, есть ли специальная функция для печати текста без QR
            if (typeof window.generateTextOnlyLabel === 'function') {
                window.generateTextOnlyLabel(labelText);
            } else {
                // Если нет - используем обычную функцию с флагом
                console.log('⚠️ Используется стандартная функция печати. Убедитесь, что настроена печать текста без QR');
                window.generatePDFWithQR(labelText);
            }
        } else {
            console.error('❌ Функция generatePDFWithQR не найдена!');
            alert(`Печать: ${labelText}`);
        }
    }

    function generatePDFWithCargoNumber(cargoNumber) {
        console.log('Печать номера груза:', cargoNumber);
        if (typeof window.generatePDFWithQR === 'function') {
            window.generatePDFWithQR(cargoNumber);
        }
    }

    // =========================
    // DROP PANEL BUTTONS - 3 ВЕРТИКАЛЬНЫЕ КНОПКИ
    // =========================
    const DROP_PANEL_SELECTOR = 'div[data-testid="cargo-scan-cell-section-cell"]';

    function addDropPanelButtons(dropPanel) {
        if (!dropPanel || processedDropPanels.has(dropPanel)) return;
        
        // Ищем родительский контейнер, где нужно разместить кнопки
        const parentContainer = dropPanel.closest('.mez-flex.mez-flex-row.mez-gap-\\[24px\\]');
        if (!parentContainer) return;
                
                    // Проверяем, не добавлены ли уже кнопки в этот контейнер
                if (parentContainer.querySelector('.renum-drop-buttons-container')) {
                        return; // Кнопки уже есть, выходим
                }
        
        // Получаем номер груза из верхнего блока
        const cargoNumberElement = parentContainer.querySelector('span.mez-font-ys-display.mez-text-m-headline3');
        const cargoNumber = cargoNumberElement ? cargoNumberElement.textContent.trim() : '';
        
        // Получаем высоту DROP панели для подравнивания кнопок
        const dropPanelHeight = dropPanel.offsetHeight || 68; // fallback height

                try {
                        // Создаем контейнер для вертикальных кнопок
                        const buttonsContainer = document.createElement('div');
                        buttonsContainer.className = 'renum-drop-buttons-container';
                        buttonsContainer.style.cssText = `
                                display: flex;
                                flex-direction: column;
                                gap: ${CONFIG.DROP_BUTTONS_GAP}px;
                                margin-left: 12px;
                                margin-right: 4px;
                                align-self: center;
                                height: ${dropPanelHeight}px;
                                justify-content: center;
                        `;

                        // Добавляем CSS-правила для hover (это решит проблему навсегда)
                        const styleId = 'renum-drop-button-hover-styles';
                        if (!document.getElementById(styleId)) {
                                const style = document.createElement('style');
                                style.id = styleId;
                                style.textContent = `
                                        .renum-drop-button {
                                                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                                                will-change: transform, box-shadow;
                                        }
                                        .renum-drop-button:hover {
                                                transform: translateY(-2px) !important;
                                                box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                                        }
                                `;
                                document.head.appendChild(style);
                        }

                        // Создаем 3 кнопки
                        const buttons = [
                                {
                                        text: '100 ячейка',
                                        title: 'Печать 100',
                                        bgColor: '#dcdcdc',
                                        hoverColor: '#a62383',
                                        action: generatePDFWithDataMatrix
                                },
                                {
                                        text: 'Печатать брак',
                                        title: 'Печать БРАК СОРТ НА ПВЗ',
                                        bgColor: '#dcdcdc',
                                        hoverColor: '#a69723',
                                        action: function() {
                                                console.log('🖨️ Запуск печати этикетки брака');
                                                if (typeof window.printDefectLabel === 'function') {
                                                        window.printDefectLabel('БРАК НА ПВЗ СОРТ');
                                                } else {
                                                        console.error('❌ Функция printDefectLabel не найдена!');
                                                        alert('Ошибка: модуль печати этикетки брака не загружен');
                                                }
                                        }
                                },
                                {
                                        text: 'Печатать этикетку',
                                        title: `Печать номера груза: ${cargoNumber}`,
                                        bgColor: '#dcdcdc',
                                        hoverColor: '#3E9437',
                                        action: () => generatePDFWithCargoNumber(cargoNumber)
                                }
                        ];

                        buttons.forEach((btnConfig) => {
                                const button = document.createElement('button');
                                button.type = 'button';
                                button.className = 'renum-drop-button';
                                button.title = btnConfig.title;
                                
                                // Поддержка многострочного текста
                                button.style.whiteSpace = 'pre-line';
                                button.style.lineHeight = '1.2';
                                button.textContent = btnConfig.text;

                                // Рассчитываем высоту кнопки
                                const buttonHeight = Math.floor((dropPanelHeight - (CONFIG.DROP_BUTTONS_GAP * 2)) / 3);
                                
                                // БАЗОВЫЕ СТИЛИ - только один раз!
                                button.style.cssText = `
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        width: ${CONFIG.DROP_BUTTON_WIDTH}px;
                                        height: ${buttonHeight}px;
                                        min-width: ${CONFIG.DROP_BUTTON_WIDTH}px;
                                        font-size: ${CONFIG.DROP_BUTTON_FONT}px;
                                        font-weight: normal;
                                        color: white;
                                        background: #dcdcdc;
                                        border: none;
                                        border-radius: ${CONFIG.DROP_BUTTON_BORDER_RADIUS}px;
                                        cursor: pointer;
                                        flex-shrink: 0;
                                        padding: 4px 6px;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                                        text-align: center;
                                        word-break: break-word;
                                        font-family: inherit;
                                        letter-spacing: 0.5px;
                                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                                        transform: translateY(0);
                                `;

                                // Используем CSS-переменную для hover через глобальный стиль
                                button.style.setProperty('--hover-bg', btnConfig.hoverColor);
                                
                                // Добавляем инлайн-стиль для hover (резервный вариант)
                                const styleSheet = document.createElement('style');
                                styleSheet.textContent = `
                                        button[title="${btnConfig.title}"]:hover {
                                                background: #dcdcdc;
                                        }
                                `;
                                document.head.appendChild(styleSheet);

                                // УБИРАЕМ mouseenter/mouseleave обработчики - они больше не нужны!
                                // Вместо них используем CSS :hover

                                button.addEventListener('click', (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (typeof playBeepSound === 'function') playBeepSound();
                                        btnConfig.action();
                                });

                                buttonsContainer.appendChild(button);
                        });

                        // Вставляем контейнер с кнопками
                        parentContainer.insertBefore(buttonsContainer, dropPanel);
                        processedDropPanels.add(dropPanel);
                        
                        console.log('✅ Добавлены вертикальные кнопки для DROP панели');

                } catch (e) {
                        console.log('Ошибка при добавлении кнопок DROP панели:', e);
                }
    }

    function processDropPanelButtons() {
        if (!location.pathname.includes('/placement')) return;

        try {
            const dropPanels = document.querySelectorAll(DROP_PANEL_SELECTOR);
            dropPanels.forEach(panel => {
                if (!document.body.contains(panel)) return;
                if (processedDropPanels.has(panel)) return;
                
                // Небольшая задержка для получения актуальных размеров
                setTimeout(() => {
                    if (document.body.contains(panel) && !processedDropPanels.has(panel)) {
                        addDropPanelButtons(panel);
                    }
                }, 150);
            });
        } catch (e) {
            console.log('Ошибка в processDropPanelButtons:', e);
        }
    }

        // =========================
        // SKU BUTTON - С ИСКЛЮЧЕНИЕМ ДЛЯ ВЕРХНЕГО БЛОКА С ДАННЫМИ ГРУЗА
        // =========================
        const PLACEMENT_SKU_SELECTOR = 'span.mez-text-themeTextSecondary.mez-lining-nums.mez-proportional-nums';
        const SKU_REGEX = /^[A-Za-z0-9\-]+$/;

        // Функция проверки, нужно ли пропустить этот span
        function shouldSkipSkuButton(span) {
                // Проверяем, находится ли span внутри контейнера с данными груза
                const isInCargoContainer = span.closest('div.mez-flex.mez-flex-col.mez-gap-\\[16px\\].mez-grow');
                
                // Проверяем, есть ли рядом элемент с "Прямой поток" (признак верхнего блока)
                const hasDirectFlow = span.closest('div.mez-flex.mez-flex-col.mez-gap-\\[4px\\]')?.querySelector('span[data-i18n-key*="PLACE.group"]');
                
                // Проверяем, есть ли рядом destination name
                const hasDestination = span.closest('div.mez-flex.mez-flex-col.mez-gap-\\[4px\\]')?.querySelector('[data-testid="placement-destination-name"]');
                
                // Проверяем, что это не табличная строка (нет ag-row)
                const isInTable = span.closest('.ag-row');
                
                // Пропускаем, если это верхний блок с данными груза (не таблица)
                if ((isInCargoContainer || hasDirectFlow || hasDestination) && !isInTable) {
                        console.log('🚫 Пропускаем SKU в верхнем блоке груза:', span.textContent.trim());
                        return true;
                }
                
                return false;
        }

        function addSkuButton(span, sku) {
                if (!span || processedSkus.has(span)) return;
                if (shouldSkipSkuButton(span)) {
                        processedSkus.add(span);
                        return;
                }

                const td = span.closest('td');
                if (!td) return;

                // Уже существует кнопка в этом td?
                if (td.querySelector('.renum-sku-button')) {
                        processedSkus.add(span);
                        return;
                }
                
                // уменьшаем левый отступ один раз
                if (!td.dataset.renumPaddingFixed) {
                        td.style.paddingLeft = '2px'; // нужное значение
                        td.dataset.renumPaddingFixed = 'true';
                }

                try {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.textContent = '⚠';
                        button.dataset.cargo = sku;
                        button.className = 'renum-sku-button';

                        button.style.cssText = `
                                display: inline-flex;
                                align-items: center;
                                justify-content: center;
                                width: ${CONFIG.BUTTON_SIZE}px;
                                height: ${CONFIG.BUTTON_SIZE}px;
                                min-width: ${CONFIG.BUTTON_SIZE}px;
                                font-size: ${CONFIG.BUTTON_FONT}px;
                                font-weight: bold;
                                color: #333;
                                background: #dcdcdc;
                                border: none;
                                border-radius: 9px;
                                cursor: pointer;
                                flex-shrink: 0;
                                transition: all 0.2s ease;
                                margin-right: 12px;
                                padding: 0;
                                line-height: 1;
                                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                        `;

                        button.addEventListener('mouseenter', () => {
                                button.style.background = '#F28383';
                                button.style.transform = 'translateY(-1px)';
                                button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
                        });

                        button.addEventListener('mouseleave', () => {
                                button.style.background = '#dcdcdc';
                                button.style.transform = 'translateY(0)';
                                button.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                        });

                        button.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                playBeepSound();
                                if (typeof generatePDFWithQR === 'function') {
                                        generatePDFWithQR(sku);
                                }
                        });

                        // --- КЛЮЧЕВОЙ МОМЕНТ ---
                        // Делаем td flex-контейнером, не трогая его содержимое
                        if (!td.dataset.renumFlexApplied) {
                                td.style.display = 'flex';
                                td.style.alignItems = 'center';
                                td.dataset.renumFlexApplied = 'true';
                        }

                        // Вставляем кнопку ПЕРВОЙ
                        td.insertBefore(button, td.firstChild);

                        processedSkus.add(span);

                } catch (e) {
                        console.log('Ошибка при добавлении кнопки SKU:', e);
                }
        }


        function processSkuButtons() {
                if (isProcessing) return;
                if (!location.pathname.includes('/placement')) return;

                isProcessing = true;
                
                try {
                        const spans = document.querySelectorAll(PLACEMENT_SKU_SELECTOR);
                        spans.forEach(span => {
                                if (!document.body.contains(span)) return;
                                if (processedSkus.has(span)) return;
                                
                                // Проверяем, не нужно ли пропустить этот span
                                if (shouldSkipSkuButton(span)) {
                                        processedSkus.add(span);
                                        return;
                                }
                                
                                // Пропускаем, если кнопка уже есть рядом
                                if (span.nextElementSibling?.classList.contains('renum-sku-button')) {
                                        processedSkus.add(span);
                                        return;
                                }
                                
                                const text = span.textContent.trim();
                                if (!SKU_REGEX.test(text)) return;
                                
                                // Добавляем небольшую задержку для стабильности
                                setTimeout(() => {
                                        if (document.body.contains(span) && !processedSkus.has(span)) {
                                                addSkuButton(span, text);
                
                                        }
                                }, 50);
                        });
                } catch (e) {
                        console.log('Ошибка в processSkuButtons:', e);
                } finally {
                        isProcessing = false;
                }
        }

        // Добавляем CSS
        const style = document.createElement('style');
        style.textContent = `
                .renum-sku-button {
                        box-sizing: content-box !important;
                        margin-left: 2px !important;
                }
                span.mez-text-themeTextSecondary.mez-lining-nums.mez-proportional-nums + .renum-sku-button {
                        vertical-align: middle !important;
                }
                .renum-drop-buttons-container {
                        animation: fadeIn 0.2s ease;
                }
                @keyframes fadeIn {
                        from { opacity: 0; transform: translateX(-10px); }
                        to { opacity: 1; transform: translateX(0); }
                }
                .renum-drop-button {
                        box-sizing: border-box !important;
                }
        `;

        if (!document.head.querySelector('style[data-renum-sku]')) {
                style.setAttribute('data-renum-sku', 'true');
                document.head.appendChild(style);
        }

    // =========================
    // NOTIFICATION HANDLER
    // =========================
    function debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    function generateNotificationId(fullText, soundType, streamType = null) {
        const timestamp = Math.floor(Date.now() / 1000);
        const textHash = fullText.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return `${soundType}_${streamType || 'none'}_${textHash}_${timestamp}`;
    }

    function canPlayNotification(notificationId, soundType, streamType = null) {
        const now = Date.now();

        for (const [id, data] of notificationHistory.entries()) {
            if (now - data.time > 5000) notificationHistory.delete(id);
        }

        if (notificationHistory.has(notificationId)) return false;

        if (soundType === 'stream') {
            for (const [id, data] of notificationHistory.entries()) {
                if (data.soundType === 'stream' && data.streamType === streamType &&
                    (now - data.time) < CONFIG.NOTIFICATION_COOLDOWN) {
                    return false;
                }
            }
        }

        return true;
    }

    function getTarget() {
        const path = window.location.pathname;

        if (path.includes('/acceptance-request/merch-session')) {
            const els = document.querySelectorAll('.mez-lining-nums.mez-proportional-nums');
            for (let el of els) {
                const parent = el.closest('.mez-flex.mez-flex-row.mez-gap-\\[8px\\]');
                if (parent && parent.textContent.includes('Принято')) {
                    return { element: el, fullText: parent.textContent, pageType: 'merch-session' };
                }
            }
        }

        if (path.includes('/tpl-outlet/') && path.includes('/placement')) {
            const notifications = document.querySelectorAll(
                '[data-testid="cargo-placement-set-success"], ' +
                '[data-testid*="notification"], ' +
                '[externalid="NOTIFICATION_CELL_EXTERNAL_ID"], ' +
                '.mez-fixed.mez-right-0.mez-bottom-0'
            );

            if (notifications.length > 0) {
                const lastNotification = notifications[notifications.length - 1];
                const textElement = lastNotification.querySelector(
                    '[data-i18n-key*="CARGO_PLACEMENT_SET_SUCCESS"], ' +
                    '[data-testid="notification-title"], ' +
                    '.mez-font-ys-text, ' +
                    'span, div'
                );

                const fullText = textElement ? textElement.textContent : lastNotification.textContent;

                let streamType = null;
                const streamElements = document.querySelectorAll(
                    '[data-i18n-key*="cargo-type"], ' +
                    '[data-i18n-key*=".group"], ' +
                    '.mez-font-ys-text'
                );

                for (const el of streamElements) {
                    const text = el.textContent || '';
                    const i18nKey = el.getAttribute('data-i18n-key') || '';

                    if (i18nKey.includes('RETURN') || i18nKey.includes('RETURN.group')) {
                        streamType = 'return'; break;
                    } else if (i18nKey.includes('PLACE') || i18nKey.includes('PLACE.group')) {
                        streamType = 'drop'; break;
                    }
                    if (text.includes('Обратный поток') || text.includes('обратный')) {
                        streamType = 'return'; break;
                    } else if (text.includes('Прямой поток') || text.includes('прямой')) {
                        streamType = 'drop'; break;
                    }
                }

                return { element: textElement || lastNotification, fullText: fullText || '', pageType: 'tpl-outlet-placement', container: lastNotification, streamType };
            }

            const elements = document.querySelectorAll('div, span, p');
            for (let el of elements) {
                const text = el.textContent || '';
                if (text.includes('размещено в ячейке') || text.includes('ячейке') || /Грузоместо.*размещено.*ячейке/i.test(text)) {
                    let streamType = null;
                    const i18nKey = el.getAttribute('data-i18n-key') || '';
                    if (i18nKey.includes('RETURN') || text.includes('Обратный')) streamType = 'return';
                    else if (i18nKey.includes('PLACE') || text.includes('Прямой')) streamType = 'drop';
                    return { element: el, fullText: text, pageType: 'tpl-outlet-placement', streamType };
                }
            }
        }

        const spans = document.querySelectorAll('[data-e2e-i18n-key]');
        for (let s of spans) {
            const t = s.textContent.trim();
            if (/Принято\s+\d+/.test(t) || /В очереди\s+\d+/.test(t)) {
                return { element: s, fullText: t, pageType: 'tpl-outlet-old' };
            }
        }

        return null;
    }

    function extractDataFromText(text, streamType = null) {
        if (!text) return null;

        const dropMatch = text.match(/ячейке[:\s]*DROP/i);
        if (dropMatch) return { soundType: 'stream', streamType: streamType || 'drop', number: null, isStream: true };

        const numberMatch = text.match(/ячейке[:\s]*(\d+)/i);
        if (numberMatch) return { soundType: 'number', streamType: streamType, number: parseInt(numberMatch[1], 10), isStream: false };

        const generalMatch = text.match(/\d+/);
        if (generalMatch) return { soundType: 'number', streamType: streamType, number: parseInt(generalMatch[0], 10), isStream: false };

        return null;
    }

    const handleChange = debounce(() => {
        const targetData = getTarget();
        if (!targetData) return;

        const target = targetData.element;
        const fullText = targetData.fullText || target.textContent;
        const pageType = targetData.pageType;
        const streamType = targetData.streamType;
        const extractedData = extractDataFromText(fullText, streamType);
        if (!extractedData) return;

        const { soundType, streamType: extractedStreamType, number, isStream } = extractedData;
        const finalStreamType = extractedStreamType || streamType;

        const notificationId = generateNotificationId(fullText, soundType, finalStreamType);
        if (!canPlayNotification(notificationId, soundType, finalStreamType)) return;
        notificationHistory.set(notificationId, { number, time: Date.now(), text: fullText.substring(0, 50), soundType, streamType: finalStreamType, isStream });

        if (isStream) {
            if (finalStreamType === 'return') playReturn();
            else playDrop();
        } else if (number !== null && number !== 0) {
            speakWithMp3(number);
        } else if (number === 0) playSuccess();
    }, CONFIG.DEBOUNCE_DELAY);


    // =========================
    // INITIALIZATION
    // =========================
    function init() {
        // MutationObserver ТОЛЬКО для уведомлений
        observer = new MutationObserver((mutations) => {
            let shouldHandle = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            
                            // Только уведомления
                            if (element.matches && (
                                element.matches('[data-testid*="notification"]') ||
                                element.matches('[data-testid*="cargo-placement"]') ||
                                element.matches('[externalid="NOTIFICATION_CELL_EXTERNAL_ID"]') ||
                                element.matches('.mez-fixed.mez-right-0.mez-bottom-0'))) {
                                shouldHandle = true; break;
                            }
                        }
                    }
                }
                if (shouldHandle) break;
            }
            
            if (shouldHandle) handleChange();
            
            // Осторожно добавляем кнопки, но никогда не удаляем
            setTimeout(() => {
                processSkuButtons();
                processDropPanelButtons();
            }, 100);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        
        // Периодическая проверка для новых SKU и DROP панелей (без удаления)
        setInterval(() => {
            processSkuButtons();
            processDropPanelButtons();
        }, 2000);
        
        // Первоначальные вызовы
        setTimeout(() => {
            handleChange();
            processSkuButtons();
            processDropPanelButtons();
        }, 500);

        // React routing fix
        let lastHref = location.href;
        setInterval(() => {
            if (location.href !== lastHref) {
                lastHref = location.href;
                setTimeout(() => {
                    handleChange();
                    processSkuButtons();
                    processDropPanelButtons();
                }, 500);
            }
        }, 300);

        // Очистка истории
        setInterval(() => {
            const now = Date.now();
            for (const [id, data] of notificationHistory.entries()) {
                if (now - data.time > 10000) notificationHistory.delete(id);
            }
        }, 30000);

        console.log('✅ RENUM Placement Active');
    }

    // ── Enable guard — подчиняется тогглу «Озвучка ячеек» ──────────────────
    let renumPlacementActive = false;

    function startPlacement() {
        if (renumPlacementActive) return;
        renumPlacementActive = true;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    function stopPlacement() {
        if (!renumPlacementActive) return;
        renumPlacementActive = false;
        if (observer) { observer.disconnect(); observer = null; }
        notificationHistory.clear();
        lastValue = null;
        console.log('🔇 RENUM Placement stopped');
    }

    chrome.storage.sync.get({ renumEnabled: true }, data => {
        initVoiceProfile();
        if (data.renumEnabled) startPlacement();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !('renumEnabled' in changes)) return;
        if (changes.renumEnabled.newValue) startPlacement();
        else stopPlacement();
    });

    window.resetRenumCooldown = () => { 
        notificationHistory.clear(); 
        lastValue = null; 
        console.log('🔄 RENUM: Защита от дублирования сброшена'); 
    };



        // =========================
        // LABEL PRINTER MODULE - Этикетка брака 85x54mm
        // =========================
        // Максимально просто - только рамка и текст

        (function() {
                'use strict';

                function escapeHtml(text) {
                        if (!text) return '';
                        const div = document.createElement('div');
                        div.textContent = text;
                        return div.innerHTML;
                }

                function createDefectLabelHTML(text = 'БРАК НА ПВЗ СОРТ') {
                        const escapedText = escapeHtml(text);
                        
                        return `<!DOCTYPE html>
        <html>
        <head>
                <meta charset="UTF-8">
                <title>Этикетка брака</title>
                <style>
                        /* ЖЕСТКАЯ ФИКСАЦИЯ РАЗМЕРОВ */
                        @page { 
                                size: 85mm 54mm;
                                margin: 0;
                                padding: 0;
                        }
                        
                        * {
                                margin: 0;
                                padding: 0;
                                box-sizing: border-box;
                                print-color-adjust: exact;
                                -webkit-print-color-adjust: exact;
                        }
                        
                        html, body {
                                width: 85mm;
                                height: 54mm;
                                margin: 0;
                                padding: 0;
                                background: white;
                        }
                        
                        body { 
                                width: 85mm;
                                height: 54mm;
                                margin: 0;
                                padding: 0;
                                font-family: 'Arial', 'Helvetica', sans-serif;
                                border: 3px solid #000;
                                background: white;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                transform: rotate(180deg);
                        }
                        
                        .defect-text {
                                font-size: 28px;
                                font-weight: 900;
                                color: #ff0000;
                                text-align: center;
                                line-height: 1.3;
                                text-transform: uppercase;
                                padding: 3mm;
                                word-break: break-word;
                        }
                        
                        .defect-line1 {
                                font-size: 28px;
                                font-weight: 900;
                                color: #ff0000;
                        }
                        
                        .defect-line2 {
                                font-size: 54px;
                                font-weight: 900;
                                color: #ff0000;
                                background: #ffff00;
                                border: 3px solid #000;
                                display: inline-block;
                                padding: 1mm 3mm;
                                border-radius: 2mm;
                                margin-top: 2mm;
                        }
                        
                        @media print {
                                html, body {
                                        width: 85mm;
                                        height: 54mm;
                                        margin: 0;
                                        padding: 0;
                                }
                                
                                @page {
                                        size: 85mm 54mm;
                                        margin: 0;
                                        padding: 0;
                                }
                        }
                </style>
        </head>
        <body>
                <div class="defect-text">
                        <div class="defect-line1">⚠️ СОРТ НА ПВЗ ⚠️</div>
                        <div class="defect-line2">БРАК</div>
                </div>
                
                <script>
                        window.onload = function() {
                                setTimeout(function() {
                                        window.print();
                                }, 200);
                        };
                </script>
        </body>
        </html>`;
                }

                function createDefectPrintIframe(text) {
                        const iframe = document.createElement('iframe');
                        iframe.id = 'defect-print-iframe-' + Date.now();
                        iframe.style.cssText = `
                                position: fixed;
                                top: 0;
                                left: 0;
                                width: 85mm;
                                height: 54mm;
                                border: none;
                                opacity: 0;
                                pointer-events: none;
                                z-index: -9999;
                        `;
                        
                        document.body.appendChild(iframe);
                        
                        const htmlContent = createDefectLabelHTML(text);
                        
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        iframeDoc.open();
                        iframeDoc.write(htmlContent);
                        iframeDoc.close();
                        
                        setTimeout(() => {
                                try {
                                        printDefectIframe(iframe);
                                } catch (error) {
                                        console.error('Ошибка при создании iframe для печати:', error);
                                        setTimeout(() => {
                                                printDefectIframe(iframe);
                                        }, 300);
                                }
                        }, 300);
                }

                function printDefectIframe(iframe) {
                        setTimeout(() => {
                                try {
                                        iframe.contentWindow.focus();
                                        iframe.contentWindow.print();
                                        
                                        setTimeout(() => {
                                                if (iframe.parentNode) {
                                                        iframe.parentNode.removeChild(iframe);
                                                }
                                        }, 1000);
                                        
                                        console.log('✅ Этикетка брака отправлена на печать');
                                        
                                } catch (error) {
                                        console.error('❌ Ошибка печати этикетки брака:', error);
                                        
                                        try {
                                                const html = iframe.contentDocument.documentElement.outerHTML;
                                                const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                                                const url = URL.createObjectURL(blob);
                                                const newTab = window.open(url, '_blank');
                                                
                                                if (newTab) {
                                                        setTimeout(() => {
                                                                try {
                                                                        newTab.print();
                                                                } catch(e) {
                                                                        console.log('Не удалось распечатать во вкладке');
                                                                }
                                                        }, 500);
                                                }
                                        } catch (fallbackError) {
                                                console.error('Fallback также не сработал:', fallbackError);
                                        }
                                        
                                        if (iframe.parentNode) {
                                                iframe.parentNode.removeChild(iframe);
                                        }
                                }
                        }, 500);
                }

                // Экспортируем функции
                window.DefectLabelPrinter = {
                        print: createDefectPrintIframe,
                        printDefect: createDefectPrintIframe,
                        createHTML: createDefectLabelHTML
                };

                window.printDefectLabel = function(customText = 'БРАК НА ПВЗ СОРТ') {
                        console.log('🖨️ Печать этикетки брака 85x54мм:', customText);
                        createDefectPrintIframe(customText);
                };

                console.log('✅ Модуль печати этикетки брака 85x54мм загружен');
                console.log('   Используйте: window.printDefectLabel()');
        })();
})();