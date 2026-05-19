// === Аудио константы ===
const AVITO_AUDIO             = chrome.runtime?.getURL('sounds/avito.mp3');
const LAMODA_AUDIO            = chrome.runtime?.getURL('sounds/lamoda.mp3');
const PLACEMENT_COMPLETE_AUDIO = chrome.runtime?.getURL('sounds/placement_complete.mp3');
const NOOPEN_AUDIO            = chrome.runtime?.getURL('sounds/no_open.mp3');
const CHINA_AUDIO             = chrome.runtime?.getURL('sounds/china.mp3');
const GO_AUDIO                = chrome.runtime?.getURL('sounds/go.mp3');
const ENTERCODE_AUDIO         = chrome.runtime?.getURL('sounds/entercode.mp3');
const OPLATA_AUDIO            = chrome.runtime?.getURL('sounds/oplata.mp3');
const SUCCESS_SHIP_AUDIO      = chrome.runtime?.getURL('sounds/success-ship.mp3');
const CAMERA_AUDIO            = chrome.runtime?.getURL('sounds/camera.mp3');
const POST_PAYMENT_AUDIO      = chrome.runtime?.getURL('sounds/post_payment.mp3');

// === Глобальные переменные ===
let voiceAlertsEnabled       = true;
let placementCompleteEnabled = true;
let goSoundEnabled           = true;
let enterCodeSoundEnabled    = true;
let oplataSoundEnabled       = true;
let successShipSoundEnabled  = true;
let hotkeysEnabled           = true;

let lastPlayTime             = 0;
let lastLamodaPlay           = 0;
let lastPlacementCompletePlay = 0;
let lastNoOpenPlay           = 0;
let lastChinaPlay            = 0;
let lastGoPlay               = 0;
let lastSuccessShipPlay      = 0;
// Удалено: lastRescanPlay, lastEnterCodePlay

let enterCodeSoundPlayed     = false;
let oplataSoundPlayed        = false;
let postPaymentPlayed        = false; // «Оплата при получении» — 1 раз за страницу
let lamodaSoundPlayed        = false;
let codeAcceptedSoundPlayed  = false;
let issuingCellVoiceEnabled  = true;
let _lastCellSpoken          = { number: 0, time: 0 }; // анти-дупликация: номер + время последней озвучки

// Поллер завершения размещения (для React-страниц с отложенной загрузкой)
let placementCompletePoller  = null;

// Отслеживание навигации в SPA
let currentURL = location.href;


// ============================================================
// === Звуковая очередь (SoundQueue) ===
// ============================================================
// Централизованная очередь воспроизведения звуков.
// Все MP3-звуки добавляются в очередь и играют последовательно
// с настраиваемой задержкой между ними, вместо одновременного
// воспроизведения, которое создаёт "кашу" из звуков.
//
// Пример: china.mp3 + oplata.mp3 →
//   china.mp3 ⏸ 300мс ⏸ oplata.mp3
//
// Составные звуки (oplata = success-ship + oplata) добавляются
// через addChain() и гарантированно играют подряд.
// ============================================================

const SoundQueue = {
  queue: [],
  isPlaying: false,
  GAP_MS: 100, // задержка между звуками в очереди (мс)

  /** Добавить один звук в очередь
   *  @param {string|Function} src — URL mp3 или функция осциллятора
   *  @param {Object} options — { volume, speed, label, duration } */
  add(src, options = {}) {
    const { volume = 0.8, speed = 1.0, label = '', duration = 300 } = options;
    const type = typeof src === 'function' ? 'fn' : 'mp3';
    const item = { src, volume, speed, type, label, duration };

    this.queue.push(item);
    console.log(`🔊 Queue: +"${label}" (в очереди: ${this.queue.length}, играет: ${this.isPlaying})`);
    if (!this.isPlaying) this._processNext();
  },

  /** Добавить цепочку звуков (строго по порядку)
   *  @param {Array} items — [{ src, volume, speed, label, duration }] */
  addChain(items) {
    for (const item of items) {
      const { src, volume = 0.8, speed = 1.0, label = '', duration = 300 } = item;
      const type = typeof src === 'function' ? 'fn' : 'mp3';
      const entry = { src, volume, speed, type, label, duration };
      this.queue.push(entry);
    }
    console.log(`🔊 Queue: +chain[${items.length}] (в очереди: ${this.queue.length}, играет: ${this.isPlaying})`);
    if (!this.isPlaying && this.queue.length > 0) this._processNext();
  },

  /** Внутренний метод — обработать следующий звук в очереди */
  _processNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }
    this.isPlaying = true;
    const item = this.queue.shift();
    console.log(`🔊 Queue: ▶ "${item.label}" (осталось: ${this.queue.length})`);

    if (item.type === 'fn') {
      // Осцилляторная функция — выполняем и ждём оценочную длительность
      try { item.src(); } catch (e) { console.warn('Queue fn error:', e); }
      setTimeout(() => this._processNext(), (item.duration || 300) + this.GAP_MS);
    } else {
      // MP3-файл — воспроизводим через new Audio()
      this._playMp3(item);
    }
  },

  /** Воспроизвести MP3 через new Audio() — MEI домена разрешает autoplay */
  _playMp3(item) {
    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      setTimeout(() => this._processNext(), this.GAP_MS);
    };

    try {
      const audio = new Audio(item.src);
      audio.volume = item.volume ?? 0.8;
      if (item.speed && item.speed !== 1.0) {
        audio.playbackRate = item.speed;
      }

      audio.onended = advance;
      audio.onerror = () => {
        console.warn(`Queue play error (${item.label}): audio error`);
        advance();
      };

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(e => {
          console.warn(`Queue play error (${item.label}):`, e.name, e.message);
          advance();
        });
      }

      // Страховка: если onended не сработал (5 сек максимум)
      setTimeout(advance, 5000);
    } catch (e) {
      console.warn(`Queue play error (${item.label}):`, e);
      advance();
    }
  },

  /** Добавить приоритетный звук — ставится в начало очереди,
   *  текущий звук доигрывает до конца, затем приоритетный.
   *  @param {string|Function} src — URL mp3 или функция осциллятора
   *  @param {Object} options — { volume, speed, label, duration } */
  addPriority(src, options = {}) {
    const { volume = 0.8, speed = 1.0, label = '', duration = 300 } = options;
    const type = typeof src === 'function' ? 'fn' : 'mp3';
    const item = { src, volume, speed, type, label, duration };

    this.queue.unshift(item);
    console.log(`🔊 Queue: +priority "${label}" (в очереди: ${this.queue.length}, играет: ${this.isPlaying})`);
    if (!this.isPlaying) this._processNext();
  },

  /** Добавить приоритетную цепочку — вся цепочка ставится в начало очереди */
  addPriorityChain(items) {
    const entries = [];
    for (let i = items.length - 1; i >= 0; i--) {
      const { src, volume = 0.8, speed = 1.0, label = '', duration = 300 } = items[i];
      const type = typeof src === 'function' ? 'fn' : 'mp3';
      const entry = { src, volume, speed, type, label, duration };
      entries.unshift(entry);
      this.queue.unshift(entry);
    }
    console.log(`🔊 Queue: +priorityChain[${items.length}] (в очереди: ${this.queue.length}, играет: ${this.isPlaying})`);
    if (!this.isPlaying) this._processNext();
  },

  /** Очистить очередь (текущий звук доиграет до конца) */
  clear() {
    this.queue = [];
    console.log('🔊 Queue: очищена');
  },

  /** Количество звуков в очереди */
  get pending() { return this.queue.length; }
};


// ============================================================
// === Всплывающие элементы (FadeIn) ===
// ============================================================
// Добавляет плавное появление (fade-in + translateY) новым
// React-элементам при их добавлении в DOM. Управляется
// настройкой fadeInElementsEnabled в chrome.storage.sync.
//
// Фильтры:
//  — Исключаются невидимые узлы (SCRIPT, STYLE, LINK, etc.)
//  — Исключаются слишком глубокие вложенные элементы (> 6 уровней)
//  — Исключаются элементы внутри #modern-custom-nav
//  — Исключаются тултипы, дропдауны и модалки (они уже анимируются)
//  — Исключаются элементы размером < 20px (точки, иконки)
// ============================================================

let fadeInElementsEnabled = true;
let fadeInObserver = null;

// Теги, которые не нужно анимировать
const FADEIN_IGNORE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR',
  'SVG', 'PATH', 'CIRCLE', 'RECT', 'LINE', 'G', 'DEFS',
  'USE', 'CLIPPATH', 'POLYGON', 'POLYLINE'
]);

// Классы/селекторы, которые не нужно анимировать (модалки, тултипы, навбар)
const FADEIN_IGNORE_SELECTORS = [
  '#modern-custom-nav',
  '#modern-custom-nav *',
  '.ReactModal__Overlay',
  '.ReactModal__Content',
  '[role="tooltip"]',
  '[role="dialog"]',
  '[data-testid="overlay"]',
  '.mh-fadein',           // уже анимируется
  '.mod-animate',         // уже анимируется redesign.js
  '.barcode-generator-btn', // наша кнопка этикетки
  '[data-saiko-identification]', // наш виджет идентификации
];

/** Проверяет, нужно ли анимировать элемент */
function shouldFadeIn(el) {
  if (!(el instanceof Element)) return false;
  if (el.nodeType !== 1) return false;

  // Невидимые теги
  const tag = el.tagName;
  if (FADEIN_IGNORE_TAGS.has(tag)) return false;

  // Слишком мелкие элементы (< 20px по любой стороне)
  // Используем offsetWidth/Height — быстрый layout-запрос только для новых элементов
  if (el.offsetWidth < 20 || el.offsetHeight < 20) return false;

  // Исключения по селекторам
  for (const sel of FADEIN_IGNORE_SELECTORS) {
    if (el.matches?.(sel)) return false;
  }

  // Исключаем элементы внутри исключённых контейнеров
  // Проверяем до 4 уровней вверх
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 4) {
    for (const sel of FADEIN_IGNORE_SELECTORS) {
      if (parent.matches?.(sel)) return false;
    }
    parent = parent.parentElement;
    depth++;
  }

  return true;
}

/** Убирает класс анимации и inline-стили после завершения */
function cleanupFadeIn(el) {
  el.classList.remove('mh-fadein');
  el.style.removeProperty('opacity');
  el.style.removeProperty('transform');
}

/** Добавляет класс анимации (элемент уже скрыт через inline opacity:0) */
function applyFadeIn(el) {
  el.classList.add('mh-fadein');
  el.addEventListener('animationend', () => cleanupFadeIn(el), { once: true });
  // Страховка: убираем класс и стили через 600мс даже если animationend не сработал
  setTimeout(() => cleanupFadeIn(el), 600);
}

// ─── Буфер батчинга анимаций ─────────────────────────────────────────────────
// Элементы прячутся (opacity:0) сразу в коллбэке MutationObserver —
// чтобы браузер не успел их отрисовать видимыми.
// Анимация запускается разом в requestAnimationFrame — все элементы
// одного рендер-цикла React всплывают синхронно.
let fadeInBatch = [];
let fadeInRafId = 0;

/** Сбросить буфер: запустить анимации для всех накопленных элементов */
function flushFadeInBatch() {
  const batch = fadeInBatch;
  fadeInBatch = [];
  fadeInRafId = 0;
  for (const el of batch) {
    // Элемент мог быть удалён из DOM пока ждали rAF
    if (el.isConnected) applyFadeIn(el);
  }
}

/** Спрятать элемент и поставить в очередь на анимацию */
function queueFadeIn(el) {
  // Скрываем мгновенно (до ближайшей отрисовки), чтобы не было
  // вспышки «видим → скрыт → анимация». Inline-стиль без !important,
  // поэтому CSS-анимация его переопределит.
  el.style.opacity = '0';
  el.style.transform = 'translateY(12px)';

  fadeInBatch.push(el);
  if (!fadeInRafId) {
    fadeInRafId = requestAnimationFrame(flushFadeInBatch);
  }
}

/** Callback MutationObserver для fadeIn */
function handleFadeInMutations(mutations) {
  if (!fadeInElementsEnabled) return;

  for (const mutation of mutations) {
    if (mutation.type !== 'childList') continue;

    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;

      // Сам элемент
      if (shouldFadeIn(node)) {
        queueFadeIn(node);
      }

      // Дочерние элементы первого уровня (React часто вставляет контейнеры
      // с уже готовыми детьми, и сам контейнер не проходит фильтр по размеру)
      if (node.childNodes?.length > 0 && node.childNodes.length < 20) {
        for (const child of node.childNodes) {
          if (child.nodeType === 1 && shouldFadeIn(child)) {
            queueFadeIn(child);
          }
        }
      }
    }
  }
}

/** Запустить наблюдатель за новыми элементами */
function startFadeInObserver() {
  if (fadeInObserver) return;
  if (!document.body) return;

  fadeInObserver = new MutationObserver(handleFadeInMutations);
  fadeInObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  console.log('[Saiko] FadeIn: наблюдатель запущен');
}

/** Остановить наблюдатель */
function stopFadeInObserver() {
  if (!fadeInObserver) return;
  fadeInObserver.disconnect();
  fadeInObserver = null;
  // Очистить буфер, снять inline-стили с ожидающих элементов и отменить rAF
  for (const el of fadeInBatch) {
    el.style.removeProperty('opacity');
    el.style.removeProperty('transform');
  }
  fadeInBatch = [];
  if (fadeInRafId) {
    cancelAnimationFrame(fadeInRafId);
    fadeInRafId = 0;
  }
  console.log('[Saiko] FadeIn: наблюдатель остановлен');
}

/** Инициализация настройки fadeInElementsEnabled */
function initFadeInSetting() {
  try {
    chrome.storage.sync.get(['fadeInElementsEnabled'], ({ fadeInElementsEnabled: enabled }) => {
      fadeInElementsEnabled = enabled !== false; // по умолчанию включено
      if (fadeInElementsEnabled) startFadeInObserver();
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (!('fadeInElementsEnabled' in changes)) return;
      fadeInElementsEnabled = changes.fadeInElementsEnabled.newValue !== false;
      if (fadeInElementsEnabled) {
        startFadeInObserver();
      } else {
        stopFadeInObserver();
      }
      console.log('[Saiko] FadeIn:', fadeInElementsEnabled ? 'включён' : 'выключен');
    });
  } catch (error) {
    console.error('[Saiko] FadeIn: ошибка инициализации:', error);
  }
}


// ============================================================
// === Инициализация настроек ===
// ============================================================

function initVoiceSettings() {
  try {
    chrome.storage.sync.get(
      ["voiceAlertsEnabled", "placementCompleteEnabled", "issuingCellVoiceEnabled"],
      ({ voiceAlertsEnabled: enabled, placementCompleteEnabled: placementEnabled, issuingCellVoiceEnabled: cellEnabled }) => {
        voiceAlertsEnabled       = !!enabled;
        placementCompleteEnabled = !!placementEnabled;
        issuingCellVoiceEnabled  = cellEnabled !== false;
      }
    );

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.voiceAlertsEnabled) {
        voiceAlertsEnabled = changes.voiceAlertsEnabled.newValue;
        console.log("Озвучка:", voiceAlertsEnabled ? "включена" : "выключена");
      }
      if (changes.placementCompleteEnabled) {
        placementCompleteEnabled = changes.placementCompleteEnabled.newValue;
        console.log("Озвучка завершения приёмки:", placementCompleteEnabled ? "включена" : "выключена");
      }
      if (changes.issuingCellVoiceEnabled) {
        issuingCellVoiceEnabled = changes.issuingCellVoiceEnabled.newValue !== false;
        console.log("Озвучка ячейки выдачи:", issuingCellVoiceEnabled ? "включена" : "выключена");
      }
    });
  } catch (error) {
    console.error("Ошибка при инициализации настроек озвучки:", error);
  }
}


// ============================================================
// === Функции воспроизведения звука (mp3) ===
// ============================================================

function playSound() {
  if (!voiceAlertsEnabled) return;
  const now = Date.now();
  if (now - lastPlayTime < 5000) return;
  lastPlayTime = now;
  if (!AVITO_AUDIO) return;
  SoundQueue.add(AVITO_AUDIO, { label: 'avito' });
}

function playCameraSound() {
  if (!CAMERA_AUDIO) return;
  SoundQueue.add(CAMERA_AUDIO, { label: 'camera' });
}

/** Звук «Ввести код выдачи» — воспроизводится один раз на странице,
 *  останавливается при первом нажатии любой клавиши */
function playEnterCodeSound() {
  if (!enterCodeSoundEnabled) return;
  if (enterCodeSoundPlayed) return;
  enterCodeSoundPlayed = true;

  if (!ENTERCODE_AUDIO) {
    console.warn("ENTERCODE_AUDIO не найден");
    return;
  }

  // Ставим в очередь — воспроизведётся когда AudioContext будет активен
  SoundQueue.add(ENTERCODE_AUDIO, { label: 'entercode', volume: 0.8 });

  const stopOnKey = () => {
    // Очищаем очередь если звук ещё не проигрался
    SoundQueue.clear();
    document.removeEventListener('keydown', stopOnKey);
  };
  document.addEventListener('keydown', stopOnKey, { once: true });

  setTimeout(() => {
    enterCodeSoundPlayed = false;
    document.removeEventListener('keydown', stopOnKey);
  }, 5000);
}

function hasClientRefusedElement() {
  const el = document.querySelector(
    'span[data-i18n-key="features.client-issuing-session:order-card.status.REFUSED"]'
  );
  return el && el.textContent.includes('Клиент отказался');
}

function playLamodaSound() {
  if (!voiceAlertsEnabled) return;
  if (lamodaSoundPlayed) return;
  if (hasClientRefusedElement()) {
    console.log("Lamoda звук отменён: клиент отказался");
    return;
  }
  const now = Date.now();
  if (now - lastLamodaPlay < 3000) return;
  lastLamodaPlay = now;
  lamodaSoundPlayed = true;

  if (!LAMODA_AUDIO) return;
  SoundQueue.add(LAMODA_AUDIO, { label: 'lamoda' });
  setTimeout(() => { lamodaSoundPlayed = false; }, 10000);
}

function playChinaSound() {
  const now = Date.now();
  if (now - lastChinaPlay < 5000) return;
  lastChinaPlay = now;
  if (!CHINA_AUDIO) return;
  SoundQueue.add(CHINA_AUDIO, { label: 'china' });
}

function playNoOpenSound() {
  const now = Date.now();
  if (now - lastNoOpenPlay < 5000) return;
  lastNoOpenPlay = now;
  if (!NOOPEN_AUDIO) return;
  SoundQueue.add(NOOPEN_AUDIO, { label: 'no_open' });
}

function playGoSound() {
  if (!goSoundEnabled) return;
  const now = Date.now();
  if (now - lastGoPlay < 3000) return;
  lastGoPlay = now;
  // Ошибка-бип + go.mp3 играют в очереди по порядку
  SoundQueue.addChain([
    { src: playErrorBeep, duration: 300, label: 'error_beep' },
    { src: GO_AUDIO, label: 'go' }
  ]);
}

function playOplataSound() {
  if (!oplataSoundEnabled) return;
  if (oplataSoundPlayed) return;
  oplataSoundPlayed = true;
  // Обновляем кулдаун success-ship, чтобы он не проигрался повторно
  // из другого триггера прямо после oplata
  lastSuccessShipPlay = Date.now();
  // success-ship + oplata играют в очереди по порядку
  SoundQueue.addChain([
    { src: SUCCESS_SHIP_AUDIO, label: 'success_ship (oplata)' },
    { src: OPLATA_AUDIO, label: 'oplata' }
  ]);
  setTimeout(() => { oplataSoundPlayed = false; }, 10000);
}

/** Звук «Оплата при получении» — вызывается из MAIN world через событие
 *  ИЛИ через DOM-триггер (обнаружение «Терминал / наличные» / «Привязанной картой») */
function playPostPaymentSound() {
  if (!voiceAlertsEnabled) return;
  if (postPaymentPlayed) return;
  postPaymentPlayed = true;
  if (!POST_PAYMENT_AUDIO) return;
  SoundQueue.add(POST_PAYMENT_AUDIO, { label: 'post_payment' });
  setTimeout(() => { postPaymentPlayed = false; }, 10000);
}

function playSuccessBeep() {
  if (!successShipSoundEnabled) return;
  try {
    const now = Date.now();
    if (now - lastSuccessShipPlay < 3000) return;
    lastSuccessShipPlay = now;
    if (!SUCCESS_SHIP_AUDIO) return;
    SoundQueue.add(SUCCESS_SHIP_AUDIO, { label: 'success_ship' });
  } catch (error) {
    console.log('Ошибка в playSuccessBeep:', error);
  }
}

function playPlacementCompleteSound() {
  if (!placementCompleteEnabled) return;
  const now = Date.now();
  if (now - lastPlacementCompletePlay < 5000) return;
  lastPlacementCompletePlay = now;
  if (!PLACEMENT_COMPLETE_AUDIO) return;
  SoundQueue.add(PLACEMENT_COMPLETE_AUDIO, { label: 'placement_complete' });
}


// ============================================================
// === Озвучка ячейки выдачи ===
// ============================================================
// На странице issuing/client-session находит цифру ячейки из элемента
// с data-i18n-key="features.client-issuing-session:order-card.deliver.cell.sub-title"
// и озвучивает её через SoundQueue с приоритетом.
// Воспроизводится ровно 1 раз за страницу, не повторяется.
// ============================================================

/** Строит последовательность MP3-файлов для озвучки числа ячейки.
 *  Если есть готовый файл (N.mp3) — использует его напрямую.
 *  Иначе — разбирает на имеющиеся компоненты (сотни + десятки + единицы). */
function buildCellNumberSequence(num) {
  const MP3_PATH = 'sounds/num/';
  const url = n => chrome.runtime.getURL(`${MP3_PATH}${n}.mp3`);

  // Доступные числа: 1–144, 200, 300, 400
  const AVAILABLE = new Set();
  for (let i = 1; i <= 144; i++) AVAILABLE.add(i);
  AVAILABLE.add(200);
  AVAILABLE.add(300);
  AVAILABLE.add(400);

  // Прямой файл есть — используем сразу
  if (AVAILABLE.has(num)) return [url(num)];

  // Иначе — разбираем на компоненты
  const out = [];
  const hundreds = Math.floor(num / 100) * 100;
  const remainder = num - hundreds;

  if (hundreds > 0) {
    if (AVAILABLE.has(hundreds)) {
      out.push(url(hundreds));
    } else {
      // Сотни выше 400 — по цифрам
      for (const d of String(Math.floor(num / 100))) out.push(url(parseInt(d)));
    }
  }

  if (remainder > 0) {
    out.push(...buildCellNumberSequence(remainder));
  }

  // Если ничего не собрали (число = 0 или ошибочное) — по цифрам
  if (out.length === 0 && num > 0) {
    for (const d of String(num).split('')) out.push(url(parseInt(d)));
  }

  return out;
}

/** Найти и озвучить ячейку выдачи (только 1 раз за страницу) */
function trySpeakIssuingCell(rootNode) {
  if (!issuingCellVoiceEnabled) return;

  // Проверяем что мы на странице issuing/client-session
  if (!/\/issuing\/client-session\//.test(location.pathname)) return;

  // Ищем элемент "Ячейка" — span с data-i18n-key
  const cellKey = 'features.client-issuing-session:order-card.deliver.cell.sub-title';
  const cellLabel = rootNode.matches?.(`[data-i18n-key="${cellKey}"]`)
    ? rootNode
    : rootNode.querySelector?.(`[data-i18n-key="${cellKey}"]`);

  if (!cellLabel) return;

  // Цифра ячейки — предыдущий sibling span в том же родителе
  // Структура: <div ...> <span style="font-weight:700">112</span> <span data-i18n-key="...">Ячейка</span> </div>
  const cellContainer = cellLabel.parentElement;
  if (!cellContainer) return;

  // Ищем span с цифрой — предыдущий sibling перед span[data-i18n-key]
  let numberSpan = cellLabel.previousElementSibling;
  // Если "Ячейка" обёрнут в лишний span, поднимаемся на уровень выше
  if (!numberSpan && cellContainer.parentElement) {
    numberSpan = cellContainer.previousElementSibling;
  }

  if (!numberSpan) return;

  const cellNumber = parseInt(numberSpan.textContent.trim(), 10);
  if (isNaN(cellNumber) || cellNumber <= 0) return;

  // Анти-дупликация: не озвучивать тот же номер ячейки в течение 5 секунд
  const now = Date.now();
  if (_lastCellSpoken.number === cellNumber && now - _lastCellSpoken.time < 5000) return;
  _lastCellSpoken = { number: cellNumber, time: now };

  console.log(`[Saiko] Озвучка ячейки выдачи: ${cellNumber}`);

  const sequence = buildCellNumberSequence(cellNumber);
  // Приоритетная цепочка: только число ячейки
  const chain = [];
  for (let i = 0; i < sequence.length; i++) {
    chain.push({ src: sequence[i], label: `cell_${i}` });
  }

  SoundQueue.addPriorityChain(chain);
}


// ============================================================
// === Осцилляторные звуки ===
// ============================================================

function playErrorBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    _oscBeep(ctx, 0,   223.25);
    _oscBeep(ctx, 0.1,  89.25);
    _oscBeep(ctx, 0.2,  46.99);
  } catch (e) { console.log('Ошибка в playErrorBeep:', e); }
}

function playEnterCodeBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    _oscBeep(ctx, 0,    459.25);
    _oscBeep(ctx, 0.03, 459.25);
  } catch (e) { console.log('Ошибка в playEnterCodeBeep:', e); }
}

function playCodeBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    _oscBeep(ctx, 0,    459.25);
    _oscBeep(ctx, 0.03, 459.25);
  } catch (e) { console.log('Ошибка в playCodeBeep:', e); }
}

/** Вспомогательная — создаёт один осцилляторный бип */
function _oscBeep(ctx, startTime, freq, gainPeak = 0.5) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
  gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
  gain.gain.linearRampToValueAtTime(gainPeak,  ctx.currentTime + startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + startTime + 0.08);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime  + startTime + 0.1);
}

/** Звук сканирования ячейки — используется в handleCellAssignment */
function playScanBeep() {
  try {
    if (!window.scanAudioContext) {
      window.scanAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = window.scanAudioContext;
    const resume = () => {
      _scanBeepSeq(ctx);
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(resume).catch(e => console.log('AudioContext resume failed:', e));
    } else {
      resume();
    }
  } catch (e) { console.log('Ошибка playScanBeep:', e); }
}

function _scanBeepSeq(ctx) {
  _flatBeep(ctx, 0,   550);
  _flatBeep(ctx, 0,   100);
  _flatBeep(ctx, 0.1, 550);
  _flatBeep(ctx, 0.1, 100);
}

function _flatBeep(ctx, startTime, freq) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
  gain.gain.setValueAtTime(0,     ctx.currentTime + startTime);
  gain.gain.linearRampToValueAtTime(0.225, ctx.currentTime + startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0,     ctx.currentTime + startTime + 0.05);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime  + startTime + 0.08);
}

/** Звук нажатия кнопки печати */
function playPrintButtonSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    _rampBeep(ctx, 0,    50);
    _rampBeep(ctx, 0.1,  90);
    _rampBeep(ctx, 0.2, 110);
    _rampBeep(ctx, 0.3, 130);
  } catch (e) { console.log('Ошибка playPrintButtonSound:', e); }
}

function _rampBeep(ctx, startTime, freq) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
  gain.gain.setValueAtTime(0,     ctx.currentTime + startTime);
  gain.gain.linearRampToValueAtTime(0.225, ctx.currentTime + startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0,     ctx.currentTime + startTime + 0.05);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime  + startTime + 0.08);
}

/** Звук печати — вызывается из printIframe/createPrintIframe */
function playPrintSound() {
  try {
    if (!window.printAudioContext) {
      window.printAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = window.printAudioContext;
    const play = () => {
      _rampBeep(ctx, 0,    330);
      _rampBeep(ctx, 0.05, 140);
    };
    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(e => console.log('printAudioContext resume failed:', e));
    } else {
      play();
    }
  } catch (e) { console.log('Ошибка playPrintSound:', e); }
}


// ============================================================
// === Горячие клавиши ===
// ============================================================

let rAltPressed = false;
let ePressed    = false;

function handleHotkeys(e) {
  if (e.code === 'AltRight') { rAltPressed = true; return; }

  if (rAltPressed && e.code === 'KeyY') {
    e.preventDefault(); e.stopPropagation();
    playSuccessBeep();
    return;
  }
  if (rAltPressed && e.code === 'KeyE') {
    ePressed = true;
    return;
  }
  if (rAltPressed && ePressed && e.code === 'KeyR') {
    e.preventDefault(); e.stopPropagation();
    playCodeBeep();
    ePressed = false;
  }
}

function handleKeyUp(e) {
  if (e.code === 'AltRight') { rAltPressed = false; ePressed = false; }
  if (e.code === 'KeyE')     { ePressed = false; }
}

function initHotkeys() {
  if (!hotkeysEnabled) return;
  document.addEventListener('keydown', handleHotkeys, true);
  document.addEventListener('keyup',   handleKeyUp,   true);
  console.log("Горячие клавиши инициализированы");
}


// ============================================================
// === Виджет идентификации клиента ===
// ============================================================

function createIdentificationWidget() {
  if (document.querySelector('[data-saiko-identification]')) return;

  const pageKey  = "identification_checked_" + window.location.pathname;
  const soundKey = "identification_sound_used_" + window.location.pathname;

  const container = document.createElement('div');
  container.setAttribute('data-saiko-identification', 'true');
  Object.assign(container.style, {
    display: 'flex', alignItems: 'center', gap: '18px',
    padding: '18px', border: '2px solid #ff6b6b', borderRadius: '12px',
    width: '100%', boxSizing: 'border-box', fontFamily: 'sans-serif',
    cursor: 'pointer', userSelect: 'none', transition: 'opacity 0.2s ease',
  });

  /* Чекбокс */
  const checkbox = document.createElement('div');
  Object.assign(checkbox.style, { width: '20px', height: '20px', position: 'relative', flexShrink: '0', cursor: 'pointer' });

  const checkboxBg = document.createElement('div');
  Object.assign(checkboxBg.style, { width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#cccccc' });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  Object.assign(svg.style, { width: '20px', height: '20px', position: 'absolute', inset: '0', display: 'none' });
  svg.innerHTML = `<path fill="#476c21" fill-rule="evenodd" clip-rule="evenodd"
    d="M12 2C9.34784 2 6.8043 3.05357 4.92893 4.92893C3.05357 6.8043 2 9.34784 2 12C2 14.6522 3.05357
       17.1957 4.92893 19.0711C6.8043 20.9464 9.34784 22 12 22C14.6522 22 17.1957 20.9464 19.0711
       19.0711C20.9464 17.1957 22 14.6522 22 12C22 9.34784 20.9464 6.8043 19.0711 4.92893C17.1957
       3.05357 14.6522 2 12 2ZM11 16.5L17.5 10L16 8.5L11.0105 13.5L8 10.5L6.5 12L11 16.5Z"/>`;

  checkbox.appendChild(checkboxBg);
  checkbox.appendChild(svg);

  /* Текст */
  const textContainer = document.createElement('div');
  Object.assign(textContainer.style, { display: 'flex', flexDirection: 'column', gap: '6px', flexGrow: '1', pointerEvents: 'none' });

  const title = document.createElement('span');
  title.textContent = 'Идентификация клиента';
  Object.assign(title.style, { fontWeight: '800', fontSize: '21px', color: '#000' });

  const desc = document.createElement('span');
  desc.textContent = 'Если заказ с оплатой при получении, и его сумма больше или равна 10 000 рублей, пожалуйста, проведите идентификацию';
  Object.assign(desc.style, { fontSize: '14px', fontWeight: '100', color: '#2b2b2b' });

  textContainer.appendChild(title);
  textContainer.appendChild(desc);
  container.appendChild(checkbox);
  container.appendChild(textContainer);

  /* Состояние */
  let checked = localStorage.getItem(pageKey) === 'true';

  const applyChecked = () => {
    svg.style.display = 'block';
    checkboxBg.style.display = 'none';
    container.style.borderColor = '#e1e1e1';
    title.textContent = 'Клиент идентифицирован';
    desc.textContent  = 'Можете выдать посылку, поскольку вы уже проверили клиента';
  };
  const applyUnchecked = () => {
    svg.style.display = 'none';
    checkboxBg.style.display = 'block';
    container.style.borderColor = '#ff6b6b';
    title.textContent = 'Идентификация клиента';
    desc.textContent  = 'Если заказ с оплатой при получении, и его сумма больше или равна 10 000 рублей, пожалуйста, проведите идентификацию';
  };
  const fade = (fn) => {
    container.style.opacity = '0';
    setTimeout(() => { fn(); container.style.opacity = '1'; }, 100);
  };

  checked ? applyChecked() : applyUnchecked();

  /* События */
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    if (checked) return;
    fade(() => { checked = true; applyChecked(); localStorage.setItem(pageKey, 'true'); playSuccessBeep(); });
  });
  checkbox.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!checked) return;
    fade(() => { checked = false; applyUnchecked(); localStorage.setItem(pageKey, 'false'); localStorage.removeItem(soundKey); });
  });
  container.addEventListener('click', () => {
    if (localStorage.getItem(soundKey) === 'true') return;
    playCameraSound();
    localStorage.setItem(soundKey, 'true');
  });

  return container;
}

function injectIdentificationWidget() {
  if (document.querySelector('[data-saiko-identification]')) return;

  const findTarget = () => {
    const candidates = document.querySelectorAll('span, div');
    return Array.from(candidates).find(el => {
      const t = el.textContent.trim();
      return t === "Терминал / наличные" || t === "Привязанной картой";
    });
  };

  const doInject = () => {
    const targetSpan = document.querySelector('span.mez-font-ys-text.mez-text-m-body1');
    if (!targetSpan?.parentElement) return false;
    const widget = createIdentificationWidget();
    if (widget?.nodeType === Node.ELEMENT_NODE) {
      targetSpan.parentElement.appendChild(widget);
      console.log('[Saiko] Identification widget injected');
      return true;
    }
    console.warn('[Saiko] Failed to create identification widget');
    return false;
  };

  if (findTarget()) { doInject(); return; }

  const obs = new MutationObserver((_, o) => {
    if (findTarget()) { doInject(); o.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}


// ============================================================
// === Обработка триггеров озвучки ===
// ============================================================

function isLamodaCode(text) {
  const code = text.trim().toUpperCase();
  return code.startsWith("BP") || code.startsWith("SP");
}

function containsAvitoText(text) {
  return text.includes("По правилам Авито получатель может проверить");
}

/**
 * Проверяет узел и его поддерево на наличие звуковых триггеров.
 *
 * УЛУЧШЕНИЯ:
 * - используется textContent (работает без layout, надёжнее в React)
 * - поиск идёт и по самому узлу, и по вложенным элементам (querySelector)
 * - все триггеры (оплата, код принят, кнопка ввода) объединены здесь
 * - дополнительное наблюдение characterData позволяет ловить React-обновления текста
 */
/** Возвращает листовые элементы (без дочерних) внутри node (включая сам node).
 *  Используется для точечного поиска текста без ложных срабатываний
 *  от контейнерных узлов, чей textContent суммирует всё поддерево. */
function leafElements(node) {
  const results = [];
  if (node.nodeType !== 1) return results;
  if (node.childElementCount === 0) { results.push(node); return results; }
  node.querySelectorAll?.('span, p, div, td, li').forEach(el => {
    if (el.childElementCount === 0) results.push(el);
  });
  return results;
}

function checkNodeForTriggers(node) {
  if (node.nodeType !== 1) return;

  const isIssuingPage = document.title === "Выдача клиентского заказа";

  /** Возвращает первый элемент с указанным data-i18n-key внутри (или сам узел) */
  const findByKey = (root, key) => {
    if (root.matches?.(`[data-i18n-key="${key}"]`)) return root;
    return root.querySelector?.(`[data-i18n-key="${key}"]`) ?? null;
  };

  if (isIssuingPage) {
    // --- Озвучка ячейки выдачи (приоритет, 1 раз) ---
    trySpeakIssuingCell(node);

    // --- Avito (проверяем права получателя) ---
    // Используем leafElements — контейнерный node.textContent включает текст
    // всего поддерева и вызывает ложные срабатывания на заказах других служб.
    for (const el of leafElements(node)) {
      if (!el.hasAttribute("data-avito-played") && containsAvitoText(el.textContent)) {
        playSound();
        el.setAttribute("data-avito-played", "true");
        break;
      }
    }

    // --- Lamoda (по префиксу трек-кода) ---
    const lamodaSpans = node.matches?.('span.mez-font-ys-text')
      ? [node]
      : Array.from(node.querySelectorAll?.('span.mez-font-ys-text') ?? []);
    for (const el of lamodaSpans) {
      if (!el.hasAttribute("data-lamoda-played") && isLamodaCode(el.textContent)) {
        playLamodaSound();
        el.setAttribute("data-lamoda-played", "true");
        break;
      }
    }

    // --- Выдача без вскрытия ---
    // Проверяем только листовые элементы (childElementCount === 0), чтобы
    // контейнерные узлы (div/article с кучей дочерних элементов) не давали
    // ложных срабатываний через накопленный textContent поддерева.
    for (const el of leafElements(node)) {
      if (!el.hasAttribute("data-noopen-played") && el.textContent.includes("Не вскрывать транспортную упаковку")) {
        playNoOpenSound();
        el.setAttribute("data-noopen-played", "true");
        break;
      }
    }

    // --- Зарубежные посылки (нельзя вскрывать) ---
    for (const el of leafElements(node)) {
      if (!el.hasAttribute("data-china-played") && el.textContent.includes("Из-за рубежа, нельзя вскрывать")) {
        playChinaSound();
        el.setAttribute("data-china-played", "true");
        break;
      }
    }

    // --- Оплата при получении (COD) ---
    // Определяем по DOM: «Терминал / наличные» или «Привязанной картой»
    // означает что заказ с оплатой при получении — проигрываем post_payment.mp3
    for (const el of leafElements(node)) {
      const t = el.textContent.trim();
      if (!el.hasAttribute("data-postpayment-played") &&
          (t === "Терминал / наличные" || t === "Привязанной картой")) {
        playPostPaymentSound();
        el.setAttribute("data-postpayment-played", "true");
        break;
      }
    }

    // --- Оплата прошла успешно ---
    const paymentEl = findByKey(node, 'features.client-issuing-session:session-notification.PAYMENT_SUCCESS.title');
    if (paymentEl && !paymentEl.hasAttribute("data-payment-played")) {
      paymentEl.setAttribute("data-payment-played", "true");
      playOplataSound();
    }

    // --- Код принят ---
    const codeKey = 'features.client-issuing-session:order-card.avito-verification.verified';
    const codeEl  = findByKey(node, codeKey);
    if (codeEl && codeEl.textContent.includes('Код принят') && !codeEl.hasAttribute("data-code-played")) {
      codeEl.setAttribute("data-code-played", "true");
      playSuccessBeep();
    }

    // Кнопка «Ввести код выдачи» — обработка через делегирование в setupEnterCodeDelegation()
  }
}

/** Начальное сканирование DOM (для элементов, уже присутствующих на странице) */
function initialTriggerScan() {
  if (document.title !== "Выдача клиентского заказа") return;

  // Озвучка ячейки выдачи (приоритет, 1 раз)
  if (document.body) trySpeakIssuingCell(document.body);

  // Avito — только листовые элементы, иначе срабатывает на контейнерах
  document.querySelectorAll('span, p, div, td, li').forEach(el => {
    if (el.childElementCount === 0 && !el.hasAttribute("data-avito-played") && containsAvitoText(el.textContent)) {
      playSound();
      el.setAttribute("data-avito-played", "true");
    }
  });

  // Lamoda
  document.querySelectorAll('span.mez-font-ys-text').forEach(el => {
    if (!el.hasAttribute("data-lamoda-played") && isLamodaCode(el.textContent)) {
      playLamodaSound();
      el.setAttribute("data-lamoda-played", "true");
    }
  });

  // Оплата
  document.querySelectorAll('[data-i18n-key="features.client-issuing-session:session-notification.PAYMENT_SUCCESS.title"]').forEach(el => {
    if (!el.hasAttribute("data-payment-played")) {
      el.setAttribute("data-payment-played", "true");
      playOplataSound();
    }
  });

  // Код принят
  document.querySelectorAll('[data-i18n-key="features.client-issuing-session:order-card.avito-verification.verified"]').forEach(el => {
    if (el.textContent.includes('Код принят') && !el.hasAttribute("data-code-played")) {
      el.setAttribute("data-code-played", "true");
      playSuccessBeep();
    }
  });

  // Кнопка «Ввести код выдачи» — обрабатывается делегированием (setupEnterCodeDelegation)

  // Без вскрытия — только листовые элементы
  document.querySelectorAll('span, p, div, td, li').forEach(el => {
    if (el.childElementCount === 0 && !el.hasAttribute("data-noopen-played") && el.textContent.includes("Не вскрывать транспортную упаковку")) {
      playNoOpenSound();
      el.setAttribute("data-noopen-played", "true");
    }
  });

  // Зарубежные посылки (нельзя вскрывать) — только листовые элементы
  document.querySelectorAll('span, p, div, td, li').forEach(el => {
    if (el.childElementCount === 0 && !el.hasAttribute("data-china-played") && el.textContent.includes("Из-за рубежа, нельзя вскрывать")) {
      playChinaSound();
      el.setAttribute("data-china-played", "true");
    }
  });

  // Оплата при получении (COD) — «Терминал / наличные» или «Привязанной картой»
  document.querySelectorAll('span, p, div, td, li').forEach(el => {
    const t = el.textContent.trim();
    if (el.childElementCount === 0 && !el.hasAttribute("data-postpayment-played") &&
        (t === "Терминал / наличные" || t === "Привязанной картой")) {
      playPostPaymentSound();
      el.setAttribute("data-postpayment-played", "true");
    }
  });
}


// ============================================================
// === Мониторинг завершения размещения (React-совместимый) ===
// ============================================================
//
// Проблема: React-страница «Размещение» подгружает список заказов
// асинхронно. Если ориентироваться только на MutationObserver,
// к моменту добавления узла текст «Отлично! Все заказы на месте»
// ещё может не появиться.
//
// Решение: параллельный поллинг с интервалом 800 мс, который
// проверяет элемент уже после полной отрисовки React.
// ============================================================

function startPlacementPoller() {
  if (placementCompletePoller) return;
  console.log("[Saiko] Запуск поллера завершения размещения");

  placementCompletePoller = setInterval(() => {
    if (!document.title.includes("Размещение")) {
      stopPlacementPoller();
      return;
    }
    checkPlacementComplete();
  }, 800);
}

function stopPlacementPoller() {
  if (!placementCompletePoller) return;
  clearInterval(placementCompletePoller);
  placementCompletePoller = null;
  console.log("[Saiko] Поллер завершения размещения остановлен");
}

function checkPlacementComplete() {
  const el = document.querySelector('span[data-i18n-key="pages.cargo-placement:empty-state"]');
  if (
    el &&
    el.textContent.trim() === "Отлично! Все заказы на месте" &&
    !el.hasAttribute("data-placement-checked")
  ) {
    el.setAttribute("data-placement-checked", "true");
    console.log("[Saiko] Завершение размещения обнаружено, воспроизводим звук");
    playPlacementCompleteSound();
  }
}


// ============================================================
// === Обработчик пятизначных кодов (страница выдачи) ===
// ============================================================

function setupFiveDigitInputHandler() {
  const input = document.querySelector('input[data-testid="client-issuing-search-suggest"]');
  if (!input || input.dataset.fiveDigitListenerAdded) return;
  input.dataset.fiveDigitListenerAdded = "true";

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const code = input.value.trim();
    if (/^\d{5}$/.test(code)) {
      console.log("Пятизначная комбинация, воспроизводим go.mp3");
      playGoSound();
      setTimeout(() => {
        input.value = "";
        ['input', 'change', 'keyup'].forEach(type =>
          input.dispatchEvent(new Event(type, { bubbles: true }))
        );
      }, 100);
    }
  });
  console.log("Добавлен обработчик пятизначных кодов");
}


// ============================================================
// === Назначение ячеек (страница размещения) ===
// ============================================================

function handleCellAssignment(e) {
  if (!/\/tpl-outlet\/\d{8}\/placement/.test(window.location.href)) return;
  if (e.key !== "\\") return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  playScanBeep();

  const allInputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
  allInputs.forEach(inp => {
    inp.setAttribute('readonly', 'true');
    inp.style.pointerEvents = 'none';
    inp.style.backgroundColor = '#f0f0f0';
  });

  const dropdownTrigger = document.querySelector('[class*="mez-bg-forestGreen-70"]');
  if (!dropdownTrigger) {
    console.log("Dropdown не найден");
    restoreInputs(allInputs);
    return;
  }
  dropdownTrigger.click();

  let cellInput = "";

  const handleCellInput = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    if (ev.key === "\\") return;

    if (ev.key >= '0' && ev.key <= '9' && cellInput.length < 3) {
      cellInput += ev.key;
      console.log("Ввод ячейки:", cellInput);
      if (cellInput.length === 3) {
        cleanupCellHandler(handleCellInput, allInputs);
        findAndSelectCell(cellInput);
      }
    } else if (ev.key === 'Escape') {
      cleanupCellHandler(handleCellInput, allInputs);
      console.log("Назначение ячейки отменено");
    }
  };

  document.addEventListener('keydown', handleCellInput, true);
}

function cleanupCellHandler(handler, inputs) {
  document.removeEventListener('keydown', handler, true);
  restoreInputs(inputs);
}

function restoreInputs(inputs) {
  inputs.forEach(inp => {
    inp.removeAttribute('readonly');
    inp.style.pointerEvents  = '';
    inp.style.backgroundColor = '';
  });
}

function findAndSelectCell(cellNumber) {
  console.log("Ищем ячейку:", cellNumber);
  setTimeout(() => {
    let option = document.querySelector(`li[data-value="${cellNumber}"]`);

    if (!option) {
      for (const span of document.querySelectorAll('span.mez-font-ys-text')) {
        if (span.textContent.trim() === cellNumber) { option = span.closest('li'); break; }
      }
    }
    if (!option) {
      for (const li of document.querySelectorAll('li')) {
        if (li.textContent.trim() === cellNumber) { option = li; break; }
      }
    }

    if (option) {
      option.click();
      console.log("Ячейка назначена:", cellNumber);
    } else {
      console.log("Ячейка", cellNumber, "не найдена");
    }
  }, 300);
}

// ============================================================
// === Делегированный обработчик кнопки «Ввести код выдачи» ===
// ============================================================
//
// Проблемы предыдущего подхода (addEventListener на каждую кнопку):
//   • querySelector находил только первую из N кнопок на странице
//   • если React добавлял голый span (без родителя-button в момент вставки),
//     closest('button') возвращал null — слушатель не цеплялся вообще
//
// Решение: один слушатель на document (capture-фаза), который проверяет
// любой клик — нажата ли кнопка с нужным data-i18n-key внутри.
// Работает для любого числа карточек, не зависит от порядка добавления.
// Одноразовость звука гарантирует флаг enterCodeSoundPlayed в playEnterCodeSound().
// ============================================================

const ENTER_CODE_KEY = 'features.client-issuing-session:order-card.avito-verification.btn';

function setupEnterCodeDelegation() {
  // Вешаем один раз — защита от повторного вызова
  if (window.__enterCodeDelegationActive) return;
  window.__enterCodeDelegationActive = true;

  document.addEventListener('click', (e) => {
    if (document.title !== 'Выдача клиентского заказа') return;

    // Ищем ближайшую кнопку от места клика
    const btn = e.target.closest('button');
    if (!btn) return;

    // Проверяем, есть ли внутри кнопки нужный span (или она сама им является)
    const hasKey =
      btn.matches(`[data-i18n-key="${ENTER_CODE_KEY}"]`) ||
      btn.querySelector(`[data-i18n-key="${ENTER_CODE_KEY}"]`);

    if (hasKey) {
      console.log("[Saiko] Кнопка 'Ввести код выдачи' нажата (делегирование)");
      playEnterCodeSound();
    }
  }, true); // capture = перехватываем до React-обработчиков

  console.log("[Saiko] Делегирование 'Ввести код выдачи' установлено");
}

function initEventListeners() {
  document.addEventListener("keydown", handleCellAssignment, true);
  setupEnterCodeDelegation();
}


// ============================================================
// === Система генерации и печати этикеток 50×80 мм ===
// (не изменялась — работает исправно)
// ============================================================

const LABEL_CONFIG = { width: 50, height: 80, outletId: '55948606' };
const CARGO_REGEX  = /^[A-Za-z0-9\-_]{6,}/;
const ROW_SELECTOR = 'tr';

// Делегирование клика по кнопке
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.barcode-generator-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  createAndPrintLabel(btn.dataset.cargo);
});

function processRow(row) {
  if (!row || row.nodeType !== 1) return;
  if (row.dataset.barcodeProcessed) return;
  const cells = row.querySelectorAll('td');
  if (!cells.length) return;
  for (const cell of cells) {
    const cargo = extractCargoNumber(cell);
    if (!cargo) continue;
    addButtonToCell(cell, cargo);
    row.dataset.barcodeProcessed = '1';
    break;
  }
}

function extractCargoNumber(cell) {
  for (const unit of cell.querySelectorAll('[class*="unit"]')) {
    const m = unit.textContent.trim().match(CARGO_REGEX);
    if (m) return m[0];
  }
  const m = cell.textContent.trim().match(CARGO_REGEX);
  return m ? m[0] : null;
}

function styleCargoText(textDiv) {
  if (!textDiv) return;
  const raw = textDiv.textContent.trim();
  if (!raw) return;
  const suffixMatch = raw.match(/-(\d+)$/);
  let normalPart, highlightPart;
  if (suffixMatch) {
    const suffix   = suffixMatch[0];
    const mainText = raw.slice(0, -suffix.length);
    normalPart     = mainText.slice(0, -4);
    highlightPart  = mainText.slice(-4) + suffix;
  } else {
    normalPart    = raw.slice(0, -4);
    highlightPart = raw.slice(-4);
  }
  textDiv.innerHTML = `
    <span style="display:inline;white-space:nowrap;font-weight:normal;">
      <span style="color:#343434;font-size:16px;">${normalPart}</span>
      <span style="color:#000000;font-weight:bold;font-size:20px;">${highlightPart}</span>
    </span>`;
}

function addButtonToCell(cell, cargoNumber) {
  if (cell.querySelector('.barcode-generator-btn')) return;
  const container = cell.querySelector('div[data-box="true"]');
  if (!container) return;

  container.style.display       = 'flex';
  container.style.flexDirection = 'row';
  container.style.alignItems    = 'center';
  container.style.justifyContent = 'flex-start';
  container.style.gap           = '6px';

  const button = document.createElement('button');
  button.className      = 'barcode-generator-btn';
  button.title          = 'Сгенерировать штрихкод';
  button.type           = 'button';
  button.dataset.cargo  = cargoNumber;

  Object.assign(button.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '32px', height: '32px', background: '#ff5149',
    border: 'none', borderRadius: '8px', cursor: 'pointer', flexShrink: '0',
    boxShadow: '0 2px 4px rgba(255,81,73,0.2)', marginRight: '6px',
    transition: 'all 0.2s ease', padding: '0', outline: 'none',
  });

  button.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 20h1m-4 0h-2v-3m3 0h3v-3h-1m-5 0h2M4 17c0-.932 0-1.398.152-1.766a2 2 0 0 1 1.082-1.082C5.602
        14 6.068 14 7 14s1.398 0 1.766.152c.49.203.879.592 1.082 1.082c.152.368.152.834.152 1.766s0 1.398-.152
        1.765a2 2 0 0 1-1.082 1.083C8.398 20 7.932 20 7 20s-1.398 0-1.766-.152a1.999 1.999 0 0 1-1.082-1.082C4
        18.398 4 17.932 4 17M14 7c0-.932 0-1.398.152-1.766a2 2 0 0 1 1.082-1.082C15.602 4 16.068 4 17 4s1.398 0
        1.766.152c.49.203.879.592 1.082 1.082C20 5.602 20 6.068 20 7s0 1.398-.152 1.765a2 2 0 0 1-1.082
        1.083C18.398 10 17.932 10 17 10s-1.398 0-1.766-.152a1.999 1.999 0 0 1-1.082-1.082C14 8.398 14 7.932
        14 7M4 7c0-.932 0-1.398.152-1.766a2 2 0 0 1 1.082-1.082C5.602 4 6.068 4 7 4s1.398 0 1.766.152c.49.203.879.592
        1.082 1.082C10 5.602 10 6.068 10 7s0 1.398-.152 1.765a2 2 0 0 1-1.082 1.083C8.398 10 7.932 10 7 10s-1.398
        0-1.766-.152a1.999 1.999 0 0 1-1.082-1.082C4 8.398 4 7.932 4 7"
        stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;

  button.addEventListener('mouseenter', () => {
    button.style.background  = '#ff3b30';
    button.style.transform   = 'translateY(-1px)';
    button.style.boxShadow   = '0 4px 8px rgba(255,81,73,0.3)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background  = '#ff5149';
    button.style.transform   = 'translateY(0)';
    button.style.boxShadow   = '0 2px 4px rgba(255,81,73,0.2)';
  });
  button.addEventListener('mousedown', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
  });
  button.addEventListener('mouseup', () => {
    button.style.transform = 'translateY(-1px)';
    button.style.boxShadow = '0 4px 8px rgba(255,81,73,0.3)';
  });

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    let cargoNum = button.dataset.cargo;
    if (!cargoNum || cargoNum === 'undefined') {
      const textDiv = Array.from(container.querySelectorAll('[class*="unit"]'))
        .find(d => d.textContent.trim().match(/[A-Za-z0-9\-_]+/));
      if (textDiv) {
        const tmp = document.createElement('div');
        tmp.innerHTML = textDiv.innerHTML;
        cargoNum = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
        button.dataset.cargo = cargoNum;
      }
    }

    if (cargoNum && cargoNum.length > 0) {
      console.log('Генерация этикетки:', cargoNum);
      playPrintButtonSound();
      const origInner = button.innerHTML;
      button.textContent = '...';
      button.style.background = '#ff9800';
      setTimeout(() => {
        generatePDFWithQR(cargoNum);
        setTimeout(() => {
          button.innerHTML = origInner;
          button.style.background = '#dcdcdc';
        }, 1000);
      }, 300);
    } else {
      console.error('Не удалось определить номер груза');
      playErrorBeep();
      button.style.background = '#f44336';
      setTimeout(() => { button.style.background = '#dcdcdc'; }, 500);
    }
  });

  container.insertBefore(button, container.firstChild);

  const textDiv = Array.from(container.querySelectorAll('[class*="unit"]'))
    .find(d => d.textContent.trim().match(/[A-Za-z0-9\-_]+/));
  if (textDiv) styleCargoText(textDiv);
}

function initBarcodeButtons() {
  document.querySelectorAll(ROW_SELECTOR).forEach(processRow);
}

function loadImageAsDataURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = url;
    setTimeout(() => reject(new Error('Таймаут загрузки изображения')), 5000);
  });
}

function generatePDFWithQR(cargoNumber) {
  const baseURL     = 'https://quickchart.io/barcode';
  const encodedText = encodeURIComponent(cargoNumber);
  const dmURLs = [
    `${baseURL}?text=${encodedText}&type=datamatrix&size=90&margin=0`,
    `${baseURL}?text=${encodedText}&type=datamatrix&size=90&margin=0&rotation=90`,
    `${baseURL}?text=${encodedText}&type=datamatrix&size=90&margin=0&rotation=180`,
    `${baseURL}?text=${encodedText}&type=datamatrix&size=90&margin=0&rotation=270`,
  ];
  Promise.all(dmURLs.map(loadImageAsDataURL))
    .then(urls => createPrintIframe(cargoNumber, urls))
    .catch(err  => { console.error('Ошибка загрузки DataMatrix:', err); createPrintIframe(cargoNumber, null); });
}

function createPrintIframe(cargoNumber, dmDataURLs) {
  const iframe = document.createElement('iframe');
  iframe.id = 'print-iframe-' + Date.now();
  iframe.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;pointer-events:none;`;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(createLabelHTML(cargoNumber, dmDataURLs));
  iframeDoc.close();

  setTimeout(() => { try { printIframe(iframe); } catch (e) { printIframe(iframe); } }, 100);
}

function printIframe(iframe) {
  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { iframe.parentNode?.removeChild(iframe); }, 1000);
    } catch (e) {
      console.error('Ошибка печати:', e);
      const html  = iframe.contentDocument.documentElement.outerHTML;
      const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url   = URL.createObjectURL(blob);
      const tab   = window.open(url, '_blank');
      if (tab) setTimeout(() => { try { tab.print(); } catch (_) {} }, 500);
      iframe.parentNode?.removeChild(iframe);
    }
  }, 500);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatCargoNumber(cargoNumber) {
  const escaped = escapeHtml(cargoNumber);
  if (escaped.length <= 6) return `<span class="cargo-number-large">${escaped}</span>`;
  return `<span class="cargo-number">${escaped.slice(0, -6)}</span><span class="cargo-number-large">${escaped.slice(-6)}</span>`;
}

function createLabelHTML(cargoNumber, dmDataURLs) {
  let dmGridHTML = '';
  if (dmDataURLs?.length === 4) {
    dmGridHTML = `
    <div class="datamatrix-block">
      <img src="${chrome.runtime.getURL('img/market-logo.png')}" alt="Yandex Market" class="market-logo-small">
      <div class="datamatrix-row">
        <div class="dm-item"><img src="${dmDataURLs[0]}" alt="0°"   class="dm-image"></div>
        <div class="dm-item"><img src="${dmDataURLs[1]}" alt="90°"  class="dm-image rotate-90"></div>
        <div class="dm-item"><img src="${dmDataURLs[2]}" alt="180°" class="dm-image rotate-180"></div>
        <div class="dm-item"><img src="${dmDataURLs[3]}" alt="270°" class="dm-image rotate-270"></div>
      </div>
    </div>`;
  } else {
    dmGridHTML = `<div class="datamatrix-block" style="display:flex;align-items:center;justify-content:center;">
      <div style="text-align:center;font-size:8px;">${escapeHtml(cargoNumber)}</div></div>`;
  }

  const now  = new Date();
  const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Этикетка ${escapeHtml(cargoNumber)}</title>
<style>
  @page { size: 85mm 54mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:85mm; height:54mm; padding:3mm; font-family:'Arial','Helvetica',sans-serif; font-size:10px;
         display:flex; flex-direction:column; border:3px solid #000; position:relative; background:white;
         transform:rotate(180deg); transform-origin:center center; }
  .cargo-container  { position:absolute; left:3mm; top:3mm; right:3.2mm; max-width:74mm; word-break:break-all; line-height:1.2; }
  .cargo-label      { font-size:14px; font-weight:bold; color:#000; margin-bottom:1mm; }
  .cargo-number     { font-size:17px; font-weight:bold; color:#000; }
  .cargo-number-large { font-size:24px; font-weight:bold; color:#000; letter-spacing:1.2px; }
  .date-container   { position:absolute; right:3.2mm; top:3mm; text-align:right; line-height:1.3; }
  .date { font-size:18px; font-weight:bold; color:#000; }
  .time { font-size:13px; font-weight:normal; color:#333; }
  .qr-container     { position:absolute; left:3.2mm; bottom:3.2mm; width:30mm; height:30mm;
                       display:flex; justify-content:center; align-items:center;
                       border:0.8mm solid #000; padding:2mm; background:white; }
  .qr-image         { width:100%; height:100%; object-fit:contain; }
  .datamatrix-block { position:absolute; right:3mm; bottom:3mm; width:45mm; height:22mm;
                       display:flex; flex-direction:column; justify-content:space-between;
                       align-items:flex-end; gap:1mm; }
  .market-logo-small { right:3mm; bottom:8mm; width:45mm; height:auto; max-height:9.5mm;
                        margin-right:1.8mm; object-fit:contain; align-self:flex-end; }
  .datamatrix-row   { display:flex; flex-direction:row; justify-content:flex-end; gap:0; width:100%; }
  .dm-item  { width:12mm; height:11mm; display:flex; justify-content:center; align-items:center;
               border:0.1mm solid #ccc; padding:0.2mm; background:white; }
  .dm-image { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
  .rotate-90  { transform:rotate(90deg);  }
  .rotate-180 { transform:rotate(180deg); }
  .rotate-270 { transform:rotate(270deg); }
</style></head>
<body>
  <div class="cargo-container">
    <div class="cargo-label">ГРУЗОМЕСТО</div>
    ${formatCargoNumber(cargoNumber)}
  </div>
  <div class="date-container">
    <div class="date">${escapeHtml(date)}</div>
    <div class="time">${escapeHtml(time)}</div>
  </div>
  <div class="qr-container">
    <img src="${dmDataURLs ? dmDataURLs[0] : ''}" alt="DataMatrix" class="qr-image">
  </div>
  ${dmGridHTML}
</body></html>`;
}

function createFallbackLabelHTML(cargoNumber) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Этикетка ${escapeHtml(cargoNumber)}</title>
<style>
  @page { size:50mm 80mm; margin:0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:50mm; height:80mm; padding:3mm; font-family:Arial,sans-serif; font-size:10px;
         display:flex; flex-direction:column; align-items:center; justify-content:space-between; }
  .header { font-weight:bold; font-size:11px; margin-bottom:2mm; }
  .cargo-number { font-size:18px; font-weight:bold; margin:4mm 0; text-align:center;
                   word-break:break-word; max-width:100%; }
  .barcode-container { width:40mm; height:40mm; display:flex; justify-content:center;
                        align-items:center; margin:2mm 0; border:1px solid #ddd;
                        font-size:9px; text-align:center; padding:2mm; word-break:break-word; }
  .timestamp { font-size:8px; margin:2mm 0; text-align:center; color:#666; }
  .divider   { width:100%; height:1px; background:#000; margin:2mm 0; }
  .footer    { font-size:7px; text-align:center; color:#444; }
</style></head>
<body>
  <div class="header">|| PARCEL</div>
  <div class="cargo-number">${escapeHtml(cargoNumber)}</div>
  <div class="barcode-container">${escapeHtml(cargoNumber)}</div>
  <div class="timestamp">${escapeHtml(new Date().toLocaleString('ru-RU'))}</div>
  <div class="divider"></div>
  <div class="footer"><div>Yandex Market</div><div>SaikoDev</div></div>
</body></html>`;
}


// ============================================================
// === DOM-наблюдатель ===
// ============================================================

const mainObserver = new MutationObserver(mutations => {
  for (const mutation of mutations) {

    // characterData: React обновил текст внутри существующего узла
    if (mutation.type === 'characterData') {
      const parent = mutation.target.parentElement;
      if (parent) checkNodeForTriggers(parent);
      continue;
    }

    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;

      // Строки таблицы → кнопки этикеток
      if (node.matches?.('tr')) { processRow(node); continue; }
      node.querySelectorAll?.('tr').forEach(processRow);

      // Звуковые триггеры
      checkNodeForTriggers(node);

      // Размещение: поллер стартует при попадании на страницу
      if (document.title.includes("Размещение")) startPlacementPoller();

      // Пятизначные коды появятся после React-рендера инпута
      setupFiveDigitInputHandler();
    }
  }
});


// ============================================================
// === Обнаружение SPA-навигации (React Router / History API) ===
// ============================================================

function onSPANavigate() {
  console.log("[Saiko] Навигация:", location.href);

  // Сбрасываем однократные флаги при переходе
  lamodaSoundPlayed    = false;
  enterCodeSoundPlayed = false;
  oplataSoundPlayed    = false;
  postPaymentPlayed    = false;
  codeAcceptedSoundPlayed = false;
  // _lastCellSpoken НЕ сбрасываем — анти-дупликация по номеру ячейки + 5сек окно

  // ВНИМАНИЕ: SoundQueue.clear() НЕ делаем здесь!
  // Очистка очереди перенесена в интервал ниже — сразу при смене URL,
  // ДО 300мс задержки. Иначе MutationObserver успевает добавить звуки
  // (no_open, post_payment, ячейка) за эти 300мс, а потом clear() их убивает.

  // Перезапускаем одноразовые инициализации
  initOnce();

  // Поллер размещения
  if (document.title.includes("Размещение")) {
    startPlacementPoller();
  } else {
    stopPlacementPoller();
  }
}

// React Router часто делает pushState + replaceState подряд —
// интервал ловит оба изменения и дважды вызывает onSPANavigate.
// Дедупликация: если onSPANavigate уже вызван для этого URL — игнорируем.
let _lastNavURL = '';

setInterval(() => {
  if (location.href !== currentURL) {
    currentURL = location.href;
    // Очищаем очередь СРАЗУ при смене URL — до того как
    // MutationObserver начнёт добавлять звуки новой страницы.
    // Раньше clear() был в onSPANavigate() после 300мс задержки,
    // и убивал звуки (no_open, post_payment), уже добавленные
    // MutationObserver за эти 300мс.
    SoundQueue.clear();
    // Небольшая задержка, чтобы React успел обновить document.title
    // и все pushState/replaceState отработали
    setTimeout(() => {
      // Дедупликация: не вызываем если URL не изменился с прошлого onSPANavigate
      if (location.href !== _lastNavURL) {
        _lastNavURL = location.href;
        onSPANavigate();
      }
    }, 300);
  }
}, 500);


// ============================================================
// === Инициализация ===
// ============================================================

function initOnce() {
  injectIdentificationWidget();
  setupFiveDigitInputHandler();
  initialTriggerScan();
  initBarcodeButtons();
  if (document.title.includes("Размещение")) startPlacementPoller();
}

function initObservers() {
  if (!document.body) {
    window.addEventListener("DOMContentLoaded", initObservers);
    return;
  }
  try {
    initOnce();
    mainObserver.observe(document.body, {
      childList:     true,
      subtree:       true,
      characterData: true, // ← ловим обновления текста от React
    });
    console.log("[Saiko] Наблюдатели инициализированы");
  } catch (e) {
    console.error("Ошибка при инициализации наблюдателей:", e);
  }
}

function handleContextInvalidation() {
  document.addEventListener('click', () => {
    if (!chrome.runtime?.id) {
      console.warn("Контекст расширения утерян, перезагружаем...");
      window.location.reload();
    }
  }, true);
}

function safeInit() {
  try {
    initVoiceSettings();
    initFadeInSetting();
    initEventListeners();
    initObservers();
    initHotkeys();
    // MAIN world уведомляет когда Яндекс пытается проиграть «Оплата при получении»
    document.addEventListener('saiko-post-payment', playPostPaymentSound);
    injectPvzSoundBlocker();  // MAIN world: блокируем Яндексовскую TTS
    handleContextInvalidation();
  } catch (e) {
    console.error("[Saiko] Ошибка инициализации:", e);
  }
}

// ============================================================
// === MAIN world: блокировка Яндексовской TTS (pvz-sound) ===
// ============================================================
// Инжектим скрипт в MAIN world, который перехватывает
// Audio.prototype.play и блокирует воспроизведение
// с pvz-sound.s3.yandex.net.
// Это страховка поверх declarativeNetRequest — даже если
// сетевой запрос прошёл, play() будет отменён.
// ============================================================

function injectPvzSoundBlocker() {
  // Инжектим только на страницах Яндекс.Маркета
  if (!location.hostname.includes('market.yandex.ru')) return;
  // Не инжектим повторно
  if (document.documentElement.hasAttribute('data-mh-pvz-blocker')) return;
  document.documentElement.setAttribute('data-mh-pvz-blocker', 'true');

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('issuing-sound-main.js');
  script.onload = () => script.remove();
  script.onerror = () => console.warn('[Saiko] Failed to inject pvz-sound blocker');
  (document.head || document.documentElement).appendChild(script);
}

// Очистка при выгрузке страницы
window.addEventListener('beforeunload', () => {
  stopPlacementPoller();
  stopFadeInObserver();
  if (window.__mainObserver) window.__mainObserver.disconnect();
});

// Перехват необработанных ошибок appendChild
window.addEventListener('error', (e) => {
  if (e.message?.includes('appendChild')) {
    console.error('Перехвачена ошибка appendChild:', e);
    e.preventDefault();
    return false;
  }
});

// Запуск
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", safeInit);
} else {
  safeInit();
}