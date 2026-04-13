(function () {
  'use strict';

  const STYLE_ID      = 'mh-acceptance-style';
  const ACCEPTANCE_RE = /\/acceptance-request(?:\/)?$/;
  const state         = { enabled: false, obs: null, raf: null };

  const isAcceptancePage = () => ACCEPTANCE_RE.test(location.pathname);

  /*
    Почему поиск "прыгает":
      Приёмка: search внутри leftRow → gap24 → визуально ROW-1
      Архив:   search внутри filtersRow → cardBtop → визуально ROW-2

    Решение: display:contents на ВСЕХ промёжуточных обёртках.
    Тогда toggle, search, date, type, reset — все прямые flex-items
    innerWrap в ОДНОМ ряду, в обоих режимах.

    Белая карточка контролов: ::before на innerWrap, высота = расстояние
    от верха innerWrap до верха tableWrapper - 16px (зазор).
    Вычисляется в JS после каждого рендера.

    tableWrapper: flex: 0 0 100% → перенос на новую строку, своя карточка.
  */

  const CSS = `
    body { background-color: #f0f0f2 !important; }

    /* ── innerWrap: единый прозрачный flex-контейнер ──────────────────────── */
    .mh-outer-card {
      position      : relative !important;
      isolation     : isolate !important;
      display       : flex !important;
      flex-direction: row !important;
      flex-wrap     : wrap !important;
      align-items   : center !important;
      gap           : 0 10px !important;
      padding       : 0 24px !important;
      box-sizing    : border-box !important;
      background    : transparent !important;
      overflow      : visible !important;
    }

    /* Белая карточка контролов — псевдоэлемент, высота из JS-переменной */
    .mh-outer-card::before {
      content       : '' !important;
      position      : absolute !important;
      inset         : 0 0 auto 0 !important;
      height        : var(--mh-ch, 52px) !important;
      background    : #fff !important;
      border-radius : 20px !important;
      box-shadow    : 0 0 0 1px rgba(0,0,0,.06),
                      0 4px 20px rgba(0,0,0,.09) !important;
      z-index       : -1 !important;
      pointer-events: none !important;
    }

    /* Все промёжуточные обёртки — прозрачны */
    .mh-gap24,
    .mh-card-a,
    .mh-left-row,
    .mh-card-b-top,
    .mh-filters-row {
      display: contents !important;
    }

    /* Скрыть заголовок, кнопку Доставки */
    .mh-section-title { display: none !important; }
    .mh-card-a-right  { display: none !important; }

    /* Все элементы первой строки — одинаковые отступы сверху/снизу */
    .mh-outer-card [data-testid="toggle-button-group"],
    .mh-search-wrap,
    .mh-outer-card .mez-flex-col.mez-gap-\[8px\].mez-relative,
    .mh-outer-card .mez-inline-flex.mez-flex-col,
    .mh-outer-card .mez-justify-center {
      margin-top    : 14px !important;
      margin-bottom : 14px !important;
      flex-shrink   : 0 !important;
    }

    /* Тоггл */
    .mh-outer-card [data-testid="toggle-button-group"] {
      order: 0 !important;
    }

    /* Поиск — Приёмка (inputmode=search) и Архив (mh-search-wrap) */
    .mh-search-wrap {
      order    : 1 !important;
      flex     : 1 1 auto !important;
      min-width: 140px !important;
      max-width: 260px !important;
    }

    /* Инпуты поиска */
    .mh-search-wrap input {
      display       : block !important;
      width         : 100% !important;
      box-sizing    : border-box !important;
      background    : #f5f5f7 !important;
      border-radius : 12px !important;
      padding       : 9px 14px !important;
      font-size     : 14px !important;
      font-weight   : 500 !important;
      border        : none !important;
      outline       : 2px solid transparent !important;
      box-shadow    : none !important;
      color         : #1a1a1a !important;
      transition    : background .18s, outline-color .18s !important;
    }
    .mh-search-wrap input:focus,
    .mh-search-wrap input:active {
      background    : #ebebed !important;
      outline-color : rgba(255,65,20,.35) !important;
      box-shadow    : none !important;
    }
    .mh-search-wrap input::placeholder {
      color: rgba(0,0,0,.30) !important; font-weight: 400 !important;
    }

    /* Float-label инпуты (дата, тип) */
    .mh-outer-card input:not([type="hidden"]) {
      background    : #f5f5f7 !important;
      border-radius : 12px !important;
      border        : none !important;
      outline       : 2px solid transparent !important;
      box-shadow    : none !important;
      color         : #1a1a1a !important;
      font-size     : 14px !important;
      font-weight   : 500 !important;
      transition    : background .18s, outline-color .18s !important;
    }
    .mh-outer-card input:not([type="hidden"]):focus,
    .mh-outer-card input:not([type="hidden"]):active {
      background    : #ebebed !important;
      outline-color : rgba(255,65,20,.35) !important;
      box-shadow    : none !important;
    }

    /* Кнопки «Сбросить» */
    .mh-outer-card button:not([data-testid]) {
      background    : #f5f5f7 !important;
      border-radius : 12px !important;
      border        : none !important;
      padding       : 10px 16px !important;
      font-size     : 14px !important;
      font-weight   : 600 !important;
      font-family   : -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
      color         : #1a1a1a !important;
      cursor        : pointer !important;
      white-space   : nowrap !important;
      box-shadow    : none !important;
      transition    : background .15s, transform .10s !important;
    }
    .mh-outer-card button:not([data-testid]):hover  { background: #ebebed !important; }
    .mh-outer-card button:not([data-testid]):active {
      background: #e3e3e6 !important; transform: scale(0.96) !important;
    }

    /* Поставки — последний item, прижать вправо */
    .mh-supplies-col {
      order       : 99 !important;
      margin-left : auto !important;
      flex-shrink : 0 !important;
      position    : static !important;
      transform   : none !important;
    }
    .mh-supplies-col span:has(>
      [data-i18n-key="widgets.acceptance-sessions:supplies.title"])    { display: none !important; }
    .mh-supplies-col span:has(>
      [data-i18n-key="widgets.acceptance-statistics:statistics.waiting-today"]) { display: none !important; }
    .mh-supplies-col svg[aria-label="icon-questionCircle"] { display: none !important; }
    .mh-supplies-col div:has(> img[src*="3dScanner"])       { display: none !important; }
    .mh-supplies-col
      span:has(> [data-i18n-key="widgets.acceptance-statistics:statistics.cargos"]) {
      display       : inline-flex !important;
      align-items   : center !important;
      gap           : 6px !important;
      background    : #f5f5f7 !important;
      border-radius : 20px !important;
      padding       : 5px 12px !important;
      font-size     : 13px !important;
      font-weight   : 600 !important;
      font-family   : -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif !important;
      white-space   : nowrap !important;
      color         : #1a1a1a !important;
    }
    .mh-supplies-col
      span:has(> [data-i18n-key="widgets.acceptance-statistics:statistics.cargos"])::before {
      content       : '' !important;
      display       : inline-block !important;
      width         : 7px !important; height: 7px !important;
      border-radius : 50% !important;
      background    : #fc642d !important;
      flex-shrink   : 0 !important;
    }

    /* ── Таблица — своя карточка на новой строке ────────────────────────────── */
    .mh-table-card {
      /* Занимает полную ширину → перенос на следующую строку */
      flex          : 0 0 calc(100% + 48px) !important;
      /* Выезжает за padding карточки, чтобы быть полной ширины */
      margin        : 0 -24px !important;
      /* Визуальный зазор от строки контролов будет через padding-top */
      padding-top   : 16px !important;
      /* Нет своего фона — нужна вложенная карточка; используем ::before */
      position      : relative !important;
      background    : transparent !important;
      box-sizing    : border-box !important;
      order         : 100 !important;
    }
    /* Белая карточка таблицы */
    .mh-table-card::before {
      content       : '' !important;
      position      : absolute !important;
      inset         : 16px 0 0 0 !important;
      background    : #fff !important;
      border-radius : 20px !important;
      box-shadow    : 0 0 0 1px rgba(0,0,0,.06),
                      0 4px 16px rgba(0,0,0,.07) !important;
      z-index       : -1 !important;
      pointer-events: none !important;
    }
    .mh-table-card > * {
      position: relative !important;
      z-index  : 0 !important;
    }
    .mh-table-card [data-testid="table-pager"] {
      border-top: 1px solid rgba(0,0,0,.06) !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function removeStyle() { document.getElementById(STYLE_ID)?.remove(); }

  /* ── Обновить высоту белой карточки контролов ─────────────────────────── */
  function updateCardHeight() {
    const card  = document.querySelector('.mh-outer-card');
    const table = card?.querySelector('.mh-table-card');
    if (!card || !table) return;
    const cardRect  = card.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    if (tableRect.top > cardRect.top) {
      card.style.setProperty('--mh-ch', (tableRect.top - cardRect.top) + 'px');
    }
  }

  /* ── applyCards ──────────────────────────────────────────────────────────── */
  function applyCards() {
    const toggle = document.querySelector('[data-testid="toggle-button-group"]');
    if (!toggle) return;

    const leftRow   = toggle.parentElement;
    const cardA     = leftRow?.parentElement;
    const gap24     = cardA?.parentElement;
    const innerWrap = gap24?.parentElement;
    if (!innerWrap) return;

    /* innerWrap → единый flex-контейнер */
    innerWrap.classList.add('mh-outer-card');
    innerWrap.style.paddingTop = '0';
    innerWrap.style.gap        = '0';

    /* Все промёжуточные обёртки → display:contents */
    gap24?.classList.add('mh-gap24');
    gap24 && (gap24.style.gap = '0');
    cardA?.classList.add('mh-card-a');
    leftRow?.classList.add('mh-left-row');

    /* Правая часть cardA (кнопка Доставки и прочее) → скрыть */
    Array.from(cardA?.children ?? []).forEach(el => {
      if (el !== leftRow) el.classList.add('mh-card-a-right');
    });

    /* Поиск в Приёмке (inputmode=search в leftRow) */
    leftRow?.querySelectorAll(':scope > div').forEach(el => {
      if (el.querySelector('input[inputmode="search"]'))
        el.classList.add('mh-search-wrap');
    });

    /* Поиск в Архиве (filters.query в cardBtop) */
    const archiveSearch = document.querySelector(
      '[data-i18n-key="widgets.acceptance-archive:filters.query"]'
    );
    if (archiveSearch) {
      const wrap = archiveSearch.closest(
        '.mez-flex-col.mez-gap-\\[8px\\].mez-relative, [class*="mez-flex-col"][class*="mez-gap-"]'
      ) ?? archiveSearch.parentElement?.parentElement;
      wrap?.classList.add('mh-search-wrap');
    }

    /* Поставки */
    for (const child of gap24?.children ?? []) {
      if (
        !child.classList.contains('mh-card-a') &&
        child.querySelector('[data-i18n-key="widgets.acceptance-sessions:supplies.title"]')
      ) child.classList.add('mh-supplies-col');
    }

    /* cardBtop и filtersRow → display:contents */
    const subtitle = document.querySelector(
      '[data-i18n-key="pages.acceptance-request:page.subtitle.ACCEPTANCE"],' +
      '[data-i18n-key="pages.acceptance-request:page.subtitle.ARCHIVE"]'
    );
    if (subtitle) {
      const cardBtop = subtitle.parentElement?.parentElement;
      cardBtop?.classList.add('mh-card-b-top');
      subtitle.parentElement?.classList.add('mh-section-title');
      cardBtop?.querySelectorAll(':scope > div.mez-flex-row').forEach(el =>
        el.classList.add('mh-filters-row')
      );
    }

    /* Таблица */
    const table = document.querySelector(
      '[data-testid="acceptance-request-table-ready"]'
    );
    table?.parentElement?.parentElement?.classList.add('mh-table-card');

    /* Обновить высоту карточки контролов */
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(() => {
      state.raf = requestAnimationFrame(updateCardHeight);
    });
  }

  /* ── revert ──────────────────────────────────────────────────────────────── */
  function revertCards() {
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
    [
      'mh-outer-card',
      'mh-gap24','mh-card-a','mh-left-row','mh-card-a-right','mh-search-wrap',
      'mh-supplies-col',
      'mh-card-b-top','mh-section-title','mh-filters-row',
      'mh-table-card',
    ].forEach(c => document.querySelectorAll('.' + c).forEach(el => {
      el.classList.remove(c);
      el.style.removeProperty('--mh-ch');
    }));

    const toggle = document.querySelector('[data-testid="toggle-button-group"]');
    if (toggle) {
      const gap24     = toggle.parentElement?.parentElement?.parentElement;
      const innerWrap = gap24?.parentElement;
      if (gap24)     gap24.style.gap = '';
      if (innerWrap) { innerWrap.style.gap = ''; innerWrap.style.paddingTop = ''; }
    }
    removeStyle();
  }

  /* ── Observer ────────────────────────────────────────────────────────────── */
  function startObs() {
    if (state.obs) return;
    let scheduled = false;
    state.obs = new MutationObserver(() => {
      if (!state.enabled || !isAcceptancePage()) return;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; applyCards(); });
    });
    state.obs.observe(document.body, { childList: true, subtree: true });
  }
  function stopObs() { state.obs?.disconnect(); state.obs = null; }

  /* ── SPA ─────────────────────────────────────────────────────────────────── */
  function hookSPA() {
    const orig = history.pushState.bind(history);
    history.pushState = function (...a) { orig(...a); window.dispatchEvent(new Event('mh-nav')); };
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('mh-nav')));
    window.addEventListener('mh-nav', () => {
      if (!state.enabled) return;
      if (isAcceptancePage()) { injectStyle(); startObs(); applyCards(); }
      else                    { revertCards(); stopObs(); }
    });
  }

  /* ── Init ────────────────────────────────────────────────────────────────── */
  function init() {
    chrome.storage.sync.get({ newAcceptanceEnabled: false }, data => {
      state.enabled = !!data.newAcceptanceEnabled;
      if (state.enabled && isAcceptancePage()) { injectStyle(); startObs(); applyCards(); }
    });
    chrome.storage.onChanged.addListener(changes => {
      if (!('newAcceptanceEnabled' in changes)) return;
      state.enabled = !!changes.newAcceptanceEnabled.newValue;
      if (state.enabled) {
        injectStyle();
        if (isAcceptancePage()) { startObs(); applyCards(); }
      } else { revertCards(); stopObs(); }
    });
  }

  hookSPA();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();