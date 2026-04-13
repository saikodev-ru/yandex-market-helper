/**
 * news.js — Компактные новостные блоки v3
 * + кнопка «Скрыть» с кастомным диалогом
 * + скрытые блоки сохраняются в chrome.storage.sync
 * + восстановление через попап
 */

(function () {
  'use strict';

  const STYLE_ID    = 'mh-news-style';
  const GRID_ATTR   = 'data-mh-grid';
  const HIDDEN_KEY  = 'hiddenNewsBlocks'; // chrome.storage.sync key → string[]

  // Простой хеш заголовка — стабильный ID блока
  function blockId(title) {
    let h = 0;
    for (let i = 0; i < title.length; i++) {
      h = Math.imul(31, h) + title.charCodeAt(i) | 0;
    }
    return 'mh_' + Math.abs(h).toString(36);
  }

  // ── Стили ────────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `

      /* ── Грид ── */
      .mh-news-grid {
        display: grid !important;
        grid-template-columns: repeat(2, 1fr);
        align-items: start;
        gap: 8px;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* ── Блок ── */
      .mh-news-compact {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        justify-content: flex-start !important;
        flex-wrap: nowrap !important;
        padding: 0 !important;
        gap: 0 !important;
        overflow: hidden;
      }
      .mh-news-compact > .mh-news-header {
        width: 100% !important;
        align-self: stretch !important;
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .mh-news-compact.mh-news-open .mh-news-header {
        box-shadow: inset 0 -1px 0 rgba(0,0,0,0.07);
      }
      .mh-news-body {
        overflow: hidden;
        height: 0;
        opacity: 0;
        padding: 0 14px;
        font-size: 13px;
        line-height: 1.55;
        transition: height 0.26s cubic-bezier(.4,0,.2,1),
                    opacity 0.20s,
                    padding 0.20s cubic-bezier(.4,0,.2,1);
        box-sizing: border-box;
      }
      .mh-news-body.mh-news-body-open {
        opacity: 1;
        padding: 4px 14px 12px;
      }

      /* ── Шапка ── */
      .mh-news-header {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 0;
        padding: 10px 10px 10px 14px;
        cursor: pointer;
        user-select: none;
        box-sizing: border-box;
        transition: background 0.15s;
      }
      .mh-news-header:hover { background: rgba(0,0,0,0.04); }

      /* Иконка */
      .mh-news-icon-wrap {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 10px;
      }
      .mh-news-icon-wrap svg {
        width: 20px !important;
        height: 20px !important;
        display: block;
      }

      /* Заголовок */
      .mh-news-title {
        flex: 1 1 0;
        min-width: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
        text-align: left;
        white-space: normal;
        word-break: break-word;
      }

      /* Правая группа кнопок */
      .mh-news-actions {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 2px;
        margin-left: auto;
        padding-left: 8px;
      }

      /* Общий стиль для обеих кнопок */
      .mh-news-btn,
      .mh-news-hide-btn {
        flex: 0 0 auto;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        color: inherit;
        line-height: 0;
        opacity: 0.38;
        transition: opacity 0.15s, background 0.15s;
      }
      .mh-news-header:hover .mh-news-btn,
      .mh-news-header:hover .mh-news-hide-btn { opacity: 0.6; }
      .mh-news-btn:hover,
      .mh-news-hide-btn:hover {
        opacity: 1 !important;
        background: rgba(0,0,0,0.07);
      }
      .mh-news-hide-btn:hover { color: #c0392b; }

      .mh-news-btn svg,
      .mh-news-hide-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform 0.22s cubic-bezier(.4,0,.2,1);
        display: block;
      }
      .mh-news-compact.mh-news-open .mh-news-btn svg {
        transform: rotate(180deg);
      }
    `;
    document.head.appendChild(s);
  }

  // ── Смешиваем полупрозрачный цвет с белым ────────────────────────────────
  // Баннеры используют rgba(r,g,b,a) — на странице они блендятся с белым фоном.
  // Телепортированное тело подложки не имеет, поэтому считаем итоговый цвет вручную.
  function blendOnWhite(cssColor) {
    const m = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return cssColor;
    const r = +m[1], g = +m[2], b = +m[3], a = m[4] !== undefined ? +m[4] : 1;
    if (a >= 1) return cssColor; // уже непрозрачный
    const rr = Math.round(255 * (1 - a) + r * a);
    const rg = Math.round(255 * (1 - a) + g * a);
    const rb = Math.round(255 * (1 - a) + b * a);
    return 'rgb(' + rr + ',' + rg + ',' + rb + ')';
  }

  // ── Позиционирование тела ────────────────────────────────────────────────
  function positionBody(body, header) {
    const r = header.getBoundingClientRect();
    body.style.top   = r.bottom + 'px';
    body.style.left  = r.left   + 'px';
    body.style.width = r.width  + 'px';
  }

  // ── Анимация тела ────────────────────────────────────────────────────────
  function openBody(body, header) {
    positionBody(body, header);
    // Порядок важен: сначала фиксируем height:0, потом добавляем класс с padding,
    // потом меряем scrollHeight (уже с padding) — контент не мелькает
    body.style.transition = 'none';
    body.style.height = '0';
    body.classList.add('mh-news-body-open');
    void body.offsetHeight; // reflow — браузер применяет padding, но height:0 держит закрытым
    const fullH = body.scrollHeight;
    body.style.transition = '';
    body.style.height = fullH + 'px';
    body.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'height') return;
      body.removeEventListener('transitionend', onEnd);
      body.style.height = 'auto';
      body._mhAnimating = false;
    });
  }

  function closeBody(body) {
    body.style.height = body.scrollHeight + 'px';
    void body.offsetHeight;
    body.style.height = '0';
    body.classList.remove('mh-news-body-open');
    body.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'height') return;
      body.removeEventListener('transitionend', onEnd);
      body._mhAnimating = false;
    });
  }

  // ── Скрытые блоки ────────────────────────────────────────────────────────
  let hiddenIds = [];

  function loadHidden(cb) {
    chrome.storage.sync.get({ [HIDDEN_KEY]: [] }, data => {
      hiddenIds = data[HIDDEN_KEY] || [];
      cb && cb();
    });
  }

  function saveHidden() {
    chrome.storage.sync.set({ [HIDDEN_KEY]: hiddenIds });
  }

  function hideBlock(outer, id) {
    const body = outer._mhBody;
    if (body) { body.style.height = '0'; body.style.opacity = '0'; }

    outer.style.transition = 'opacity 0.25s, transform 0.25s';
    outer.style.opacity = '0';
    outer.style.transform = 'scale(0.97)';
    setTimeout(() => {
      if (!hiddenIds.includes(id)) {
        hiddenIds.push(id);
        saveHidden();
      }
      location.reload();
    }, 260);
  }

  // ── Обработка одного блока ───────────────────────────────────────────────
  function processBlock(outer, showHide = true) {
    if (outer.dataset.mhNews) return;

    const iconSvg = outer.querySelector('svg[aria-label="icon-infoCircle"]') ||
                    outer.querySelector('svg[aria-label="icon-alertCircle"]');
    if (!iconSvg) return;

    const iconWrap    = iconSvg.closest('div');
    const flexRow     = iconWrap?.parentElement;
    if (!flexRow) return;

    const contentWrap = flexRow.children[1];
    if (!contentWrap) return;

    const titleSpan = contentWrap.querySelector('span') ||
                      contentWrap.querySelector('div > div');
    if (!titleSpan) return;

    const titleText = titleSpan.textContent.trim();
    const id = blockId(titleText);

    if (showHide && hiddenIds.includes(id)) {
      outer.style.display = 'none';
      outer.dataset.mhNews = 'hidden';
      return;
    }

    outer.dataset.mhNews = '1';

    // Скрываем нативный крестик
    outer.querySelector('svg[aria-label="icon-close"]')
      ?.closest('div')?.style.setProperty('display', 'none', 'important');

    // Блендим фон баннера на белый — error-баннеры используют rgba() цвета
    const bg = blendOnWhite(getComputedStyle(outer).backgroundColor || 'rgb(255,255,255)');

    // Читаем каждый угол отдельно — getComputedStyle может вернуть "12px" (shorthand),
    // по которому regex не работает
    const cs0 = getComputedStyle(outer);
    const rTL = cs0.borderTopLeftRadius;
    const rTR = cs0.borderTopRightRadius;
    const rBR = cs0.borderBottomRightRadius;
    const rBL = cs0.borderBottomLeftRadius;
    const fullRadius = `${rTL} ${rTR} ${rBR} ${rBL}`;
    const openRadius  = `${rTL} ${rTR} 0px 0px`;

    flexRow.style.display = 'none';

    // ── Шапка ──
    const header = document.createElement('div');
    header.className = 'mh-news-header';

    const iconClone = iconWrap.cloneNode(true);
    iconClone.className = 'mh-news-icon-wrap';
    header.appendChild(iconClone);

    const titleEl = document.createElement('div');
    titleEl.className = 'mh-news-title';
    titleEl.textContent = titleText;
    header.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'mh-news-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'mh-news-btn';
    toggleBtn.setAttribute('aria-label', 'Раскрыть');
    toggleBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;

    let hideBtn = null;
    if (showHide) {
      hideBtn = document.createElement('button');
      hideBtn.className = 'mh-news-hide-btn';
      hideBtn.setAttribute('aria-label', 'Скрыть блок');
      hideBtn.title = 'Скрыть';
      hideBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      actions.appendChild(hideBtn);
    }
    actions.appendChild(toggleBtn);
    header.appendChild(actions);

    // ── Тело — телепортируем в document.body ──
    // position:fixed и z-index через setAttribute чтобы не перебивались стилями приложения
    const body = document.createElement('div');
    body.className = 'mh-news-body';
    body.setAttribute('style',
      'position:fixed!important;' +
      'z-index:999998!important;' +
      'background:' + bg + '!important;' +
      'border-radius:0 0 ' + rBR + ' ' + rBL + '!important;' +
      'box-shadow:0 6px 16px rgba(0,0,0,0.13)!important;'
    );

    const contentClone = contentWrap.cloneNode(true);
    if (contentClone.children[0]) contentClone.children[0].style.display = 'none';
    body.appendChild(contentClone);
    document.body.appendChild(body);
    outer._mhBody = body;

    // redesign.js#liftToTop принудительно выставляет z-index:1000000 на все
    // position:fixed элементы в body через rAF. Следим и сразу откатываем.
    const zGuard = new MutationObserver(() => {
      if (parseInt(body.style.zIndex, 10) !== 999998) {
        body.style.setProperty('z-index', '999998', 'important');
      }
    });
    zGuard.observe(body, { attributes: true, attributeFilter: ['style'] });

    // ── Сборка ──
    outer.classList.add('mh-news-compact');
    outer.style.borderRadius = fullRadius;
    outer.appendChild(header);

    // Перепозиционируем при скролле / ресайзе
    function onReposition() {
      if (outer.classList.contains('mh-news-open')) positionBody(body, header);
    }
    window.addEventListener('scroll', onReposition, { passive: true, capture: true });
    window.addEventListener('resize', onReposition, { passive: true });

    // Закрытие по клику вне — всегда закрываем, даже если анимация не завершена
    function onOutsideClick(e) {
      if (outer.contains(e.target) || body.contains(e.target)) return;
      outer.classList.remove('mh-news-open');
      outer.style.borderRadius = fullRadius;
      toggleBtn.setAttribute('aria-label', 'Раскрыть');
      body._mhAnimating = true;
      closeBody(body);
      document.removeEventListener('mousedown', onOutsideClick, { capture: true });
    }

    // Тогл раскрытия
    header.addEventListener('click', function (e) {
      if (hideBtn && hideBtn.contains(e.target)) return;
      if (body._mhAnimating) return;
      e.stopPropagation();
      body._mhAnimating = true;
      const opening = !outer.classList.contains('mh-news-open');
      outer.classList.toggle('mh-news-open', opening);
      // openRadius: верхние углы не трогаем, нижние срезаем
      outer.style.borderRadius = opening ? openRadius : fullRadius;
      toggleBtn.setAttribute('aria-label', opening ? 'Свернуть' : 'Раскрыть');
      if (opening) {
        openBody(body, header);
        document.addEventListener('mousedown', onOutsideClick, { capture: true });
      } else {
        closeBody(body);
        document.removeEventListener('mousedown', onOutsideClick, { capture: true });
      }
    });

    if (hideBtn) {
      hideBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.MHAlert?.confirm({
          title:       'Скрыть блок?',
          body:        'Вы уверены? Вы всегда сможете его вернуть в настройках расширения.',
          confirmText: 'Скрыть',
          cancelText:  'Отмена',
          onConfirm:   () => hideBlock(outer, id),
        });
      });
    }
  }

  // ── Грид ─────────────────────────────────────────────────────────────────
  function gridify() {
    const blocks = Array.from(
      document.querySelectorAll('.mh-news-compact:not(.mh-news-grid .mh-news-compact)')
    );
    const byParent = new Map();
    blocks.forEach(b => {
      const p = b.parentElement;
      if (!p) return;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(b);
    });
    byParent.forEach((children, parent) => {
      if (children.length < 2) return;
      const grid = document.createElement('div');
      grid.className = 'mh-news-grid';
      grid.setAttribute(GRID_ATTR, '1');
      parent.insertBefore(grid, children[0]);
      children.forEach(b => grid.appendChild(b));
    });
  }

  // ── Сканирование ─────────────────────────────────────────────────────────
  let enabled = false;

  function scanAll() {
    if (!enabled) return;
    document.querySelectorAll('svg[aria-label="icon-infoCircle"]').forEach(svg => {
      const outer = svg.closest('div')?.parentElement?.parentElement;
      if (outer) processBlock(outer, true);
    });
    document.querySelectorAll('svg[aria-label="icon-alertCircle"]').forEach(svg => {
      const outer = svg.closest('div')?.parentElement?.parentElement;
      if (outer) processBlock(outer, false);
    });
    gridify();
  }

  const observer = new MutationObserver(mutations => {
    if (!enabled) return;
    for (const m of mutations) {
      if (m.addedNodes.length) { scanAll(); break; }
    }
  });

  function startObserver() {
    observer.observe(document.body, { childList: true, subtree: true });
    scanAll();
  }

  // ── Откат ────────────────────────────────────────────────────────────────
  function removeAll() {
    document.querySelectorAll(`[${GRID_ATTR}]`).forEach(grid => {
      const parent = grid.parentElement;
      Array.from(grid.children).forEach(b => parent.insertBefore(b, grid));
      grid.remove();
    });
    document.querySelectorAll('[data-mh-news]').forEach(outer => {
      outer.querySelectorAll('.mh-news-header').forEach(el => el.remove());
      const hidden = outer.querySelector('[style*="display: none"]');
      if (hidden) hidden.style.display = '';
      outer.classList.remove('mh-news-compact', 'mh-news-open');
      outer.style.borderRadius = '';
      outer.style.display = '';
      delete outer.dataset.mhNews;
    });
    document.querySelectorAll('body > .mh-news-body').forEach(el => el.remove());
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  // ── Восстановление всех скрытых (слушаем сообщение от popup) ─────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action !== 'mh-restore-news') return;
    hiddenIds = [];
    // Показываем все скрытые блоки
    document.querySelectorAll('[data-mh-news="hidden"]').forEach(outer => {
      outer.style.display = '';
      delete outer.dataset.mhNews;
      // Обрабатываем заново
      processBlock(outer, true);
    });
    gridify();
  });

  // ── Инициализация ────────────────────────────────────────────────────────
  chrome.storage.sync.get(
    { compactNewsEnabled: true, [HIDDEN_KEY]: [] },
    data => {
      enabled = !!data.compactNewsEnabled;
      hiddenIds = data[HIDDEN_KEY] || [];
      if (enabled) {
        injectStyle();
        if (document.body) startObserver();
        else document.addEventListener('DOMContentLoaded', startObserver);
      }
    }
  );

  chrome.storage.onChanged.addListener(changes => {
    if (!('compactNewsEnabled' in changes)) return;
    enabled = !!changes.compactNewsEnabled.newValue;
    if (enabled) {
      injectStyle();
      startObserver();
    } else {
      observer.disconnect();
      removeAll();
    }
  });

})();