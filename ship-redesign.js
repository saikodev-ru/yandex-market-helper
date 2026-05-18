// ship-redesign.js — Редизайн таблицы «Отгрузка» (YModerniser)
// Управляется ключом shipRedesignEnabled в chrome.storage.sync
// Регистрирует window.__saikoShipRefactor для вызова из redesign.js

(function () {

// ─── Preload-стили для таблицы (инжектируются сразу, до React) ───────────────
function addShipPreloadStyles() {
    const inject = () => {
        if (!document.getElementById('modernizer-ship-css')) {
            const link = document.createElement('link');
            link.id   = 'modernizer-ship-css';
            link.rel  = 'stylesheet';
            link.href = chrome.runtime.getURL('ship-redesign.css');
            document.head.appendChild(link);
        }
        if (document.getElementById('modernizer-ship-preload')) return;
        const style = document.createElement('style');
        style.id = 'modernizer-ship-preload';
        style.textContent = `
            tr[data-mod-hidden] { display: none !important; }

            tr[data-mod-ship-type] [class*="mez-bg-themeLayerBgNeutral"] {
                border-radius: 6px !important;
                padding: 2px 8px !important;
                background-color: transparent !important;
            }

            /* Дроп-офф */
            tr[data-mod-ship-type="drop"] [class*="mez-bg-themeLayerBgNeutral"] { background-color: #ff4114 !important; }
            tr[data-mod-ship-type="drop"] [class*="mez-bg-themeLayerBgNeutral"] span,
            tr[data-mod-ship-type="drop"] [class*="mez-bg-themeLayerBgNeutral"] div { color: #fff !important; font-weight: 700 !important; }
            [data-i18n-key="features.unified-shipment:shipment-type.DROPOFF"] { font-size: 0 !important; line-height: 0 !important; }
            [data-i18n-key="features.unified-shipment:shipment-type.DROPOFF"]::after {
                content: 'Дроп-офф'; font-size: 12px; line-height: 1.4;
                color: #fff; font-weight: 700; font-family: 'Product Sans','Google Sans',sans-serif;
            }

            /* Утилизация */
            tr[data-mod-ship-type="util"] [class*="mez-bg-themeLayerBgNeutral"] { background-color: #ffe066 !important; }
            tr[data-mod-ship-type="util"] [class*="mez-bg-themeLayerBgNeutral"] span,
            tr[data-mod-ship-type="util"] [class*="mez-bg-themeLayerBgNeutral"] div { color: #1a1a1a !important; font-weight: 700 !important; }

            /* Невыкуп / Клиентский возврат / Сейф-пакет */
            tr[data-mod-ship-type="green"] [class*="mez-bg-themeLayerBgNeutral"] { background-color: #2ecc71 !important; }
            tr[data-mod-ship-type="green"] [class*="mez-bg-themeLayerBgNeutral"] span,
            tr[data-mod-ship-type="green"] [class*="mez-bg-themeLayerBgNeutral"] div { color: #fff !important; font-weight: 700 !important; }

            /* Засыл */
            tr[data-mod-ship-type="zasyl"] [class*="mez-bg-themeLayerBgNeutral"] { background-color: #ff8c00 !important; }
            tr[data-mod-ship-type="zasyl"] [class*="mez-bg-themeLayerBgNeutral"] span,
            tr[data-mod-ship-type="zasyl"] [class*="mez-bg-themeLayerBgNeutral"] div { color: #fff !important; font-weight: 700 !important; }
        `;
        document.head.appendChild(style);
    };
    if (document.head) {
        inject();
    } else {
        new MutationObserver((_, obs) => {
            if (document.head) { inject(); obs.disconnect(); }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }
}

function removeShipPreloadStyles() {
    document.getElementById('modernizer-ship-preload')?.remove();
}

// ─── Данные таблицы (оригинал) ────────────────────────────────────────────────
const SHIPMENT_HIDE_KEY    = 'mod_ship_hidden';
const SHIPMENT_TYPE_TEXT_MAP = {
    'Грузоместо':         'drop',
    'Утилизация':         'util',
    'Невыкуп':            'green',
    'Клиентский возврат': 'green',
    'Сейф-пакет':         'green',
    'Засыл':              'zasyl',
};

function shipHiddenSet() {
    try {
        const raw = localStorage.getItem(SHIPMENT_HIDE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function shipHiddenSave(set) {
    try { localStorage.setItem(SHIPMENT_HIDE_KEY, JSON.stringify([...set])); } catch {}
}

function shipRowBarcode(row) {
    for (const td of row.querySelectorAll('td')) {
        const spans = td.querySelectorAll('span');
        for (const s of spans) {
            const t = s.textContent.trim();
            if (/^\d{8,}-\d+$/.test(t)) return t;
        }
        const tdText = (td.firstElementChild?.textContent ?? td.textContent).trim().split(/\s/)[0];
        if (/^\d{8,}-\d+$/.test(tdText)) return tdText;
    }
    for (const td of row.querySelectorAll('td')) {
        const t = td.textContent.trim().split(/\s/)[0];
        if (t && t.length > 4) return t;
    }
    return null;
}

function shipApplyRowVisibility(row, hiddenSet) {
    const bc = shipRowBarcode(row);
    if (bc && hiddenSet.has(bc)) {
        row.setAttribute('data-mod-hidden', '1');
    } else {
        row.removeAttribute('data-mod-hidden');
    }
}

function shipAddCloseBtn(row) {
    if (row.querySelector('.mod-ship-close')) return;
    const lastTd = row.querySelector('td:last-child');
    if (!lastTd) return;
    lastTd.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = 'mod-ship-close';
    btn.title     = 'Скрыть из списка';
    btn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="3" y1="3" x2="13" y2="13"/>
        <line x1="13" y1="3" x2="3" y2="13"/>
    </svg>`;

    btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Вы уверены, что хотите скрыть элемент из списка?')) return;
        const bc = shipRowBarcode(row);
        if (!bc) return;
        const set = shipHiddenSet();
        set.add(bc);
        shipHiddenSave(set);
        row.setAttribute('data-mod-hidden', '1');
    });

    lastTd.appendChild(btn);
}

function shipInjectRestoreBtn() {
    if (document.getElementById('mod-ship-restore')) return;
    const anchor = document.querySelector(
        '[data-i18n-key="features.unified-shipment:items-table.count-label"]'
    );
    if (!anchor) return;
    const pager = anchor.closest('[class*="mez-inline-flex"][class*="mez-flex-row"]');
    if (!pager) return;

    const btn = document.createElement('button');
    btn.id        = 'mod-ship-restore';
    btn.className = 'mod-ship-restore-btn';
    btn.textContent = '↺ Восстановить список';

    btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Вы уверены, что хотите восстановить список?')) return;
        localStorage.removeItem(SHIPMENT_HIDE_KEY);
        document.querySelectorAll('tr[data-mod-hidden]').forEach(r => {
            r.removeAttribute('data-mod-hidden');
        });
    });

    pager.insertAdjacentElement('afterend', btn);
}

function refactorShipmentTable() {
    const hiddenSet = shipHiddenSet();

    document.querySelectorAll('tr[class*="mez-border-b"]').forEach(row => {
        shipApplyRowVisibility(row, hiddenSet);
        shipAddCloseBtn(row);

        const typeSpan = row.querySelector(
            '[data-i18n-key^="features.unified-shipment:shipment-type"]'
        );
        if (!typeSpan) return;

        const typeKey = SHIPMENT_TYPE_TEXT_MAP[typeSpan.textContent.trim()];
        if (!typeKey) return;

        if (row.getAttribute('data-mod-ship-type') !== typeKey) {
            row.setAttribute('data-mod-ship-type', typeKey);
        }
    });

    shipInjectRestoreBtn();
}

// ─── Компактный хинт ─────────────────────────────────────────────────────────
// Все состояния рисуем через единый <style id="mod-hint-style"> —
// никаких классов на body, никакого CSS-файла для этого блока.
// Это надёжнее: React не трогает <style> в <head>.

let _routePollInterval = null;
let _lastRouteValue    = null;
let _confirmedValue    = null;  // точное значение выбранное кликом (не набранное)

// SVG закодированы один раз здесь, чтобы не дублировать в CSS
const SVG_CROSS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'/%3E%3Cline x1='6' y1='6' x2='18' y2='18'/%3E%3C/svg%3E")`;
const SVG_CHECK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E")`;

function getHintStyle(tag) { return document.getElementById('mod-hint-style-' + tag); }

function injectHintStyle(tag, css) {
    let el = getHintStyle(tag);
    if (!el) {
        el = document.createElement('style');
        el.id = 'mod-hint-style-' + tag;
        document.head.appendChild(el);
    }
    el.textContent = css;
}

function removeHintStyles() {
    ['base', 'selected'].forEach(tag => getHintStyle(tag)?.remove());
}

/** Найти инпут выбора маршрута несколькими способами */
function findRouteInput() {
    // 1. Стандартный Яндексовый floating-label инпут рядом с баннером
    const byPlaceholder = document.querySelectorAll('input[placeholder=" "]');
    if (byPlaceholder.length === 1) return byPlaceholder[0];
    // Если несколько — берём тот, у которого есть значение или который первый
    for (const inp of byPlaceholder) {
        if (inp.value?.trim()) return inp;
    }
    if (byPlaceholder.length > 0) return byPlaceholder[0];

    // 2. Запасной: любой input с aria-labelledby внутри страницы отгрузки
    return document.querySelector('input[aria-labelledby][aria-disabled]') ?? null;
}

/** Маршрут выбран только если текущее значение совпадает с тем что кликнули */
function isRouteSelected(value) {
    const v = (value ?? '').trim();
    if (v === '' || v === 'Все') { _confirmedValue = null; return false; }
    return _confirmedValue !== null && v === _confirmedValue;
}

function applyHintStyles(enabled, routeValue) {
    if (!enabled) { removeHintStyles(); return; }

    const selected = isRouteSelected(routeValue);
    const bg       = selected ? '#4caf50' : '#ff4114';
    const icon     = selected ? SVG_CHECK  : SVG_CROSS;
    const text     = selected
        ? `'Выбран маршрут: ${(routeValue ?? '').trim().replace(/'/g, "\\'")}'`
        : `'Выбери направление отгрузки'`;

    // Базовые стили контейнера (применяем всегда пока хинт включён)
    injectHintStyle('base', `
        [class*="bg-themeControlPickerRange"] {
            padding: 10px 16px !important;
            gap: 10px !important;
            border-radius: 10px !important;
            justify-content: center !important;
            background: ${bg} !important;
            transition: background 0.3s ease !important;
        }
        [class*="bg-themeControlPickerRange"] img {
            display: none !important;
        }
        [class*="bg-themeControlPickerRange"] span.mez-font-ys-text {
            font-size: 0 !important;
            line-height: 0 !important;
        }
        [class*="bg-themeControlPickerRange"]::before {
            content: '' !important;
            display: inline-block !important;
            flex-shrink: 0 !important;
            width: 18px !important;
            height: 18px !important;
            background-color: #ffffff !important;
            mask-image: ${icon} !important;
            mask-repeat: no-repeat !important;
            mask-size: contain !important;
            mask-position: center !important;
            -webkit-mask-image: ${icon} !important;
            -webkit-mask-repeat: no-repeat !important;
            -webkit-mask-size: contain !important;
            -webkit-mask-position: center !important;
        }
        [class*="mez-pb-\\5b 16px\\5d "]:has([class*="bg-themeControlPickerRange"]) {
            padding-bottom: 4px !important;
            padding-top: 0 !important;
            margin-top: -6px !important;
        }
    `);

    // Текст — отдельный тег, перезаписывается при каждом изменении маршрута
    injectHintStyle('selected', `
        [data-i18n-key="features.unified-shipment:scan.banner.title2"]::after {
            content: ${text} !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            line-height: 1.4 !important;
            font-family: 'Product Sans', 'Google Sans', sans-serif !important;
            color: #ffffff !important;
            display: block !important;
            text-align: center !important;
        }
    `);
}

function updateRouteState() {
    if (!getHintStyle('base')) return; // хинт выключен — пропускаем

    const inp   = findRouteInput();
    const route = inp?.value ?? '';

    if (route === _lastRouteValue) return;
    _lastRouteValue = route;

    applyHintStyles(true, route);
}

function startRoutePoll() {
    if (_routePollInterval) return;

    // Ручной ввод — сбрасываем подтверждение
    const inp = findRouteInput();
    if (inp) {
        inp.addEventListener('input', (e) => {
            if (e.isTrusted) _confirmedValue = null;
        });
    }

    // Клик по пункту дропдауна — читаем текст прямо из кликнутого элемента,
    // до любой навигации или перерисовки React
    document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-testid="dropdown-item"]');
        if (!item) return;
        // Текст пункта — в первом div.mez-flex внутри item
        const textEl = item.querySelector('div > div');
        const text = (textEl?.textContent ?? '').trim();
        if (text && text !== 'Все') {
            _confirmedValue = text;
        } else {
            _confirmedValue = null; // выбрали «Все» — сброс
        }
        _lastRouteValue = null; // сбрасываем кеш → поллинг сразу обновит хинт
    }, true);

    _routePollInterval = setInterval(updateRouteState, 300);
}

function stopRoutePoll() {
    clearInterval(_routePollInterval);
    _routePollInterval = null;
    _lastRouteValue    = null;
    _confirmedValue    = null;
}

function applyCompactHint(enabled) {
    if (enabled) {
        const inp = findRouteInput();
        applyHintStyles(true, inp?.value ?? '');
        startRoutePoll();
    } else {
        stopRoutePoll();
        removeHintStyles();
    }
}

function initCompactHint() {
    chrome.storage.sync.get(['compactHintEnabled'], ({ compactHintEnabled }) => {
        applyCompactHint(compactHintEnabled !== false);
    });
}

// Перезапускаем при SPA-навигации — body сохраняется, но React перерисовывает страницу
window.addEventListener('locationchange', () => {
    if (!location.pathname.includes('unified-shipment')) return;
    _lastRouteValue = null; // сбросить кеш — страница обновилась
    chrome.storage.sync.get(['compactHintEnabled'], ({ compactHintEnabled }) => {
        if (compactHintEnabled !== false) {
            // Небольшая задержка — React должен завершить первый рендер
            setTimeout(() => applyCompactHint(true), 400);
        }
    });
});

// ─── Деактивация ─────────────────────────────────────────────────────────────
function destroy() {
    window.__saikoShipRefactor = undefined;
    document.getElementById('modernizer-ship-css')?.remove();
    removeShipPreloadStyles();
    document.querySelectorAll('tr[data-mod-ship-type]').forEach(r =>
        r.removeAttribute('data-mod-ship-type')
    );
    document.querySelectorAll('tr[data-mod-hidden]').forEach(r =>
        r.removeAttribute('data-mod-hidden')
    );
    document.querySelectorAll('.mod-ship-close').forEach(b => b.remove());
    document.getElementById('mod-ship-restore')?.remove();
    applyCompactHint(false);
    stopRoutePoll();
}

// ─── Точка входа ─────────────────────────────────────────────────────────────
function run() {
    addShipPreloadStyles();
    window.__saikoShipRefactor = refactorShipmentTable;
    initCompactHint();
    if (location.pathname.includes('unified-shipment')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', refactorShipmentTable);
        } else {
            refactorShipmentTable();
        }
    }
}

try {
    chrome.storage.sync.get(['shipRedesignEnabled'], ({ shipRedesignEnabled }) => {
        if (shipRedesignEnabled !== false) run();
    });
    chrome.storage.onChanged.addListener((changes) => {
        if ('shipRedesignEnabled' in changes) {
            changes.shipRedesignEnabled.newValue !== false ? run() : destroy();
        }
        if ('compactHintEnabled' in changes) {
            applyCompactHint(changes.compactHintEnabled.newValue !== false);
        }
    });
} catch (e) {
    console.error('[ship-redesign.js]', e);
}

})();