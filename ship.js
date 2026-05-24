// ship.js - Content script для SPA с домашней страницы
(function() {
    'use strict';

    // Конфигурация
    const CONFIG = {
        C2C_MARKERS: [
            'Оформляя доставку, вы подтверждаете, что в отправлении нет ничего запрещённого и перевозятся именно указанные категории.'
        ],
        AVITO_MARKERS: [
            'Один экземпляр оставьте себе, другой отдайте отправителю'
        ],
        // Паттерны URL
                HOME_PATTERN: /(?:https?:\/\/[^/]+)?\/tpl-outlet\/\d{8}\/acceptance-request\/?(?:\?.*)?$/,

                DETAIL_PATTERN: /(?:https?:\/\/[^/]+)?\/tpl-outlet\/\d{8}\/acceptance-request\/\d{8}\/?(?:\?.*)?$/

    };

    // Глобальное состояние
    let currentPageId = null;
    let currentShipmentType = null;
    let isProcessing = false;
    let isInitialized = false;
    const processedPages = new Map();

    // Динамический профиль озвучки
    let voiceProfile = 'default';
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

    // Вспомогательные функции
    const utils = {
        /**
         * Извлекает ID страницы из URL
         */
        getPageId(url) {
            const match = url.match(/acceptance-request\/(\d{8})/);
            return match ? match[1] : null;
        },

        /**
         * Проверяет тип страницы
         */
        getPageType(url) {
            if (CONFIG.DETAIL_PATTERN.test(url)) return 'detail';
            if (CONFIG.HOME_PATTERN.test(url)) return 'home';
            return 'other';
        },

        /**
         * Ищет точное совпадение текста на странице
         */
        findExactText(text) {
            // Быстрый поиск по всему документу
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        // Игнорируем скрытые элементы
                        if (node.parentElement && 
                            (node.parentElement.style.display === 'none' ||
                             node.parentElement.style.visibility === 'hidden' ||
                             node.parentElement.offsetParent === null)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                },
                false
            );
            
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent && node.textContent.includes(text)) {
                    return true;
                }
            }
            
            return false;
        },

        /**
         * Определяет тип отправления с приоритетом Avito
         */
        detectShipmentType() {
            // Сначала ищем Avito маркер (более специфичный)
            for (const marker of CONFIG.AVITO_MARKERS) {
                const found = this.findExactText(marker);
                if (found) {
                    console.log(`✅ Найден Avito маркер: "${marker}"`);
                    return 'avito';
                }
            }
            
            // Если Avito не найден, ищем C2C маркер
            for (const marker of CONFIG.C2C_MARKERS) {
                const found = this.findExactText(marker);
                if (found) {
                    console.log(`✅ Найден C2C маркер: "${marker}"`);
                    return 'c2c';
                }
            }
            
            console.log('❌ Маркеры не найдены');
            return null;
        },

        /**
         * Воспроизводит звук уведомления
         */
        playNotificationSound(type) {
            const profile = (voiceProfile && voiceProfile !== 'default') ? voiceProfile : 'alice';
            const soundPath = type === 'avito' 
                ? chrome.runtime.getURL(`sounds/${profile}/ship/ship-avito.mp3`)
                : chrome.runtime.getURL(`sounds/${profile}/ship/ship-c2c.mp3`);
            
            const audio = new Audio(soundPath);
            audio.volume = 0.7;
            
            audio.play().catch(error => {
                console.log('Автовоспроизведение заблокировано:', error);
                // Создаем кнопку для ручного воспроизведения
                this.createManualPlayButton(type);
            });
        },

        /**
         * Создает кнопку для ручного воспроизведения звука
         */
        createManualPlayButton(type) {
            const buttonId = 'manual-play-sound-btn';
            let button = document.getElementById(buttonId);
            
            if (!button) {
                button = document.createElement('button');
                button.id = buttonId;
                button.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    padding: 10px 16px;
                    background: #2196F3;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    z-index: 1000000;
                    font-family: inherit;
                    font-size: 14px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                
                button.innerHTML = `
                    <span>🔊</span>
                    <span>Воспроизвести уведомление</span>
                `;
                
                document.body.appendChild(button);
                
                // Автоудаление через 10 секунд
                setTimeout(() => {
                    if (button.parentNode) {
                        button.parentNode.removeChild(button);
                    }
                }, 10000);
            }
            
            button.onclick = () => {
                this.playNotificationSound(type);
                if (button.parentNode) {
                    button.parentNode.removeChild(button);
                }
            };
        },

        /**
         * Проверяет, нужно ли обрабатывать страницу
         * Упрощенная логика: ВСЕГДА обрабатываем, если страница изменилась
         */
        shouldProcessPage(pageId, shipmentType) {
            const lastProcessed = processedPages.get(pageId);
            
            // Если страница еще не обрабатывалась ИЛИ прошло больше 1 секунды с последней обработки
            const shouldProcess = !lastProcessed || (Date.now() - lastProcessed.timestamp > 1000);
            
            if (shouldProcess) {
                processedPages.set(pageId, {
                    type: shipmentType,
                    timestamp: Date.now(),
                    url: window.location.href
                });
                console.log(`✅ Страница ${pageId} будет обработана (тип: ${shipmentType})`);
            } else {
                console.log(`⏭️ Страница ${pageId} уже обработана (тип: ${shipmentType})`);
            }
            
            return shouldProcess;
        },

        /**
         * Удаляет страницу из памяти
         */
        forgetPage(pageId) {
            if (processedPages.has(pageId)) {
                processedPages.delete(pageId);
                console.log(`🗑️ Страница ${pageId} удалена из памяти`);
            }
        },

        /**
         * Очищает ВСЮ память
         */
        clearAllMemory() {
            const size = processedPages.size;
            processedPages.clear();
            console.log(`🧹 Вся память очищена, удалено ${size} записей`);
        },

        /**
         * Очищает память о старых страницах
         */
        cleanupMemory() {
            const currentTime = Date.now();
            const ONE_MINUTE = 60 * 1000; // Всего 1 минута хранения
            let removedCount = 0;
            
            for (const [pageId, data] of processedPages.entries()) {
                if (currentTime - data.timestamp > ONE_MINUTE) {
                    processedPages.delete(pageId);
                    removedCount++;
                }
            }
            
            if (removedCount > 0) {
                console.log(`🧹 Очищено ${removedCount} старых записей`);
            }
        },

        /**
         * Ожидает появления текста
         */
        waitForText(maxAttempts = 10, interval = 200) {
            return new Promise((resolve) => {
                let attempts = 0;
                
                const check = () => {
                    attempts++;
                    const type = this.detectShipmentType();
                    
                    if (type) {
                        console.log(`📝 Текст найден на попытке ${attempts}`);
                        resolve(type);
                        return;
                    }
                    
                    if (attempts >= maxAttempts) {
                        console.log(`❌ Текст не найден после ${maxAttempts} попыток`);
                        resolve(null);
                        return;
                    }
                    
                    setTimeout(check, interval);
                };
                
                check();
            });
        }
    };

    // Главный наблюдатель (всегда активен)
    class GlobalObserver {
        constructor() {
            this.lastUrl = window.location.href;
            this.lastPageType = utils.getPageType(this.lastUrl);
            this.lastDetailPageId = null;
            this.isActive = true;
            this.spaNavigationHandler = null;
            this.urlCheckInterval = null;
            this.mutationObserver = null;
            
            this.init();
        }

        init() {
            console.log('🚀 GlobalObserver инициализирован');
            console.log(`📄 Текущая страница: ${this.lastPageType}, URL: ${this.lastUrl}`);
            
            // 1. Всегда запускаем отслеживание URL
            this.startUrlTracking();
            
            // 2. Всегда запускаем отслеживание DOM
            this.startDomTracking();
            
            // 3. Проверяем текущую страницу
            this.handlePageChange(this.lastUrl, this.lastPageType);
            
            // 4. Периодическая очистка памяти
            setInterval(() => utils.cleanupMemory(), 30000);
        }

        startUrlTracking() {
            // Перехват History API
            this.overrideHistoryMethods();
            
            // Периодическая проверка URL
            this.urlCheckInterval = setInterval(() => {
                const currentUrl = window.location.href;
                if (currentUrl !== this.lastUrl) {
                    const newPageType = utils.getPageType(currentUrl);
                    console.log(`🔄 URL изменился: ${this.lastPageType} -> ${newPageType}`);
                    
                    this.lastUrl = currentUrl;
                    this.lastPageType = newPageType;
                    
                    this.handlePageChange(currentUrl, newPageType);
                }
            }, 100);
        }

        overrideHistoryMethods() {
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = function(...args) {
                const result = originalPushState.apply(this, args);
                window.dispatchEvent(new CustomEvent('spa-navigation', {
                    detail: { type: 'pushState', url: window.location.href }
                }));
                return result;
            };

            history.replaceState = function(...args) {
                const result = originalReplaceState.apply(this, args);
                window.dispatchEvent(new CustomEvent('spa-navigation', {
                    detail: { type: 'replaceState', url: window.location.href }
                }));
                return result;
            };

            window.addEventListener('popstate', () => {
                window.dispatchEvent(new CustomEvent('spa-navigation', {
                    detail: { type: 'popstate', url: window.location.href }
                }));
            });

            // Создаем обработчик с правильным контекстом
            this.spaNavigationHandler = (event) => {
                const newUrl = event.detail.url;
                const newPageType = utils.getPageType(newUrl);
                
                if (newUrl !== this.lastUrl) {
                    console.log(`🔄 SPA навигация: ${event.detail.type}, тип: ${newPageType}`);
                    
                    this.lastUrl = newUrl;
                    this.lastPageType = newPageType;
                    
                    this.handlePageChange(newUrl, newPageType);
                }
            };

            window.addEventListener('spa-navigation', this.spaNavigationHandler);
        }

        startDomTracking() {
            // Отслеживаем любые изменения в DOM
            this.mutationObserver = new MutationObserver((mutations) => {
                // Если мы на детальной странице, проверяем содержимое
                if (this.lastPageType === 'detail' && !isProcessing) {
                    const pageId = utils.getPageId(this.lastUrl);
                    if (pageId && pageId === currentPageId) {
                        this.checkDetailPageContent();
                    }
                }
            });

            this.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        handlePageChange(url, pageType) {
            switch(pageType) {
                case 'home':
                    console.log('🏠 Переход на домашнюю страницу');
                    this.handleHomePage();
                    break;
                    
                case 'detail':
                    console.log('📄 Переход на детальную страницу');
                    this.handleDetailPage(url);
                    break;
                    
                default:
                    console.log('➡️ Переход на другую страницу');
                    this.handleOtherPage();
            }
        }

        handleHomePage() {
            // При переходе на домашнюю страницу забываем последнюю детальную страницу
            if (this.lastDetailPageId) {
                console.log(`↩️ Забываем страницу ${this.lastDetailPageId} при переходе на домашнюю`);
                utils.forgetPage(this.lastDetailPageId);
                this.lastDetailPageId = null;
            }
            
            // Сбрасываем состояние
            currentPageId = null;
            currentShipmentType = null;
            isProcessing = false;
        }

        handleDetailPage(url) {
            const pageId = utils.getPageId(url);
            if (!pageId) return;
            
            console.log(`🔍 Детальная страница ID: ${pageId}`);
            
            // Если уходим с одной детальной страницы на другую
            if (this.lastDetailPageId && this.lastDetailPageId !== pageId) {
                console.log(`🔄 Смена детальной страницы: ${this.lastDetailPageId} -> ${pageId}`);
                utils.forgetPage(this.lastDetailPageId);
            }
            
            // Обновляем последнюю детальную страницу
            this.lastDetailPageId = pageId;
            
            // Если это новая страница или мы вернулись с домашней
            if (pageId !== currentPageId) {
                currentPageId = pageId;
                currentShipmentType = null;
                isProcessing = false;
                
                // Начинаем проверку содержимого
                this.checkDetailPageContent();
            }
        }

        handleOtherPage() {
            // Если уходим с детальной страницы на другую - забываем о ней
            if (this.lastDetailPageId) {
                console.log(`🚪 Забываем страницу ${this.lastDetailPageId} при уходе`);
                utils.forgetPage(this.lastDetailPageId);
                this.lastDetailPageId = null;
            }
            
            // На других страницах ничего не делаем
            currentPageId = null;
            currentShipmentType = null;
        }

        async checkDetailPageContent() {
            if (!currentPageId || isProcessing) return;
            
            isProcessing = true;
            console.log(`🔎 Проверка содержимого страницы ${currentPageId}...`);
            
            try {
                // Ждем появление текста
                const shipmentType = await utils.waitForText();
                
                if (shipmentType && shipmentType !== currentShipmentType) {
                    currentShipmentType = shipmentType;
                    
                    // Всегда обрабатываем, если прошло больше 1 секунды с последней обработки
                    if (utils.shouldProcessPage(currentPageId, shipmentType)) {
                        console.log(`🎯 Обнаружено: ${shipmentType.toUpperCase()}`);
                        utils.playNotificationSound(shipmentType);
                        
                        // Отправляем в background script
                        this.sendToBackground(shipmentType);
                    }
                }
            } catch (error) {
                console.error('Ошибка при проверке:', error);
            } finally {
                // Небольшая задержка перед следующей проверкой
                setTimeout(() => {
                    isProcessing = false;
                }, 500);
            }
        }

        sendToBackground(shipmentType) {
            if (chrome.runtime && chrome.runtime.sendMessage) {
                try {
                    chrome.runtime.sendMessage({
                        type: 'SHIPMENT_DETECTED',
                        data: {
                            shipmentType: shipmentType,
                            pageId: currentPageId,
                            url: window.location.href,
                            timestamp: new Date().toISOString()
                        }
                    });
                } catch (e) {
                    // Background script может быть недоступен
                }
            }
        }

        destroy() {
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
            }
            if (this.urlCheckInterval) {
                clearInterval(this.urlCheckInterval);
            }
            if (this.spaNavigationHandler) {
                window.removeEventListener('spa-navigation', this.spaNavigationHandler);
            }
            console.log('👋 GlobalObserver остановлен');
        }
    }

    // Инициализация
    let globalObserver = null;

    function init() {
        console.log('🚀 Инициализация модуля ship.js');
        
        // Всегда создаем наблюдатель, независимо от типа страницы
        if (!globalObserver) {
            globalObserver = new GlobalObserver();
            isInitialized = true;
        }
        
        console.log('✅ Модуль ship.js загружен и готов к работе');
    }

    // Запускаем при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Если страница уже загружена
        setTimeout(init, 500);
    }

    // Обработчик сообщений
    if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'getShipmentInfo') {
                sendResponse({
                    currentPageId: currentPageId,
                    currentShipmentType: currentShipmentType,
                    isInitialized: isInitialized,
                    pageType: utils.getPageType(window.location.href),
                    url: window.location.href,
                    memorySize: processedPages.size,
                    lastDetailPageId: globalObserver ? globalObserver.lastDetailPageId : null
                });
            }
            
            if (message.action === 'forceCheck' && globalObserver) {
                const pageType = utils.getPageType(window.location.href);
                if (pageType === 'detail') {
                    // Принудительно забываем страницу и проверяем заново
                    const pageId = utils.getPageId(window.location.href);
                    if (pageId) {
                        utils.forgetPage(pageId);
                    }
                    globalObserver.checkDetailPageContent();
                }
                sendResponse({ success: true });
            }
            
            if (message.action === 'reset') {
                currentPageId = null;
                currentShipmentType = null;
                utils.clearAllMemory();
                if (globalObserver) {
                    globalObserver.lastDetailPageId = null;
                }
                sendResponse({ 
                    success: true, 
                    message: 'Память очищена'
                });
            }
            
            if (message.action === 'debug') {
                console.log('=== DEBUG INFO ===');
                console.log('Current Page ID:', currentPageId);
                console.log('Current Shipment Type:', currentShipmentType);
                console.log('Is Processing:', isProcessing);
                console.log('Last URL:', window.location.href);
                console.log('Last Detail Page ID:', globalObserver ? globalObserver.lastDetailPageId : null);
                console.log('Memory entries:', Array.from(processedPages.entries()));
                console.log('=== END DEBUG ===');
                sendResponse({ success: true });
            }
        });
    }

    // Глобальный объект для отладки
    window.__ShipmentDetector = {
        version: '3.0',
        getState: () => ({
            currentPageId,
            currentShipmentType,
            isProcessing,
            isInitialized,
            pageType: utils.getPageType(window.location.href),
            processedPages: Array.from(processedPages.entries()),
            memorySize: processedPages.size,
            lastDetailPageId: globalObserver ? globalObserver.lastDetailPageId : null,
            url: window.location.href
        }),
        forceCheck: () => {
            if (globalObserver) {
                const pageType = utils.getPageType(window.location.href);
                if (pageType === 'detail') {
                    // Принудительно забываем и проверяем
                    const pageId = utils.getPageId(window.location.href);
                    if (pageId) {
                        utils.forgetPage(pageId);
                    }
                    globalObserver.checkDetailPageContent();
                }
            }
        },
        clearMemory: () => {
            utils.clearAllMemory();
            if (globalObserver) {
                globalObserver.lastDetailPageId = null;
            }
        },
        simulateNavigation: (url) => {
            // Для тестирования: симулируем навигацию
            history.pushState({}, '', url);
            window.dispatchEvent(new CustomEvent('spa-navigation', {
                detail: { type: 'pushState', url: url }
            }));
        },
        testMarkers: () => {
            console.log('=== ТЕСТ МАРКЕРОВ ===');
            console.log('Avito маркеры:', CONFIG.AVITO_MARKERS);
            console.log('C2C маркеры:', CONFIG.C2C_MARKERS);
            
            const avitoFound = CONFIG.AVITO_MARKERS.some(marker => utils.findExactText(marker));
            const c2cFound = CONFIG.C2C_MARKERS.some(marker => utils.findExactText(marker));
            
            console.log('Найден Avito маркер:', avitoFound);
            console.log('Найден C2C маркер:', c2cFound);
            console.log('=== КОНЕЦ ТЕСТА ===');
            
            return { avitoFound, c2cFound };
        }
    };

})();