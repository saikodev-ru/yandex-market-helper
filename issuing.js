/**
 * issuing.js — Новая выдача v9.4
 * Зависимости: alert.js (window.MHAlert)
 *
 * QR и backdrop — position:fixed на body (надёжно, независимо от stacking context).
 * QR позиционируется через getBoundingClientRect один раз после apply + resize/scroll.
 * sc сужается через max-width (работает даже при width:100% от приложения).
 * Заголовок скрывается с ретраем через domObs.
 */

(function () {
  'use strict';

  // ── Константы ──────────────────────────────────────────────────────────────
  const STYLE_ID        = 'mh-issuing-style';
  const INPUT_SEL       = '[data-testid="client-issuing-search-suggest"]';
  const TITLE_KEY       = 'pages.client-issuing-session-list:page-title';
  const GROUP_TITLE_SEL = '[data-i18n-key^="pages.client-issuing-session-list:group.title"]';
  const ISSUING_RE      = /\/issuing(?:\/)?$/;

  const QR_W   = 220;
  const QR_GAP = 12;

  const BADGES = [
    ['market',    'Маркет',          'ymarket.jpg'],
    ['avito',     'Авито',           'avito.jpg'],
    ['lamoda',    'Lamoda',          'lamoda.jpg'],
    ['cainiao',   'Cainiao',         'cainiao.jpg'],
    ['ydostavka', 'Яндекс.Доставка', 'ydelivery.jpg'],
  ];

  const LOADING_TEXTS = ['Ищем заказ…', 'Загружаем данные…', 'Почти готово…'];

  // Соответствие клавиш ЙЦУКЕН → QWERTY (строчные; применяем toUpperCase после маппинга)
  const RU_TO_EN = {
    'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p',
    'х':'[','ъ':']','ф':'a','ы':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k',
    'д':'l','ж':';','э':"'",'я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m',
    'б':',','ю':'.',
  };

  const QR_SVG_HTML = `
    <span class="mh-qr-label">Сканируй<br>QR-код<br>клиента</span>
    <svg class="mh-qr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
         xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
      <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
      <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <path d="M8 7v10"/>
      <path d="M12 7v10"/>
      <path d="M17 7v10"/>
      <path d="M10 7v10"/>
      <path d="M14 7v10"/>
      <path d="M6 7v10"/>
    </svg>
  `;

  const LOADER_HTML = `
    <div class="mh-dots">
      <div class="mh-dot"></div>
      <div class="mh-dot"></div>
      <div class="mh-dot"></div>
    </div>
    <div class="mh-loader-text">Загружаем заказ…</div>
  `;

  // ── Состояние ──────────────────────────────────────────────────────────────
  const state = {
    applied:        false,
    enabled:        false,
    navBlocking:    false,
    applyScheduled: false,  // защита от двойного планирования apply() в domObs
    scNode:         null,   // ссылка на актуальный sc — для детекции пересоздания React'ом
    qrEl:           null,
    pObs:           null,   // body-level MutationObserver на placeholder
    inputFocusCb:   null,
    inputBlurCb:    null,
    blurTimer:      null,
    posTimer:       null,
    domObs:         null,
    ancestorObs:    null,
    titleHidden:    false,
    loaderEl:       null,
    dropdownCb:      null,
    loadingTextI:    0,
    translitEnabled: true,
    actionBtnsEl:    null,
    backdropEl:      null,  // перехватчик кликов вне панели при фокусе
  };

  /** Элементы с уменьшенным gap — для корректного cleanup без мутации DOM-нод */
  const gapShrunkEls = [];

  // ── DOM-хелперы ────────────────────────────────────────────────────────────
  const getInput = () => document.querySelector(INPUT_SEL);
  const getSc    = () => getInput()?.parentElement ?? null;

  function isIssuingPage() {
    return ISSUING_RE.test(location.pathname);
  }

  /**
   * Создаёт DOM-элемент с набором опциональных свойств.
   * @param {string} tag
   * @param {{ id?: string, className?: string, text?: string, html?: string }} opts
   * @returns {HTMLElement}
   */
  function makeEl(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.id)        node.id = opts.id;
    if (opts.className) node.className = opts.className;
    if (opts.text)      node.textContent = opts.text;
    if (opts.html)      node.innerHTML = opts.html;
    return node;
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function buildCSS() {
    return `
      .mh-issuing-title-hidden { display: none !important; }

      /* sc: фиксированная высота — блок не прыгает при анимациях.
         Backdrop — огромный box-shadow spread; рисуется в stacking context
         самого элемента, z-index хаки на React-root не нужны. */
      .mh-issuing-wrap {
        position: relative !important;
        display: flex !important;
        flex-direction: column !important;
        background: #fff !important;
        border-radius: 20px !important;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.06),
          0 2px 8px rgba(0,0,0,0.07) !important;
        padding: 22px 24px 32px !important;
        box-sizing: border-box !important;
        height: 138px !important;
        max-width: calc(100% - ${QR_W + QR_GAP}px) !important;
        z-index: 99999 !important;
        transition:
          box-shadow  0.28s cubic-bezier(.4,0,.2,1),
          max-width   0.25s cubic-bezier(.4,0,.2,1),
          padding-top 0.24s cubic-bezier(.4,0,.2,1) !important;
      }
      .mh-issuing-wrap.mh-issuing-focused {
        max-width: 100% !important;
        /* padding-top вырастает до 58px: 22px base + 36px под строку кнопок.
           Инпут просто заполняет оставшееся место — margin-top не нужен. */
        padding-top: 58px !important;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.06),
          0 4px 24px rgba(0,0,0,0.12),
          0 0 0 9999px rgba(0,0,0,0.32) !important;
      }

      /* Щит кликов при фокусе поля поиска.
         z-index: 99998 — ниже панели (99999) и дропдауна, выше всего остального.
         Физически перекрывает страницу — клики до React не доходят. */
      #mh-click-shield {
        position: fixed !important;
        inset: 0 !important;
        z-index: 99998 !important;
        background: transparent !important;
        cursor: default !important;
      }

      /* Серый фон страницы — белые панели становятся чётко различимы */
      body {
        background-color: #f0f0f2 !important;
      }

      /* Заголовок — реальный DOM-элемент, не ::before */
      .mh-issuing-title {
        display: block !important;
        font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif !important;
        font-size: 24px !important;
        font-weight: 700 !important;
        letter-spacing: -0.02em !important;
        line-height: 1.2 !important;
        color: #0d0d0d !important;
        background: transparent !important;
        overflow: hidden !important;
        /* Явный max-height обязателен — без него CSS не может анимировать 0→auto */
        max-height: 40px !important;
        opacity: 1 !important;
        pointer-events: none !important;
        user-select: none !important;
        flex-shrink: 0 !important;
        order: -1 !important;
        margin-bottom: 6px !important;
        /* Появление при дефокусе: всё задержано — ждём пока кнопки (0.07s) полностью уйдут */
        transition:
          max-height    0.22s cubic-bezier(.4,0,.2,1) 0.14s,
          margin-bottom 0.22s cubic-bezier(.4,0,.2,1) 0.14s,
          opacity       0.20s ease                    0.18s !important;
      }
      .mh-issuing-wrap.mh-issuing-focused .mh-issuing-title {
        max-height: 0 !important;
        margin-bottom: 0 !important;
        opacity: 0 !important;
        /* Исчезновение при фокусе: мгновенно, без задержек */
        transition:
          max-height    0.12s cubic-bezier(.4,0,.2,1) 0s,
          margin-bottom 0.12s cubic-bezier(.4,0,.2,1) 0s,
          opacity       0.07s ease                    0s !important;
      }

      /* ── Иконки маркетплейсов — абсолютно, верхний правый угол ── */
      .mh-badges {
        position: absolute !important;
        top: 22px !important;
        right: 24px !important;
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        gap: 10px !important;
        align-items: center !important;
        transform: translateY(3px) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        transition: opacity 0.18s ease !important;
      }
      .mh-issuing-wrap.mh-issuing-focused .mh-badges {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .mh-badge {
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        flex-shrink: 0 !important;
        cursor: pointer !important;
        user-select: none !important;
        transition:
          transform 0.10s ease,
          opacity   0.14s ease !important;
      }
      .mh-badge img {
        width: 20px !important;
        height: 20px !important;
        object-fit: cover !important;
        display: block !important;
        border-radius: 50% !important;
        pointer-events: none !important;
        flex-shrink: 0 !important;
      }
      .mh-badge-label {
        font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        color: rgba(0,0,0,0.30) !important;
        white-space: nowrap !important;
        letter-spacing: 0 !important;
      }
      .mh-badge:hover  { opacity: 0.70 !important; }
      .mh-badge:active { transform: scale(0.92) !important; }

      /* Инпут — анимируем рост и увеличение шрифта */
      .mh-issuing-wrap input[data-testid="client-issuing-search-suggest"] {
        border-radius: 14px !important;
        padding: 18px 20px !important;
        font-size: 18px !important;
        font-weight: 500 !important;
        min-height: 48px !important;
        flex: 1 !important;
        height: auto !important;
        background: #f5f5f7 !important;
        border: none !important;
        outline: none !important;
        outline-width: 0 !important;
        box-shadow: none !important;
        width: 100% !important;
        color: #1a1a1a !important;
        box-sizing: border-box !important;
        caret-color: #ff3b30 !important;
        transition:
          background     0.18s ease,
          padding        0.28s cubic-bezier(.4,0,.2,1),
          font-size      0.24s cubic-bezier(.4,0,.2,1),
          letter-spacing 0.24s cubic-bezier(.4,0,.2,1) !important;
      }
      .mh-issuing-wrap.mh-issuing-focused
        input[data-testid="client-issuing-search-suggest"] {
        padding: 0 28px !important;
        font-size: 32px !important;
        letter-spacing: 0.06em !important;
        background: #ebebed !important;
        box-shadow: 0 0 0 2px rgba(255,59,48,0.40) !important;
        flex: 1 !important;
        height: auto !important;
      }
      .mh-issuing-wrap.mh-issuing-focused
        input[data-testid="client-issuing-search-suggest"]::placeholder {
        opacity: 0 !important;
      }
      .mh-issuing-wrap input[data-testid="client-issuing-search-suggest"]:focus,
      .mh-issuing-wrap input[data-testid="client-issuing-search-suggest"]:active {
        background: #ebebed !important;
        outline: none !important;
        box-shadow: none !important;
      }
      .mh-issuing-wrap input[data-testid="client-issuing-search-suggest"]::placeholder {
        color: rgba(0,0,0,0.28) !important;
        font-weight: 400 !important;
      }

      /* Скрываем встроенную кнопку очистки («крестик») — она криво встаёт в нашу панель */
      .mh-issuing-wrap div:has(> svg[aria-label="suggest-clear"]) {
        display: none !important;
      }

      .mh-input-wrap {
        position: relative !important;
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        background: transparent !important;
      }

      /* ── Состояние загрузки ── */

      /* Оверлей поверх всей карточки */
      .mh-issuing-wrap.mh-issuing-loading {
        box-shadow:
          0 0 0 2px rgba(255,59,48,0.18),
          0 4px 24px rgba(0,0,0,0.10) !important;
      }

      /* Лоадер-контейнер — абсолютный, перекрывает инпут */
      #mh-loader {
        position: absolute !important;
        inset: 0 !important;
        border-radius: 20px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 14px !important;
        background: rgba(255,255,255,0.92) !important;
        backdrop-filter: blur(6px) !important;
        -webkit-backdrop-filter: blur(6px) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.2s ease !important;
        z-index: 9998 !important;
      }
      #mh-loader.mh-loader-visible {
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      /* Три точки */
      #mh-loader .mh-dots {
        display: flex !important;
        gap: 10px !important;
        align-items: center !important;
      }
      #mh-loader .mh-dot {
        width: 12px !important;
        height: 12px !important;
        border-radius: 50% !important;
        background: #ff3b30 !important;
        animation: mh-bounce 1.1s cubic-bezier(.4,0,.2,1) infinite !important;
      }
      #mh-loader .mh-dot:nth-child(2) { animation-delay: 0.16s !important; }
      #mh-loader .mh-dot:nth-child(3) { animation-delay: 0.32s !important; }
      @keyframes mh-bounce {
        0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
        40%            { transform: scale(1.2); opacity: 1;   }
      }

      /* Текст под точками */
      #mh-loader .mh-loader-text {
        font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
        font-size: 16px !important;
        font-weight: 500 !important;
        color: rgba(0,0,0,0.45) !important;
        letter-spacing: 0.01em !important;
        animation: mh-fade-text 2s ease infinite !important;
      }
      @keyframes mh-fade-text {
        0%, 100% { opacity: 0.5; }
        50%       { opacity: 1;   }
      }

      /* QR: fixed на body */
      #mh-qr-block {
        position: fixed !important;
        z-index: 99999 !important;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        background: #fff;
        border-radius: 20px;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.06),
          0 2px 8px rgba(0,0,0,0.07);
        padding: 22px 24px 20px;
        box-sizing: border-box;
        width: ${QR_W}px;
        cursor: pointer;
        user-select: none;
        overflow: hidden;
        transition:
          opacity    0.20s ease,
          box-shadow 0.22s cubic-bezier(.4,0,.2,1),
          transform  0.10s ease;
      }
      #mh-qr-block.mh-qr-focused {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      #mh-qr-block:hover {
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.10),
          0 4px 16px rgba(0,0,0,0.11);
      }
      #mh-qr-block:active { transform: scale(0.97); }
      #mh-qr-block .mh-qr-icon {
        position: absolute;
        bottom: -6px;
        right: -4px;
        width: 120px;
        height: 120px;
        color: rgba(0,0,0,0.10);
        pointer-events: none;
        transform: rotate(22deg);
      }
      #mh-qr-block .mh-qr-label {
        font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif;
        font-size: 17px;
        font-weight: 700;
        color: #0d0d0d;
        text-align: left;
        line-height: 1.3;
        letter-spacing: -0.02em;
      }

      /* Плавная очистка инпута при расфокусировке */
      .mh-issuing-wrap input[data-testid="client-issuing-search-suggest"].mh-input-clearing {
        opacity: 0 !important;
        transform: translateY(3px) !important;
        transition:
          opacity   0.18s ease,
          transform 0.18s ease !important;
      }

      /* ── Панель групп завершённых заказов ── */
      .mh-sessions-group {
        background: #fff !important;
        border-radius: 20px !important;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.06),
          0 2px 8px rgba(0,0,0,0.07) !important;
        padding: 28px 24px 20px !important;
        box-sizing: border-box !important;
      }
      /* Блок «Текущие сессии» — меньше отступа сверху */
      .mh-sessions-group-active {
        padding-top: 20px !important;
      }
      /* Уменьшаем gap между панелями групп */
      .mh-sessions-group + .mh-sessions-group {
        margin-top: -20px !important;
      }
      /* Заголовок группы — такой же стиль как у блока поиска */
      .mh-sessions-group > button {
        margin-bottom: 8px !important;
        cursor: default !important;
        pointer-events: none !important;
      }
      /* Скрываем шеврон */
      .mh-sessions-group > button svg[aria-label="icon-chevronDown"],
      .mh-sessions-group > button svg[aria-label="icon-chevronDown"] ~ *,
      .mh-sessions-group > button .mez-transition-transform {
        display: none !important;
      }
      /* Уменьшаем gap между карточками заказов */
      .mh-sessions-group .mez-gap-\[16px\] {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      /* Карточки заказов — растягиваются равномерно, минимум ~260px */
      .mh-sessions-group .mez-gap-\[16px\] > [role="button"] {
        flex: 1 1 260px !important;
        width: auto !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      .mh-sessions-group > button .mez-text-m-headline3,
      .mh-sessions-group > button [class*="headline3"] {
        font-size: 24px !important;
        line-height: 1.2 !important;
        letter-spacing: -0.01em !important;
      }
      /* Переработанные заголовки групп */
      .mh-group-title {
        display: inline-flex !important;
        align-items: center !important;
        gap: 10px !important;
        font-size: 24px !important;
        font-weight: 700 !important;
        font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif !important;
        letter-spacing: -0.02em !important;
        line-height: 1.2 !important;
        color: #0d0d0d !important;
      }
      .mh-group-count {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 28px !important;
        height: 28px !important;
        padding: 0 8px !important;
        border-radius: 8px !important;
        font-size: 15px !important;
        font-weight: 700 !important;
        font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
        letter-spacing: -0.01em !important;
        line-height: 1 !important;
        flex-shrink: 0 !important;
      }
      .mh-group-count-active {
        background: #ff4114 !important;
        color: #fff !important;
      }
      .mh-group-count-finished {
        background: rgba(0,0,0,0.08) !important;
        color: rgba(0,0,0,0.30) !important;
      }

      /* ── Редизайн сетки и карточек сессий ── */

      /* Сетка: 4 колонки */
      .mh-sessions-group .mez-inline-flex.mez-flex-row.mez-flex-wrap {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
        gap: 8px !important;
        width: 100% !important;
      }

      /* Карточка — базовый стиль (нейтральный) */
      .mh-sessions-group [role="button"].mez-rounded-xl {
        width: 100% !important;
        border-radius: 14px !important;
        border: none !important;
        background: #f5f5f7 !important;
        padding: 14px 16px !important;
        box-sizing: border-box !important;
        position: relative !important;
        /* overflow:hidden убран — иначе абсолютный статус обрезается */
        transition:
          filter     0.14s ease,
          transform  0.10s ease,
          box-shadow 0.14s ease !important;
      }
      .mh-sessions-group [role="button"].mez-rounded-xl:hover {
        filter: brightness(0.96) !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
      }
      .mh-sessions-group [role="button"].mez-rounded-xl:active {
        transform: scale(0.975) !important;
      }

      /* Мягкий градиент в правый верхний угол */
      .mh-sessions-group [role="button"].mez-rounded-xl::after {
        content: '' !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: 14px !important;
        background: radial-gradient(
          ellipse 65% 65% at 100% 0%,
          rgba(0,0,0,0.055) 0%,
          transparent 70%
        ) !important;
        pointer-events: none !important;
      }

      /* Статус — только текст в правом конце flex-строки, без пилюли */
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-rounded-\[100px\],
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-bg-themeLayerBgNeutral {
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        border-radius: 0 !important;
        gap: 0 !important;
        /* остаётся в потоке flex-row justify-between — не абсолютный */
        position: static !important;
        flex-shrink: 0 !important;
      }
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-rounded-\[100px\] span,
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-bg-themeLayerBgNeutral span {
        font-size: 10px !important;
        font-weight: 700 !important;
        letter-spacing: 0.02em !important;
        color: rgba(0,0,0,0.30) !important;
        text-transform: uppercase !important;
      }
      /* Точка-индикатор и вложенные div-обёртки — скрыть */
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-rounded-1\/2,
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-bg-themeLayerBgNeutral > div {
        display: none !important;
      }

      /* Имя клиента */
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-text-m-subhead {
        font-size: 15px !important;
        font-weight: 600 !important;
        color: #0d0d0d !important;
        letter-spacing: -0.01em !important;
        max-width: 100% !important;
      }

      /* Строка с номером ячейки */
      .mh-sessions-group [role="button"].mez-rounded-xl
        [data-i18n-key="pages.client-issuing-session-list:session-card.cells.label"] {
        color: rgba(0,0,0,0.38) !important;
        font-size: 13px !important;
      }
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-text-themeTextControlSecondaryDisabled {
        font-size: 13px !important;
        font-weight: 600 !important;
        color: rgba(0,0,0,0.55) !important;
      }
      /* Gap внутри карточки */
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-gap-\[24px\] {
        gap: 10px !important;
      }
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-gap-\[8px\] {
        gap: 6px !important;
      }
      /* Строка имя+статус: убираем лишний gap между ними */
      .mh-sessions-group [role="button"].mez-rounded-xl .mez-justify-between {
        gap: 6px !important;
      }

      /* ── Карточки активных сессий (без role=button, но с кнопками внутри) ── */
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) {
        width: 100% !important;
        border-radius: 14px !important;
        border: none !important;
        background: #f5f5f7 !important;
        padding: 14px 16px !important;
        box-sizing: border-box !important;
        position: relative !important;
      }

      /* Карточка с успешным статусом — лёгкий зелёный тинт */
      .mh-sessions-group .mez-rounded-xl:not([role="button"]):has(.mez-bg-themeLayerBgSuccess) {
        background: #eef8f2 !important;
      }
      /* Градиент в угол — подчёркивает тинт */
      .mh-sessions-group .mez-rounded-xl:not([role="button"])::after {
        content: '' !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: 14px !important;
        background: radial-gradient(
          ellipse 65% 65% at 100% 0%,
          rgba(0,0,0,0.04) 0%,
          transparent 70%
        ) !important;
        pointer-events: none !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]):has(.mez-bg-themeLayerBgSuccess)::after {
        background: radial-gradient(
          ellipse 65% 65% at 100% 0%,
          rgba(52,199,89,0.14) 0%,
          transparent 70%
        ) !important;
      }

      /* Пилюля → полностью скрыть обёртку, показать только текст */
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-rounded-\[100px\],
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeLayerBgSuccess,
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeLayerBgNeutral {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        padding: 0 !important;
        border-radius: 0 !important;
        gap: 0 !important;
        flex-shrink: 0 !important;
        box-shadow: none !important;
        outline: none !important;
      }
      /* Точка-индикатор */
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-rounded-1\/2,
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeSysSuccess,
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeSysNeutral,
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeLayerBgSuccess > div,
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeLayerBgNeutral > div {
        display: none !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-rounded-\[100px\] span,
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeLayerBgSuccess span,
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeLayerBgNeutral span {
        font-size: 10px !important;
        font-weight: 700 !important;
        letter-spacing: 0.02em !important;
        color: rgba(0,0,0,0.28) !important;
        text-transform: uppercase !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]):has(.mez-bg-themeLayerBgSuccess)
        .mez-bg-themeLayerBgSuccess span {
        color: rgba(30,120,60,0.65) !important;
      }

      /* Строка кнопок */
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-gap-\[4px\] {
        gap: 6px !important;
      }
      /* Кнопка «Перейти» */
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeControlPrimary {
        border-radius: 100px !important;
        padding: 8px 16px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em !important;
        background: rgba(0,0,0,0.10) !important;
        background-color: rgba(0,0,0,0.10) !important;
        color: #0d0d0d !important;
        box-shadow: none !important;
        transition: background 0.14s ease !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]):has(.mez-bg-themeLayerBgSuccess)
        .mez-bg-themeControlPrimary {
        background: rgba(52,199,89,0.22) !important;
        background-color: rgba(52,199,89,0.22) !important;
        color: #1a6b36 !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]):has(.mez-bg-themeLayerBgSuccess)
        .mez-bg-themeControlPrimary:hover {
        background: rgba(52,199,89,0.32) !important;
        background-color: rgba(52,199,89,0.32) !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeControlPrimary span {
        font-size: 13px !important;
        font-weight: 600 !important;
        color: inherit !important;
      }
      /* Кнопка «⋮» */
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeControlSecondary {
        border-radius: 100px !important;
        padding: 8px 12px !important;
        background: rgba(0,0,0,0.07) !important;
        background-color: rgba(0,0,0,0.07) !important;
        box-shadow: none !important;
        flex: none !important;
        transition: background 0.14s ease !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeControlSecondary:hover {
        background: rgba(0,0,0,0.11) !important;
        background-color: rgba(0,0,0,0.11) !important;
      }
      .mh-sessions-group .mez-rounded-xl:not([role="button"]) .mez-bg-themeControlSecondary svg {
        width: 16px !important;
        height: 16px !important;
      }

      /* ── Защита от redesign.css: кнопки помеченные нами игнорируют глобальные правила ── */
      button[data-mh-patched].mez-bg-themeControlPrimary,
      button[data-mh-patched][class*="themeControlPrimary"] {
        background-color: revert !important;
        background: revert !important;
        color: revert !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 100px !important;
        transform: none !important;
      }
      button[data-mh-patched].mez-bg-themeControlSecondary,
      button[data-mh-patched][class*="themeControlSecondary"] {
        background-color: rgba(0,0,0,0.07) !important;
        background: rgba(0,0,0,0.07) !important;
        color: #1a1a1a !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 100px !important;
        transform: none !important;
      }

      /* ── Редизайн дропдауна ── */
      [data-testid="dropdown-list"] {
        border-radius: 18px !important;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.07),
          0 8px 24px rgba(0,0,0,0.13) !important;
        overflow: hidden !important;
        padding: 6px 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
        position: relative !important;
        z-index: 100000 !important;
      }
      [data-testid="dropdown-item"] {
        min-height: 76px !important;
        padding: 16px 20px !important;
        box-sizing: border-box !important;
        position: relative !important;
        transition: background 0.12s ease !important;
      }
      [data-testid="dropdown-item"] + [data-testid="dropdown-item"]::before {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: 20px !important;
        right: 20px !important;
        height: 1px !important;
        background: rgba(0,0,0,0.08) !important;
      }
      [data-testid="dropdown-item"] .mez-gap-\[8px\].mez-items-center {
        justify-content: space-between !important;
        width: 100% !important;
      }
      [data-testid="dropdown-item"] .mez-text-m-subhead {
        font-size: 20px !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
      }
      [data-testid="dropdown-item"] .mez-bg-themeLayerBgNeutral {
        display: none !important;
      }
      [data-testid="dropdown-item"] .mez-gap-\[8px\] > .mez-rounded-\[100px\]:first-of-type {
        margin-left: auto !important;
        flex-shrink: 0 !important;
        margin-bottom: 14px !important;
      }
      [data-testid="dropdown-item"] .mez-rounded-\[100px\] span {
        font-size: 14px !important;
        font-weight: 500 !important;
      }
      [data-testid="dropdown-item"] [data-testid="recipient-name"],
      [data-testid="dropdown-item"] [data-testid="recipient-phone"] {
        font-size: 18px !important;
        line-height: 1.4 !important;
      }
      [data-testid="dropdown-item"] .mez-gap-\[4px\] .mez-text-themeTextControlSecondaryDisabled {
        font-size: 18px !important;
      }
      [data-testid="dropdown-list"] .mez-text-themeTextSecondary {
        font-size: 14px !important;
        font-weight: 500 !important;
        letter-spacing: 0.01em !important;
      }

      /* ── Горячие клавиши: HUD-индикатор ── */
      #mh-hotkey-hud {
        position: fixed !important;
        bottom: 32px !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(8px) !important;
        z-index: 100001 !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 14px 24px !important;
        background: rgba(255,255,255,0.97) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        border-radius: 100px !important;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.08),
          0 8px 28px rgba(0,0,0,0.16) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.18s ease, transform 0.18s cubic-bezier(.4,0,.2,1) !important;
        white-space: nowrap !important;
      }
      #mh-hotkey-hud.mh-hotkey-hud-visible {
        opacity: 1 !important;
        transform: translateX(-50%) translateY(0) !important;
      }
      .mh-hotkey-chip {
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        color: rgba(0,0,0,0.40) !important;
        letter-spacing: 0 !important;
      }
      .mh-hotkey-chip kbd {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 4px 10px !important;
        border-radius: 8px !important;
        background: rgba(0,0,0,0.07) !important;
        border: 1px solid rgba(0,0,0,0.13) !important;
        font-family: inherit !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        color: #1a1a1a !important;
        line-height: 1.5 !important;
      }
      .mh-hotkey-chip kbd.mh-key-active {
        background: #ff4114 !important;
        border-color: #ff4114 !important;
        color: #fff !important;
      }
      .mh-hotkey-divider {
        width: 1px !important;
        height: 20px !important;
        background: rgba(0,0,0,0.10) !important;
        flex-shrink: 0 !important;
      }
      .mh-hotkey-label {
        font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        color: rgba(0,0,0,0.55) !important;
      }
      .mh-hotkey-label strong {
        color: #0d0d0d !important;
        font-weight: 700 !important;
      }

      /* ── Горячие клавиши: кнопка «Перейти» / «Отправить» ── */

      /* ── Строка с подсказкой и кнопками (единый абсолютный ряд) ── */
      .mh-action-buttons {
        position: absolute !important;
        top: 18px !important;
        left: 22px !important;
        right: 20px !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 6px !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-3px) !important;
        /* Исчезновение (при дефокусе): очень быстро */
        transition:
          opacity   0.07s ease 0s,
          transform 0.07s ease 0s !important;
        z-index: 2 !important;
      }
      .mh-action-buttons.mh-action-buttons-visible {
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: translateY(0) !important;
        /* Появление (при фокусе): с задержкой — ждём пока title исчезнет */
        transition:
          opacity   0.18s ease 0.10s,
          transform 0.18s cubic-bezier(.4,0,.2,1) 0.10s !important;
      }

      /* Подсказка — слева, растягивается */
      .mh-search-hint {
        flex: 1 !important;
        font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif !important;
        font-size: 16px !important;
        font-weight: 500 !important;
        color: #0d0d0d !important;
        letter-spacing: -0.01em !important;
        line-height: 1.2 !important;
        pointer-events: none !important;
        user-select: none !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      /* Общий стиль пилюли — распространяется на все три кнопки */
      .mh-action-btn,
      .mh-toggle-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        padding: 8px 14px !important;
        border-radius: 100px !important;
        border: none !important;
        cursor: pointer !important;
        font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        letter-spacing: -0.01em !important;
        white-space: nowrap !important;
        user-select: none !important;
        outline: none !important;
        flex-shrink: 0 !important;
        transition:
          background 0.15s ease,
          transform  0.10s ease,
          box-shadow 0.15s ease !important;
      }
      .mh-action-btn svg,
      .mh-toggle-btn svg {
        flex-shrink: 0 !important;
        width: 14px !important;
        height: 14px !important;
      }
      .mh-action-btn:active,
      .mh-toggle-btn:active { transform: scale(0.96) !important; }

      /* Серые кнопки: тумблер и «Отправить» */
      .mh-toggle-btn,
      .mh-action-btn-secondary {
        background: rgba(0,0,0,0.07) !important;
        color: #1a1a1a !important;
      }
      .mh-toggle-btn:hover,
      .mh-action-btn-secondary:hover {
        background: rgba(0,0,0,0.11) !important;
      }

      /* Красная кнопка «Найти» — цвет Маркета */
      .mh-action-btn-primary {
        background: #ff4114 !important;
        color: #fff !important;
        box-shadow: 0 2px 8px rgba(255,65,20,0.30) !important;
      }
      .mh-action-btn-primary:hover {
        background: #e83a11 !important;
        box-shadow: 0 4px 12px rgba(255,65,20,0.38) !important;
      }

      /* Сам переключатель-таблетка */
      .mh-toggle-track {
        position: relative !important;
        display: inline-block !important;
        width: 32px !important;
        height: 18px !important;
        border-radius: 100px !important;
        background: rgba(0,0,0,0.16) !important;
        flex-shrink: 0 !important;
        transition: background 0.22s ease !important;
      }
      .mh-toggle-btn.mh-toggle-on .mh-toggle-track {
        background: #34c759 !important;
      }
      .mh-toggle-thumb {
        position: absolute !important;
        top: 2px !important;
        left: 2px !important;
        width: 14px !important;
        height: 14px !important;
        border-radius: 50% !important;
        background: #fff !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25) !important;
        transition: transform 0.22s cubic-bezier(.4,0,.2,1) !important;
      }
      .mh-toggle-btn.mh-toggle-on .mh-toggle-thumb {
        transform: translateX(14px) !important;
      }
    `;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = makeEl('style', { id: STYLE_ID });
    s.textContent = buildCSS();
    document.head.appendChild(s);
  }

  // ── QR-позиционирование ───────────────────────────────────────────────────
  function placeQr() {
    if (!state.qrEl) return;
    const sc = getSc();
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    // sc ещё не в layout — повторяем попытку в следующем rAF
    if (r.width === 0) { requestAnimationFrame(placeQr); return; }
    state.qrEl.style.top    = r.top + 'px';
    state.qrEl.style.bottom = (window.innerHeight - r.bottom) + 'px';
    state.qrEl.style.height = 'auto';
    state.qrEl.style.left   = (r.right + QR_GAP) + 'px';
  }

  function schedulePlaceQr(delay) {
    if (state.posTimer) clearTimeout(state.posTimer);
    state.posTimer = setTimeout(() => {
      state.posTimer = null;
      requestAnimationFrame(placeQr);
    }, delay);
  }

  function onResize() {
    if (state.applied) {
      schedulePlaceQr(50);
      updateShieldClip();
    }
  }

  // Наблюдаем за всеми предками sc вплоть до html.
  // Если любой предок изменил размер — sc мог сдвинуться по Y.
  function observeAncestors(sc) {
    state.ancestorObs = new ResizeObserver(() => requestAnimationFrame(placeQr));
    let node = sc;
    while (node && node !== document.documentElement) {
      state.ancestorObs.observe(node);
      node = node.parentElement;
    }
  }

  function unobserveAncestors() {
    state.ancestorObs?.disconnect();
    state.ancestorObs = null;
  }

  function onScroll() {
    if (!state.applied || !state.qrEl) return;
    const sc = getSc();
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    state.qrEl.style.top    = r.top + 'px';
    state.qrEl.style.bottom = (window.innerHeight - r.bottom) + 'px';
    state.qrEl.style.left   = (r.right + QR_GAP) + 'px';
    updateShieldClip();
  }

  // ── QR-блок ───────────────────────────────────────────────────────────────
  function createQrBlock() {
    const existing = document.getElementById('mh-qr-block');
    if (existing) { state.qrEl = existing; return; }

    const block = makeEl('div', { id: 'mh-qr-block', html: QR_SVG_HTML });
    block.addEventListener('click', () => {
      window.MHAlert?.notify({
        title: 'Получить заказ по QR-коду',
        body:  'Клиенты Маркета могут получить свой заказ по QR-коду из приложения Маркета. QR-код обновляется ежедневно в 4:00. Так же вам могут назвать код получения, он тоже подойдет для получения заказа.',
      });
    });
    document.body.appendChild(block);
    state.qrEl = block;
  }

  // ── Лоадер ────────────────────────────────────────────────────────────────
  function createLoader(sc) {
    const existing = document.getElementById('mh-loader');
    if (existing) { state.loaderEl = existing; return; }

    const el = makeEl('div', { id: 'mh-loader', html: LOADER_HTML });
    sc.appendChild(el);
    state.loaderEl = el;
  }

  function showLoader(sc) {
    if (!state.loaderEl) return;
    state.loadingTextI = 0;
    const textEl = state.loaderEl.querySelector('.mh-loader-text');
    if (textEl) textEl.textContent = LOADING_TEXTS[0];
    sc.classList.add('mh-issuing-loading');
    state.loaderEl.classList.add('mh-loader-visible');
    // Меняем текст каждые 1.8с пока лоадер видим
    state.loaderEl._textTimer = setInterval(() => {
      if (!state.loaderEl.classList.contains('mh-loader-visible')) {
        clearInterval(state.loaderEl._textTimer);
        return;
      }
      state.loadingTextI = (state.loadingTextI + 1) % LOADING_TEXTS.length;
      if (textEl) textEl.textContent = LOADING_TEXTS[state.loadingTextI];
    }, 1800);
  }

  function hideLoader(sc) {
    if (!state.loaderEl) return;
    clearInterval(state.loaderEl._textTimer);
    sc?.classList.remove('mh-issuing-loading');
    state.loaderEl.classList.remove('mh-loader-visible');
  }

  // ── Backdrop ──────────────────────────────────────────────────────────────
  // Реализован через огромный box-shadow spread на .mh-issuing-wrap.mh-issuing-focused.
  // DOM-элемент и z-index хаки на React-root не нужны — shadow рисуется
  // в stacking context самого блока поиска и не зависит от SPA-навигации.

  // ── Placeholder observer ──────────────────────────────────────────────────
  // Наблюдаем на уровне document.body, чтобы не терять ссылку при пересоздании
  // React'ом ноды инпута во время SPA-навигации.
  function keepPlaceholder() {
    if (state.pObs) return;
    state.pObs = new MutationObserver(mutations => {
      for (const m of mutations) {
        const t = /** @type {Element} */ (m.target);
        if (t.matches?.(INPUT_SEL) && t.getAttribute('placeholder') !== 'Найти по номеру заказа или грузоместа')
          t.setAttribute('placeholder', 'Найти по номеру заказа или грузоместа');
      }
    });
    state.pObs.observe(document.body, {
      subtree: true, attributes: true, attributeFilter: ['placeholder'],
    });
  }

  // ── Транслитерация ────────────────────────────────────────────────────────
  // Кириллица → Latin (раскладка ЙЦУКЕН↔QWERTY) + capitalize всех букв.
  // Используем нативный setter чтобы React-controlled input получил изменение.
  function setupTransliteration(input) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    )?.set;
    let busy = false;

    input.addEventListener('input', () => {
      if (busy || !state.translitEnabled) return;
      const val = input.value;
      const pos = input.selectionStart;
      let newVal = '';
      let changed = false;

      for (const ch of val) {
        const mapped = RU_TO_EN[ch.toLowerCase()];
        if (mapped !== undefined) {
          // Кириллица → Latin → uppercase
          newVal += mapped.toUpperCase();
          changed = true;
        } else if (/[a-zA-Z]/.test(ch)) {
          const up = ch.toUpperCase();
          newVal += up;
          if (ch !== up) changed = true;
        } else {
          newVal += ch;
        }
      }

      if (!changed) return;
      busy = true;
      // Нативный setter обходит React-контроль над полем
      if (nativeSetter) nativeSetter.call(input, newVal);
      else input.value = newVal;
      // Восстанавливаем позицию курсора
      input.selectionStart = input.selectionEnd = pos;
      // Уведомляем React об изменении
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      busy = false;
    }, true); // capture: обрабатываем до React
  }

  // ── Группы завершённых заказов ─────────────────────────────────────────────

  /**
   * Переписывает заголовок группы заказов в формат:
   *   "Текущие сессии [N]"  (красный бейдж)
   *   "Завершённые [N]"     (серый бейдж)
   *
   * @param {string} i18nKey  — data-i18n-key целевого span'а
   * @param {string} label    — новый текст заголовка
   * @param {string} countClass — CSS-класс для бейджа (mh-group-count-active / mh-group-count-finished)
   */
  function rewriteGroupTitle(i18nKey, label, countClass) {
    const span = document.querySelector(`[data-i18n-key="${i18nKey}"]`);
    if (!span) return;

    const row = span.closest('.mez-flex-row');
    if (!row) return;

    // Число — последний span в row с числовым содержимым
    const allSpans  = Array.from(row.querySelectorAll('span'));
    const countSpan = allSpans.filter(s => /^\d+$/.test(s.textContent.trim())).pop();
    const count     = countSpan ? parseInt(countSpan.textContent.trim(), 10) : 0;

    // Уже заменили — только обновляем число в бейдже
    const existing = row.querySelector('.mh-group-title');
    if (existing) {
      const badge = existing.querySelector('.mh-group-count');
      if (badge && badge._mhCount !== count) {
        badge.textContent = count;
        badge._mhCount = count;
      }
      return;
    }

    // Скрываем оригинальное содержимое row
    Array.from(row.children).forEach(ch =>
      ch.style.setProperty('display', 'none', 'important'));

    // Строим: <span.mh-group-title> "Текст" <span.mh-group-count>N</span> </span>
    const title = makeEl('span', { className: 'mh-group-title' });
    title.appendChild(document.createTextNode(label));

    const badge = makeEl('span', { className: `mh-group-count ${countClass}`, text: String(count) });
    badge._mhCount = count;
    title.appendChild(badge);

    row.appendChild(title);
  }

  function rewriteGroupTitles() {
    rewriteGroupTitle(
      'pages.client-issuing-session-list:group.title.IN_PROGRESS',
      'Текущие сессии',
      'mh-group-count-active'
    );
    rewriteGroupTitle(
      'pages.client-issuing-session-list:group.title.FINISHED',
      'Завершённые',
      'mh-group-count-finished'
    );
  }

  function applySessionGroups() {
    document.querySelectorAll(GROUP_TITLE_SEL).forEach(span => {
      const isActive = span.getAttribute('data-i18n-key')
        ?.includes('IN_PROGRESS');

      // Поднимаемся до контейнера с mez-flex-col mez-gap-[16px]
      let node = span;
      for (let i = 0; i < 6; i++) {
        const p = node.parentElement;
        if (!p) break;
        if (p.className?.includes?.('mez-gap-[16px]') && p.className?.includes?.('mez-flex-col')) {
          if (!p.classList.contains('mh-sessions-group'))
            p.classList.add('mh-sessions-group');
          if (isActive && !p.classList.contains('mh-sessions-group-active'))
            p.classList.add('mh-sessions-group-active');
          break;
        }
        node = p;
      }

      // Принудительно выставляем шрифт прямо на span с headline3
      let fontNode = span;
      for (let i = 0; i < 4; i++) {
        if (fontNode.className?.includes?.('headline3')) {
          fontNode.style.setProperty('font-size',      '24px',    'important');
          fontNode.style.setProperty('line-height',    '1.2',     'important');
          fontNode.style.setProperty('letter-spacing', '-0.01em', 'important');
          break;
        }
        if (!fontNode.parentElement) break;
        fontNode = fontNode.parentElement;
      }
    });

    // Замена заголовков групп
    rewriteGroupTitles();

    // Укорачиваем текст кнопки «Перейти к выдаче» → «Перейти»
    document.querySelectorAll(
      '[data-i18n-key="pages.client-issuing-session-list:session-card.actions.DELIVER"]'
    ).forEach(span => {
      if (span.textContent.trim() !== 'Перейти') span.textContent = 'Перейти';
    });

    // Патчим inline-стили карточек через JS — CSS не может победить inline !important
    patchCardStyles();
  }

  /**
   * Inline !important стили (ставятся React/redesign.css) не поддаются CSS-правилам.
   * Патчим их напрямую через element.style.setProperty.
   *
   * Макет карточки после патча:
   *   ┌─────────────────────────────┐
   *   │ Имя клиента       СТАТУС   │  ← статус заменяет ячейку в шапке
   *   │ ОПЛАЧЕН / НЕ ОПЛАЧЕН       │  ← строка статуса под именем
   *   │  [Перейти]  [⋮]       100  │  ← ячейка — справа в строке кнопок
   *   └─────────────────────────────┘
   */
  function patchCardStyles() {
    document.querySelectorAll(
      '.mh-sessions-group .mez-rounded-xl:not([role="button"])'
    ).forEach(card => {
      if (card._mhPatched) return;
      card._mhPatched = true;

      const isSuccess = !!card.querySelector('.mez-bg-themeLayerBgSuccess');
      const isWarning = !!card.querySelector('.mez-bg-themeLayerBgWarning');
      // Цветовая схема
      const scheme = isSuccess ? {
        cardBg:   '#eef8f2',
        gradFrom: 'rgba(52,199,89,0.16)',
        btnBg:    'rgba(52,199,89,0.22)',
        btnColor: '#1a6b36',
        labelColor: 'rgba(30,120,60,0.75)',
      } : isWarning ? {
        cardBg:   '#fff2f1',
        gradFrom: 'rgba(255,65,20,0.14)',
        btnBg:    'rgba(255,65,20,0.14)',
        btnColor: '#b32000',
        labelColor: 'rgba(180,30,0,0.75)',
      } : {
        cardBg:   '#f5f5f7',
        gradFrom: 'rgba(0,0,0,0.04)',
        btnBg:    'rgba(0,0,0,0.10)',
        btnColor: '#0d0d0d',
        labelColor: 'rgba(0,0,0,0.28)',
      };

      // Фон карточки
      card.style.setProperty('background',       scheme.cardBg, 'important');
      card.style.setProperty('background-color', scheme.cardBg, 'important');
      card.style.setProperty('border',           'none',        'important');

      // ── Пилюля: убираем фон, переставляем текст статуса под имя ────────────
      const pillWrap = card.querySelector(
        '.mez-bg-themeLayerBgSuccess, .mez-bg-themeLayerBgWarning, .mez-bg-themeLayerBgNeutral, .mez-rounded-\\[100px\\]'
      );
      const statusText = pillWrap
        ? (pillWrap.querySelector('[data-i18n-key]')?.textContent?.trim() ?? '')
        : '';

      // ── Пилюля: скрываем целиком ──────────────────────────────────────────
      if (pillWrap) {
        pillWrap.style.setProperty('display', 'none', 'important');
      }

      // Вставляем строку статуса под именем, если её ещё нет
      const topCol = card.querySelector('.mez-gap-\\[8px\\]');
      if (topCol && statusText && !topCol.querySelector('.mh-status-line')) {
        const line = document.createElement('div');
        line.className = 'mh-status-line';
        line.textContent = statusText;
        line.style.cssText = `
          font-size: 11px !important;
          font-weight: 700 !important;
          letter-spacing: 0.04em !important;
          text-transform: uppercase !important;
          color: ${scheme.labelColor} !important;
          margin-top: -2px !important;
        `;
        const nameRow2 = topCol.querySelector('.mez-justify-between');
        if (nameRow2?.nextSibling)
          topCol.insertBefore(line, nameRow2.nextSibling);
        else if (nameRow2)
          topCol.appendChild(line);
      }

      // Номер ячейки → правый верхний угол внутри строки имени
      // Ищем именно flex-row с именем, а не внешний flex-col (который тоже justify-between)
      const nameSpan = card.querySelector('.mez-text-m-subhead, [class*="mez-text-m-subhead"]');
      const nameRow  = nameSpan?.parentElement;
      const cellNum  = card.querySelector('.mez-text-themeTextControlSecondaryDisabled');
      if (cellNum && nameRow && !nameRow.querySelector('.mh-cell-badge')) {
        const badge = document.createElement('span');
        badge.className = 'mh-cell-badge';
        badge.textContent = cellNum.textContent.trim();
        badge.style.cssText = `
          font-size: 32px !important;
          font-weight: 900 !important;
          color: ${scheme.labelColor} !important;
          letter-spacing: -0.03em !important;
          flex-shrink: 0 !important;
          align-self: flex-start !important;
          margin-left: auto !important;
        `;
        nameRow.appendChild(badge);
      }

      // Скрываем оригинальную строку «Ячейка: X» — ищем через лейбл
      const cellLabel = card.querySelector(
        '[data-i18n-key="pages.client-issuing-session-list:session-card.cells.label"]'
      );
      const cellRow = cellLabel?.closest('.mez-flex-row');
      if (cellRow) cellRow.style.setProperty('display', 'none', 'important');

      // ── Кнопка «Перейти» ──────────────────────────────────────────────────
      const btnPrimary = card.querySelector('.mez-bg-themeControlPrimary');
      if (btnPrimary) {
        btnPrimary.setAttribute('data-mh-patched', '1');

        const applyBtnStyle = btn => {
          btn.classList.remove('mez-bg-themeControlPrimary');
          CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'background-color', 'rgba(255,255,255,0.88)', 'important');
          CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'background',       'rgba(255,255,255,0.88)', 'important');
          CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'color',            '#0d0d0d',               'important');
          CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'border-radius',    '100px',                 'important');
          CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'border',           '1.5px solid rgba(0,0,0,0.12)', 'important');
          CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'box-shadow',       '0 1px 4px rgba(0,0,0,0.08)', 'important');
          CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'transition',       'background 0.14s ease, box-shadow 0.14s ease, transform 0.10s ease', 'important');
          btn.querySelectorAll('span').forEach(s => {
            CSSStyleDeclaration.prototype.setProperty.call(s.style, 'color',       '#0d0d0d', 'important');
            CSSStyleDeclaration.prototype.setProperty.call(s.style, 'font-weight', '600',     'important');
            CSSStyleDeclaration.prototype.setProperty.call(s.style, 'font-size',   '13px',    'important');
          });

          // Hover / active
          btn.onmouseenter = () => {
            CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'background-color', '#ffffff', 'important');
            CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'background',       '#ffffff', 'important');
            CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'box-shadow', '0 2px 8px rgba(0,0,0,0.14)', 'important');
          };
          btn.onmouseleave = () => {
            CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'background-color', 'rgba(255,255,255,0.88)', 'important');
            CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'background',       'rgba(255,255,255,0.88)', 'important');
            CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'box-shadow', '0 1px 4px rgba(0,0,0,0.08)', 'important');
            btn.style.removeProperty('transform');
          };
          btn.onmousedown = () => CSSStyleDeclaration.prototype.setProperty.call(btn.style, 'transform', 'scale(0.96)', 'important');
          btn.onmouseup   = () => btn.style.removeProperty('transform');
        };

        // Перехватываем setProperty на этом элементе — redesign.js не пройдёт
        const BLOCKED_VALUES = ['#ff5149', 'rgb(255, 81, 73)', 'rgb(255,81,73)', 'ff5149'];
        const origSet = CSSStyleDeclaration.prototype.setProperty;
        const btnScheme = scheme; // замыкание
        Object.defineProperty(btnPrimary.style, 'setProperty', {
          configurable: true,
          value: function(prop, value, priority) {
            // Блокируем только попытки поставить красный/белый на background/color
            const isColorProp = prop === 'background-color' || prop === 'background'
                             || prop === 'color' || prop === 'border-color';
            const isRedesignVal = BLOCKED_VALUES.some(v =>
              typeof value === 'string' && value.toLowerCase().includes(v.toLowerCase().replace('#','').trim()));
            if (isColorProp && isRedesignVal) return; // игнорируем
            origSet.call(this, prop, value, priority);
          },
        });

        applyBtnStyle(btnPrimary);

        // MutationObserver как страховка от возврата класса
        new MutationObserver(() => {
          if (btnPrimary.classList.contains('mez-bg-themeControlPrimary'))
            applyBtnStyle(btnPrimary);
        }).observe(btnPrimary, { attributes: true, attributeFilter: ['class'] });
      }

      // ── Кнопка «⋮» ────────────────────────────────────────────────────────
      const btnSecondary = card.querySelector('.mez-bg-themeControlSecondary');
      if (btnSecondary) {
        btnSecondary.setAttribute('data-mh-patched', '1');
        btnSecondary.style.setProperty('background-color', 'rgba(0,0,0,0.08)', 'important');
        btnSecondary.style.setProperty('background',       'rgba(0,0,0,0.08)', 'important');
        btnSecondary.style.setProperty('color',            '#1a1a1a',          'important');
        btnSecondary.style.setProperty('border-radius',    '100px',            'important');
        btnSecondary.style.setProperty('border',           'none',             'important');
        btnSecondary.style.setProperty('box-shadow',       'none',             'important');
        btnSecondary.style.setProperty('padding',          '0',                'important');
        btnSecondary.style.setProperty('flex',             'none',             'important');
        btnSecondary.style.setProperty('align-self',       'center',           'important');
        btnSecondary.style.setProperty('width',            '38px',             'important');
        btnSecondary.style.setProperty('height',           '38px',             'important');
      }

      // Увеличиваем gap между кнопками
      const btnRow = card.querySelector('.mez-inline-flex.mez-flex-row.mez-gap-\\[4px\\]');
      if (btnRow) btnRow.style.setProperty('gap', '8px', 'important');
    });
  }

  /**
   * Авто-раскрытие свёрнутых групп заказов.
   *
   * Контент не присутствует в DOM до первого клика — React рендерит его лениво.
   * Кликаем только по кнопкам с aria-expanded="false", чтобы не закрывать уже
   * открытые. Используем Set для отслеживания уже развёрнутых кнопок — при
   * повторных вызовах из domObs не дёргаем их снова.
   */
  const expandedBtns = new WeakSet();

  function expandSessionGroups() {
    document.querySelectorAll('.mh-sessions-group button[aria-expanded="false"]').forEach(btn => {
      if (expandedBtns.has(btn)) return;
      expandedBtns.add(btn);
      btn.click();
    });
  }

  // ── Заголовок страницы ─────────────────────────────────────────────────────
  // Вызывается повторно из domObs — SPA может добавить элемент позже apply().
  function tryHideTitle() {
    if (state.titleHidden) return;
    const titleSpan = document.querySelector(`[data-i18n-key="${TITLE_KEY}"]`);
    if (!titleSpan) return;
    let node = titleSpan;
    for (let i = 0; i < 8; i++) {
      const p = node.parentElement;
      if (!p) break;
      if (p.className?.includes?.('mez-pt-[16px]') && p.className?.includes?.('mez-flex-col')) {
        node = p; break;
      }
      node = p;
    }
    node.classList.add('mh-issuing-title-hidden');
    state.titleHidden = true;
  }

  // ── Инъекция элементов в sc (без дублирования между apply и domObs) ────────

  /** Добавляет заголовок «Выдача заказов», если его ещё нет в sc */
  function ensureTitle(sc) {
    if (sc.querySelector('.mh-issuing-title')) return;
    const titleEl = makeEl('span', { className: 'mh-issuing-title', text: 'Выдача заказов' });
    sc.insertBefore(titleEl, sc.firstChild);
  }

  /** Добавляет плашки маркетплейсов, если их ещё нет в sc */
  function ensureBadges(sc) {
    if (sc.querySelector('.mh-badges')) return;
    const row = makeEl('div', { className: 'mh-badges' });
    const hints = {
      market:    'Маркет: введите номер заказа из приложения Маркета или QR-код.',
      avito:     'Авито: введите номер объявления или код получения из SMS.',
      lamoda:    'Lamoda: введите номер заказа из письма или приложения Lamoda.',
      cainiao:   'Cainiao: введите трек-номер или код получения из приложения.',
      ydostavka: 'Яндекс.Доставка: введите номер заказа из уведомления.',
    };
    BADGES.forEach(([key, label, imgFile]) => {
      const b = makeEl('span', { className: `mh-badge mh-badge-${key}` });
      b.title = label;
      const img = document.createElement('img');
      img.src = chrome.runtime.getURL(`img/tooltip/${imgFile}`);
      img.alt = label;
      b.appendChild(img);
      b.appendChild(makeEl('span', { className: 'mh-badge-label', text: label }));
      b.addEventListener('click', () => {
        window.MHAlert?.notify({ title: label, body: hints[key] ?? '' });
      });
      row.appendChild(b);
    });
    sc.appendChild(row);
  }

  /** Синхронизирует визуальное состояние тумблера с state.translitEnabled */
  function syncToggleBtn() {
    const btn = document.querySelector('.mh-toggle-btn');
    if (!btn) return;
    btn.classList.toggle('mh-toggle-on', state.translitEnabled);
    btn.setAttribute('aria-pressed', String(state.translitEnabled));
  }

  /**
   * Извлекает 8-значный outlet ID из текущего pathname.
   * Пример: /tpl-outlet/12345678/issuing → "12345678"
   */
  function getOutletId() {
    const m = location.pathname.match(/\/tpl-outlet\/(\d+)\//);
    return m ? m[1] : null;
  }

  /** Добавляет строку «подсказка + кнопки» внутрь панели (top, full-width) */
  function ensureActionButtons(sc) {
    if (sc.querySelector('.mh-action-buttons')) return;
    const wrap = makeEl('div', { className: 'mh-action-buttons' });

    // mousedown не должен снимать фокус с инпута
    wrap.addEventListener('mousedown', e => e.preventDefault());

    // ── Подсказка (левый flex-элемент) ───────────────────────────────────────
    wrap.appendChild(makeEl('span', {
      className: 'mh-search-hint',
      text: 'Найти по номеру заказа или грузоместа',
    }));

    // ── Тумблер «Корректировка ввода» ────────────────────────────────────────
    const toggle = makeEl('button', { className: 'mh-toggle-btn' });
    toggle.setAttribute('type', 'button');
    toggle.setAttribute('aria-pressed', String(state.translitEnabled));
    toggle.setAttribute('title', 'Авто-транслитерация и капитализация (ЙЦУКЕН → QWERTY)');
    if (state.translitEnabled) toggle.classList.add('mh-toggle-on');

    const track = makeEl('span', { className: 'mh-toggle-track' });
    track.appendChild(makeEl('span', { className: 'mh-toggle-thumb' }));
    toggle.appendChild(track);
    toggle.appendChild(document.createTextNode('Корректировка ввода'));

    toggle.addEventListener('click', () => {
      state.translitEnabled = !state.translitEnabled;
      chrome.storage.sync.set({ translitEnabled: state.translitEnabled });
      syncToggleBtn();
    });

    // ── Кнопки действий ──────────────────────────────────────────────────────
    const ICON_SEND = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L2 6.5l5 1.5 1.5 5L14 2z"/></svg>`;
    const ICON_FIND = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l3 3"/></svg>`;

    const btnSend = makeEl('button', {
      className: 'mh-action-btn mh-action-btn-secondary',
      html: ICON_SEND + 'Отправить этот заказ',
    });
    const btnFind = makeEl('button', {
      className: 'mh-action-btn mh-action-btn-primary',
      html: ICON_FIND + 'Найти этот заказ',
    });

    btnFind.addEventListener('click', () => {
      const query    = getInput()?.value.trim();
      const outletId = getOutletId();
      if (!query || !outletId) return;
      const url = `https://logistics.market.yandex.ru/tpl-outlet/${outletId}/order-list`
                + `?commonQuery=${encodeURIComponent(query)}`;
      location.href = url;
    });

    btnSend.addEventListener('click', () => {
      const query = getInput()?.value.trim();
      if (!query) return;
      const url = `https://hubs.market.yandex.ru/tpl-outlet/55948606/acceptance-request`
                + `?query=${encodeURIComponent(query)}&autosubmit=1`;
      window.open(url, '_blank');
    });

    wrap.appendChild(toggle);
    wrap.appendChild(btnSend);
    wrap.appendChild(btnFind);
    sc.appendChild(wrap);
    state.actionBtnsEl = wrap;
  }

  // ── Gap-менеджмент ────────────────────────────────────────────────────────

  /** Ищет flex-контейнер с mez-gap-[32px] и уменьшает его gap */
  function shrinkGap(sc) {
    let p = sc.parentElement;
    while (p && p !== document.body) {
      if (p.className?.includes?.('mez-gap-[32px]') || p.className?.includes?.('mez-gap-\\[32px\\]')) {
        if (!gapShrunkEls.includes(p)) {
          p.style.setProperty('gap', '12px', 'important');
          gapShrunkEls.push(p);
        }
        break;
      }
      p = p.parentElement;
    }
  }

  /** Восстанавливает gap у всех ранее уменьшенных контейнеров */
  function restoreGaps() {
    gapShrunkEls.forEach(p => p.style.removeProperty('gap'));
    gapShrunkEls.length = 0;
  }

  // ── Горячие клавиши ───────────────────────────────────────────────────────
  //
  // RCtrl+RShift+↑ → Отправить заказ
  // RCtrl+RShift+↓ → Найти заказ
  //
  // При нажатии RCtrl (пока панель в фокусе) показываем HUD с подсказкой.

  const hotkeyState = { rctrl: false, rshift: false, hudEl: null, hideTimer: null };

  function ensureHud() {
    if (hotkeyState.hudEl) return;
    const hud = makeEl('div', { id: 'mh-hotkey-hud' });
    hud.innerHTML = `
      <span class="mh-hotkey-chip">
        <kbd id="mh-hk-ctrl">RCtrl</kbd>
        <kbd id="mh-hk-shift">RShift</kbd>
        <kbd id="mh-hk-arrow">↑ / ↓</kbd>
      </span>
      <span class="mh-hotkey-divider"></span>
      <span class="mh-hotkey-label">
        <strong>↑</strong> Отправить &nbsp;·&nbsp; <strong>↓</strong> Найти
      </span>
    `;
    document.body.appendChild(hud);
    hotkeyState.hudEl = hud;
  }

  function showHud(activeKeys = []) {
    ensureHud();
    const hud = hotkeyState.hudEl;
    // Подсвечиваем нажатые клавиши
    hud.querySelector('#mh-hk-ctrl')?.classList.toggle('mh-key-active', activeKeys.includes('ctrl'));
    hud.querySelector('#mh-hk-shift')?.classList.toggle('mh-key-active', activeKeys.includes('shift'));
    hud.querySelector('#mh-hk-arrow')?.classList.toggle('mh-key-active', activeKeys.includes('arrow'));
    hud.classList.add('mh-hotkey-hud-visible');
    if (hotkeyState.hideTimer) { clearTimeout(hotkeyState.hideTimer); hotkeyState.hideTimer = null; }
  }

  function hideHud(delay = 0) {
    if (!hotkeyState.hudEl) return;
    if (hotkeyState.hideTimer) clearTimeout(hotkeyState.hideTimer);
    hotkeyState.hideTimer = setTimeout(() => {
      hotkeyState.hudEl?.classList.remove('mh-hotkey-hud-visible');
      hotkeyState.hideTimer = null;
    }, delay);
  }

  function removeHud() {
    if (hotkeyState.hideTimer) { clearTimeout(hotkeyState.hideTimer); hotkeyState.hideTimer = null; }
    hotkeyState.hudEl?.remove();
    hotkeyState.hudEl = null;
    hotkeyState.rctrl = false;
    hotkeyState.rshift = false;
  }

  function setupHotkeyListeners() {
    const onKeydown = e => {
      // Работаем только когда панель поиска в фокусе
      if (document.activeElement !== getInput()) return;

      if (e.code === 'ControlRight')  { hotkeyState.rctrl  = true; }
      if (e.code === 'ShiftRight')    { hotkeyState.rshift = true; }

      const active = [];
      if (hotkeyState.rctrl)  active.push('ctrl');
      if (hotkeyState.rshift) active.push('shift');

      if (hotkeyState.rctrl) showHud(active);

      if (hotkeyState.rctrl && hotkeyState.rshift) {
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
          e.preventDefault();
          e.stopImmediatePropagation();
          showHud(['ctrl', 'shift', 'arrow']);

          const query = getInput()?.value.trim();
          if (!query) { hideHud(800); return; }

          if (e.code === 'ArrowUp') {
            // Отправить заказ
            const url = `https://hubs.market.yandex.ru/tpl-outlet/55948606/acceptance-request`
                      + `?query=${encodeURIComponent(query)}&autosubmit=1`;
            hideHud(400);
            setTimeout(() => window.open(url, '_blank'), 400);
          } else {
            // Найти заказ
            const outletId = getOutletId();
            if (!outletId) { hideHud(800); return; }
            const url = `https://logistics.market.yandex.ru/tpl-outlet/${outletId}/order-list`
                      + `?commonQuery=${encodeURIComponent(query)}`;
            hideHud(400);
            setTimeout(() => { location.href = url; }, 400);
          }
        }
      }
    };

    const onKeyup = e => {
      if (e.code === 'ControlRight') { hotkeyState.rctrl  = false; }
      if (e.code === 'ShiftRight')   { hotkeyState.rshift = false; }

      // Если отпустили RCtrl и комбо не собрано — прячем HUD
      if (!hotkeyState.rctrl && !hotkeyState.rshift) hideHud(300);
      else if (!hotkeyState.rctrl) hideHud(600);
    };

    document.addEventListener('keydown', onKeydown, { capture: true });
    document.addEventListener('keyup',   onKeyup,   { capture: true });

    // Сохраняем для cleanup
    state._hotkeyDown = onKeydown;
    state._hotkeyUp   = onKeyup;
  }

  function teardownHotkeyListeners() {
    if (state._hotkeyDown) document.removeEventListener('keydown', state._hotkeyDown, { capture: true });
    if (state._hotkeyUp)   document.removeEventListener('keyup',   state._hotkeyUp,   { capture: true });
    state._hotkeyDown = null;
    state._hotkeyUp   = null;
    removeHud();
  }

  // ── Обработчики фокуса / блюра ────────────────────────────────────────────

  function showClickShield() {
    if (state.backdropEl) return;
    const shield = makeEl('div', { id: 'mh-click-shield' });
    shield.addEventListener('mousedown', e => {
      e.preventDefault();
      getInput()?.blur();
    });
    document.body.appendChild(shield);
    state.backdropEl = shield;
    updateShieldClip();
  }

  function updateShieldClip() {
    if (!state.backdropEl) return;
    const sc = getSc();
    if (!sc) { state.backdropEl.style.clipPath = ''; return; }
    const r = sc.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Внешний прямоугольник (весь экран) с дыркой по габаритам панели поиска.
    // clip-path: evenodd — область внутри дырки прозрачна для кликов.
    state.backdropEl.style.clipPath =
      `polygon(evenodd, ` +
      `0px 0px, ${W}px 0px, ${W}px ${H}px, 0px ${H}px, 0px 0px, ` +
      `${r.left}px ${r.top}px, ${r.right}px ${r.top}px, ` +
      `${r.right}px ${r.bottom}px, ${r.left}px ${r.bottom}px, ` +
      `${r.left}px ${r.top}px)`;
  }

  function hideClickShield() {
    state.backdropEl?.remove();
    state.backdropEl = null;
  }

  function setupFocusListeners() {
    state.inputFocusCb = function onInputFocus() {
      if (state.blurTimer) { clearTimeout(state.blurTimer); state.blurTimer = null; }
      const sc = getSc();
      if (sc) sc.classList.add('mh-issuing-focused');
      if (state.qrEl) state.qrEl.classList.add('mh-qr-focused');
      state.actionBtnsEl?.classList.add('mh-action-buttons-visible');
      showHud([]);
      showClickShield();
      // Пересчитываем дырку после завершения CSS-перехода расширения панели.
      // max-width: 0.25s — берём 300ms с запасом.
      setTimeout(updateShieldClip, 300);
    };

    state.inputBlurCb = function onInputBlur() {
      const sc = getSc();
      if (sc) sc.classList.remove('mh-issuing-focused');
      state.actionBtnsEl?.classList.remove('mh-action-buttons-visible');
      hideHud(250);
      hideClickShield();

      state.blurTimer = setTimeout(() => {
        state.blurTimer = null;
        if (state.qrEl) state.qrEl.classList.remove('mh-qr-focused');

        setTimeout(() => {
          const active     = document.activeElement;
          const dropdown   = document.querySelector('[data-testid="dropdown-list"]');
          const curSc      = getSc();
          const inSc       = curSc?.contains(active) ?? false;
          const inDropdown = dropdown?.contains(active) ?? false;
          // Кнопки — сиблинг sc; mousedown на них не снимает фокус,
          // но страхуемся: если фокус каким-то образом оказался там — не чистим
          const inButtons  = state.actionBtnsEl?.contains(active) ?? false;
          if (!inSc && !inDropdown && !inButtons) {
            const inp = getInput();
            if (inp?.value) {
              inp.classList.add('mh-input-clearing');
              setTimeout(() => {
                inp.value = '';
                inp.dispatchEvent(new Event('input',  { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                requestAnimationFrame(() => inp.classList.remove('mh-input-clearing'));
              }, 180);
            }
          }
        }, 0);
      }, 300);
    };

    // Делегируем через document capture — работает даже если React
    // пересоздал input-ноду после apply(). Проверяем что событие именно
    // от нашего инпута по data-testid.
    const focusWrapper = e => { if (e.target.matches(INPUT_SEL)) state.inputFocusCb(); };
    const blurWrapper  = e => { if (e.target.matches(INPUT_SEL)) state.inputBlurCb(); };
    state.inputFocusCb._wrapped = focusWrapper;
    state.inputBlurCb._wrapped  = blurWrapper;

    document.addEventListener('focus', focusWrapper, { capture: true });
    document.addEventListener('blur',  blurWrapper,  { capture: true });
  }

  // ── Listener дропдауна ─────────────────────────────────────────────────────

  // Клик по пункту дропдауна → показываем лоадер.
  // Прячем по mh-nav: SPA-навигация на страницу выдачи конкретного заказа
  // диспатчит этот ивент через наш хук pushState.
  function setupDropdownListener(sc) {
    state.dropdownCb = e => {
      if (!e.target.closest('[data-testid="dropdown-item"]')) return;
      // Стреляем только если это поисковый дропдаун:
      // наш инпут должен существовать и иметь непустое значение.
      const inp = getInput();
      if (!inp?.value.trim()) return;
      showLoader(sc);
    };
    document.addEventListener('mousedown', state.dropdownCb, { capture: true });
  }

  // ── Apply / Revert ────────────────────────────────────────────────────────
  function apply() {
    if (state.applied) return;

    const input = getInput();
    if (!input) return;

    const sc = input.parentElement;
    if (!sc) return;

    state.scNode = sc;

    sc.classList.add('mh-issuing-wrap');
    shrinkGap(sc);
    ensureTitle(sc);
    ensureBadges(sc);
    ensureActionButtons(sc);

    // Обёртка непосредственного родителя инпута внутри sc
    let cur = input;
    while (cur.parentElement && cur.parentElement !== sc) cur = cur.parentElement;
    if (cur !== sc) cur.classList.add('mh-input-wrap');

    createLoader(sc);
    createQrBlock();

    input.setAttribute('placeholder', 'Найти по номеру заказа или грузоместа');
    keepPlaceholder();
    setupTransliteration(input);

    setupFocusListeners();
    setupDropdownListener(sc);
    setupHotkeyListeners();

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll,  { passive: true, capture: true });

    tryHideTitle();
    observeAncestors(sc);

    // Двойной rAF — основной путь (React уже отрисовал)
    requestAnimationFrame(() => requestAnimationFrame(placeQr));
    // Страховочные таймеры на случай медленного layout при начальной загрузке
    schedulePlaceQr(300);
    schedulePlaceQr(800);

    applySessionGroups();

    // Авто-раскрываем свёрнутые группы после того как React стабилизировал DOM.
    // Двойной rAF + 150ms: контент рендерится лениво, поэтому нужен небольшой буфер.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      expandSessionGroups();
      setTimeout(() => { expandSessionGroups(); patchCardStyles(); }, 150);
      setTimeout(() => { expandSessionGroups(); patchCardStyles(); }, 500);
      setTimeout(patchCardStyles, 1000);
    }));

    state.applied = true;
  }

  // cleanupDom всегда убирает DOM-артефакты — вызывается даже если applied=false,
  // например когда apply() не нашёл input и не завершился, а QR/backdrop
  // остались от предыдущего сеанса.
  function cleanupDom() {
    document.getElementById('mh-loader')?.remove();    state.loaderEl  = null;
    document.getElementById('mh-qr-block')?.remove(); state.qrEl      = null;
    document.getElementById('mh-click-shield')?.remove(); state.backdropEl = null;

    restoreGaps();

    document.querySelectorAll('.mh-sessions-group').forEach(el => {
      const parent = el.parentElement;
      if (parent) parent.style.removeProperty('gap');
      el.classList.remove('mh-sessions-group', 'mh-sessions-group-active');
    });
    document.querySelectorAll('.mh-active-label').forEach(el => el.remove());
    document.querySelectorAll('.mh-group-title').forEach(el => el.remove());

    // Восстанавливаем скрытые оригинальные span'ы
    document.querySelectorAll('[data-i18n-key^="pages.client-issuing-session-list:group.title"]')
      .forEach(span => {
        const row = span.closest('button')?.querySelector('[class*="flex-row"]');
        if (row) Array.from(row.children).forEach(ch => ch.style.removeProperty('display'));
      });

    document.querySelectorAll('.mh-issuing-title').forEach(el => el.remove());
    document.querySelectorAll('.mh-badges').forEach(el => el.remove());
    document.querySelectorAll('.mh-action-buttons').forEach(el => el.remove());
    document.querySelectorAll('.mh-issuing-wrap').forEach(el =>
      el.classList.remove('mh-issuing-wrap', 'mh-issuing-focused'));
    document.querySelectorAll('.mh-input-wrap').forEach(el =>
      el.classList.remove('mh-input-wrap'));
    document.querySelectorAll('.mh-issuing-title-hidden').forEach(el =>
      el.classList.remove('mh-issuing-title-hidden'));

    document.getElementById(STYLE_ID)?.remove();
  }

  function revert() {
    // cleanupDom всегда, независимо от applied — страхует от висящих артефактов
    cleanupDom();
    if (!state.applied) return;

    unobserveAncestors();

    if (state.posTimer)  { clearTimeout(state.posTimer);  state.posTimer  = null; }
    if (state.dropdownCb) {
      document.removeEventListener('mousedown', state.dropdownCb, { capture: true });
      state.dropdownCb = null;
    }
    if (state.blurTimer) { clearTimeout(state.blurTimer); state.blurTimer = null; }

    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, { capture: true });

    state.pObs?.disconnect(); state.pObs = null;

    if (state.inputFocusCb?._wrapped)
      document.removeEventListener('focus', state.inputFocusCb._wrapped, { capture: true });
    if (state.inputBlurCb?._wrapped)
      document.removeEventListener('blur',  state.inputBlurCb._wrapped,  { capture: true });

    teardownHotkeyListeners();

    const input = getInput();
    if (input) input.setAttribute('placeholder', 'Номер заказа');

    state.inputFocusCb   = null;
    state.inputBlurCb    = null;
    state.applied        = false;
    state.navBlocking    = false;
    state.titleHidden    = false;
    state.applyScheduled = false;
    state.scNode         = null;
    state.actionBtnsEl   = null;
    state.backdropEl     = null;
  }

  // ── domObs ─────────────────────────────────────────────────────────────────
  function startDomObserver() {
    if (state.domObs) return;
    state.domObs = new MutationObserver(() => {
      if (!state.enabled) return;

      const inputPresent = !!getInput();

      // Инпут исчез — убираем всё, независимо от URL
      if (state.applied && !inputPresent) { revert(); return; }

      // Инпут появился — откладываем apply() на двойной rAF:
      // MutationObserver стреляет внутри пакета React-мутаций; если
      // вызвать apply() прямо здесь, sc (input.parentElement) может быть
      // ещё промежуточной нодой. Двойной rAF гарантирует, что React завершил
      // reconciliation и DOM стабилен — тогда mh-issuing-wrap встаёт на
      // правильный контейнер и паддинги совпадают с вариантом hard-reload.
      if (!state.applied && !state.applyScheduled && inputPresent) {
        injectStyle();
        state.applyScheduled = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          state.applyScheduled = false;
          apply();
        }));
        return;
      }

      if (!state.applied || state.navBlocking) return;

      const currentSc = getSc();

      // React пересоздал ноду sc (например, при hot-update или перемонтировании):
      // сохранённая state.scNode больше не совпадает с актуальным parentElement.
      // Единственный надёжный вариант — полный revert + повторный apply.
      if (currentSc && currentSc !== state.scNode) {
        revert();
        injectStyle();
        state.applyScheduled = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          state.applyScheduled = false;
          apply();
        }));
        return;
      }

      // Ретрай скрытия заголовка
      if (state.titleHidden) {
        const titleSpan = document.querySelector(`[data-i18n-key="${TITLE_KEY}"]`);
        if (titleSpan && !titleSpan.closest('.mh-issuing-title-hidden'))
          state.titleHidden = false;
      }
      tryHideTitle();
      applySessionGroups();
      expandSessionGroups();
      patchCardStyles();

      const sc = currentSc;
      if (sc) {
        if (!sc.classList.contains('mh-issuing-wrap')) {
          sc.classList.add('mh-issuing-wrap');
          unobserveAncestors();
          observeAncestors(sc);
          requestAnimationFrame(placeQr);
        }
        // React может снести наши элементы при ре-рендере — восстанавливаем
        ensureTitle(sc);
        ensureBadges(sc);
        ensureActionButtons(sc);
        // Обновляем ссылку на случай пересоздания
        if (!state.actionBtnsEl || !state.actionBtnsEl.isConnected)
          state.actionBtnsEl = sc.querySelector('.mh-action-buttons') ?? null;
      }
    });
    state.domObs.observe(document.body, { childList: true, subtree: true });
  }

  function stopDomObserver() {
    state.domObs?.disconnect();
    state.domObs = null;
  }

  // ── Патч redesign.js ──────────────────────────────────────────────────────
  // redesign.js вызывает fixButtonColors() каждые 2с через requestIdleCallback
  // и принудительно красит все button[class*="themeControlPrimary"] в красный.
  // Перехватываем querySelectorAll на document и фильтруем наши кнопки.
  (function patchRedesignQuerySelector() {
    const orig = document.querySelectorAll.bind(document);
    document.querySelectorAll = function (sel) {
      const result = orig(sel);
      // Проверяем только тот запрос который делает fixButtonColors
      if (
        typeof sel === 'string' &&
        sel.includes('themeControlPrimary') &&
        !sel.includes('mh-')
      ) {
        // Возвращаем NodeList без наших пропатченных кнопок
        const filtered = Array.from(result).filter(
          el => !el.hasAttribute('data-mh-patched')
        );
        // Имитируем NodeList — возвращаем массив с нужными методами
        Object.defineProperty(filtered, 'forEach', {
          value: Array.prototype.forEach,
          configurable: true,
        });
        return filtered;
      }
      return result;
    };
  })();

  // ── Авто-сабмит на странице acceptance-request ───────────────────────────
  // Срабатывает когда "Отправить этот заказ" (кнопка или горячая клавиша)
  // открывает новую вкладку с параметром &autosubmit=1.
  // Скрипт заполняет поле ввода значением из ?query= и нажимает Enter.

  function initAcceptancePage() {
    if (!location.href.includes('acceptance-request')) return;
    const params = new URLSearchParams(location.search);
    if (!params.get('autosubmit')) return;
    const query = params.get('query');
    if (!query) return;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    )?.set;

    function fillAndSubmit() {
      // Ищем первый видимый незаполненный инпут
      const input = Array.from(document.querySelectorAll('input')).find(
        el => !el.hidden && el.offsetParent !== null
      );
      if (!input) return false;

      // Вставляем значение через нативный setter (обходит React-controlled)
      if (nativeSetter) nativeSetter.call(input, query);
      else input.value = query;

      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus();

      // Enter через 350ms — ждём пока React обработает значение
      setTimeout(() => {
        ['keydown', 'keypress', 'keyup'].forEach(type => {
          input.dispatchEvent(new KeyboardEvent(type, {
            key: 'Enter', code: 'Enter', keyCode: 13,
            which: 13, bubbles: true, cancelable: true,
          }));
        });
      }, 350);

      return true;
    }

    // Пробуем сразу — если DOM уже готов
    if (!fillAndSubmit()) {
      // Иначе ждём через MutationObserver
      const obs = new MutationObserver(() => {
        if (fillAndSubmit()) obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
      // Страховочный таймер 4с
      setTimeout(() => { fillAndSubmit(); obs.disconnect(); }, 4000);
    }
  }

  // ── SPA-навигация ──────────────────────────────────────────────────────────
  function hookSPA() {
    const orig = history.pushState.bind(history);
    history.pushState = function (...args) {
      orig(...args);
      window.dispatchEvent(new Event('mh-nav'));
    };
    window.addEventListener('popstate', () =>
      window.dispatchEvent(new Event('mh-nav')));
    window.addEventListener('mh-nav', () => {
      if (!state.enabled) return;
      if (isIssuingPage()) {
        if (state.loaderEl) hideLoader(getSc());
        if (state.applied) revert();
        injectStyle();
        startDomObserver();
        // navBlocking защищает domObs от preждевременных tryHideTitle /
        // applySessionGroups. apply() сам по себе ждёт двойного rAF в domObs,
        // поэтому navBlocking не нужен — но держим его как страховку.
        state.navBlocking = true;
        setTimeout(() => { state.navBlocking = false; }, 600);
      } else {
        revert();
        stopDomObserver();
      }
    });
  }

  // ── Инициализация ──────────────────────────────────────────────────────────
  function init() {
    initAcceptancePage();
    chrome.storage.sync.get({ newIssuingEnabled: false, translitEnabled: true }, data => {
      state.translitEnabled = !!data.translitEnabled;
      state.enabled = !!data.newIssuingEnabled;
      if (state.enabled) {
        startDomObserver();
        if (isIssuingPage()) { injectStyle(); apply(); }
      }
    });
    chrome.storage.onChanged.addListener(changes => {
      if ('newIssuingEnabled' in changes) {
        state.enabled = !!changes.newIssuingEnabled.newValue;
        if (state.enabled) {
          injectStyle();
          if (isIssuingPage()) { startDomObserver(); if (!state.applied) apply(); }
        } else {
          revert();
          stopDomObserver();
        }
      }
    });
  }

  // ── Запуск ────────────────────────────────────────────────────────────────
  hookSPA();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();