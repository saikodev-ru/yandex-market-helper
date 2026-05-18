// redesign.js — Навигационная панель и редизайн интерфейса (YModerniser)
// Управляется ключом redesignEnabled в chrome.storage.sync
// Вызывает window.__saikoShipRefactor() вместо прямого refactorShipmentTable —
// ship-redesign.js регистрирует его если включён.

(function () {

// ─── Константы ───────────────────────────────────────────────────────────────
const CONFIG = Object.freeze({
    CACHE_TTL:          1000,
    DEBOUNCE_DOM:        300,
    BUTTON_FIX_INTERVAL: 2000,
    MODAL_CHECK_INTERVAL: 500,
    INIT_DELAY:          200,
    NAV_INJECT_DELAY:     50,
});

const outletIdMatch = location.pathname.match(/\/tpl-outlet\/(\d+)/);
const OUTLET_ID = outletIdMatch ? outletIdMatch[1] : '55948606';

const NAV_LINKS = [
    {
        href:  `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/issuing`,
        label: 'Выдать',
        svg:   '<path d="M11.4976 4.82609C11.4976 7.33043 9.74812 9 7.99859 9C6.24906 9 4.49951 7.33043 4.49951 4.82609C4.49951 2.04348 6.59896 1 7.99859 1C9.39822 1 11.4976 2.04348 11.4976 4.82609Z"/><path d="M12.9995 8C12.9995 6.89543 13.8949 6 14.9995 6H19.9995C21.1041 6 21.9995 6.89543 21.9995 8V13C21.9995 14.1046 21.1041 15 19.9995 15H14.9995C13.8949 15 12.9995 14.1046 12.9995 13V8Z"/><path d="M7.43568 10.3579C6.59787 10.1098 5.71554 10.06 4.91117 10.4302C4.10692 10.8003 3.37864 11.5912 2.8517 13.0296C2.32525 14.4666 2.00015 16.5487 2.00018 19.5L2 22H9.66739L9.99733 20.0224L10.1414 19.2018L12.329 20.1237L16.5671 19.8589C17.3 19.8131 18.1359 19.6903 18.8061 19.2739C19.5713 18.7985 20.0001 18.0202 20.0001 16.9998V15.9998H13.4775L10.158 11.8937C10.0228 11.738 9.85597 11.5859 9.6823 11.4688C9.06237 11.0507 8.2722 10.6057 7.43568 10.3579Z"/>',
    },
    {
        href:  `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/acceptance-request`,
        label: 'Принять',
        svg:   '<path fill-rule="evenodd" clip-rule="evenodd" d="M8 5C8 2.79086 9.79086 1 12 1C14.2091 1 16 2.79086 16 5H20.001L20.2069 12H18.206L18.0589 7H5.94301L5.68177 15.8824C5.65282 16.8666 5.6352 17.5034 5.65449 17.9911C5.67309 18.4614 5.72338 18.6401 5.75616 18.7244C5.95199 19.2284 6.34348 19.6315 6.84142 19.8421C6.92476 19.8773 7.10194 19.9329 7.57146 19.9653C8.05838 19.9989 8.69539 20 9.68004 20H10V22H9.68004C7.76628 22 6.8094 22 6.06249 21.6842C5.06661 21.2631 4.28363 20.4567 3.89197 19.4489C3.59824 18.693 3.62637 17.7365 3.68263 15.8236L4.00097 5H8ZM10 5C10 3.89543 10.8954 3 12 3C13.1046 3 14 3.89543 14 5H10Z"/><path d="M14 12H16V9H14V12Z"/><path d="M10 9V12H8V9H10Z"/><path d="M15.7071 13.5898L17.1213 15.0041L14.8284 17.297H22.0002V19.297H14.8284L17.1213 21.5898L15.7071 23.0041L11 18.297L15.7071 13.5898Z"/>',
    },
    {
        href:  `https://logistics.market.yandex.ru/tpl-outlet/${OUTLET_ID}/unified-acceptance?`,
        label: 'Поставка',
        svg:   '<path d="M6.27046 5.18227L14.9715 10.0162C15.52 10.3209 15.6255 10.3891 15.6985 10.4603C15.8262 10.5848 15.9182 10.7412 15.9651 10.9133C15.9919 11.0116 16.0002 11.137 16.0002 11.7645V19.7768L13.4569 21.1898C12.9846 21.4522 12.7484 21.5834 12.5017 21.6473C12.1727 21.7326 11.8273 21.7326 11.4983 21.6473C11.2516 21.5834 11.0154 21.4522 10.5431 21.1898L4.54307 17.8565C4.04427 17.5793 3.79487 17.4408 3.6034 17.254C3.34809 17.0049 3.16403 16.6921 3.0703 16.348C3 16.0899 3 15.8046 3 15.234V8.7644C3 8.1938 3 7.9085 3.0703 7.6504C3.16403 7.30626 3.34809 6.99346 3.6034 6.74439C3.79487 6.55759 4.04427 6.41904 4.54307 6.14193L6.27046 5.18227Z"/><path d="M8.32959 4.03831L10.5431 2.8086C11.0154 2.5462 11.2516 2.415 11.4983 2.35105C11.8273 2.26579 12.1727 2.26579 12.5017 2.35105C12.7484 2.415 12.9846 2.5462 13.4569 2.8086L19.4569 6.14193C19.9557 6.41904 20.2051 6.55759 20.3966 6.74439C20.6519 6.99346 20.836 7.30626 20.9297 7.6504C21 7.9085 21 8.1938 21 8.7644V15.234C21 15.8046 21 16.0899 20.9297 16.348C20.836 16.6921 20.6519 17.0049 20.3966 17.254C20.2051 17.4408 19.9557 17.5576 19.4569 17.8347L18.0002 18.6439L18.0003 11.6658C18.0008 11.1933 18.0012 10.7785 17.8948 10.3877C17.7542 9.87147 17.4781 9.40226 17.0951 9.02866C16.8052 8.74578 16.4423 8.54471 16.0291 8.31571L8.32959 4.03831Z"/>',
    },
    {
        href:  `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/unified-shipment`,
        label: 'Отгрузка',
        svg:   '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.4562 0.531623C9.18102 0.335445 7.99369 0.9692 7.39877 2H7C5.34315 2 4 3.34315 4 5V19C4 20.6569 5.34315 22 7 22H7.39888L7.39875 21.9998C7.99366 23.0306 9.181 23.6644 10.4562 23.4682L17.4562 22.3913C18.9197 22.1661 20 20.9069 20 19.4261V4.57366C20 3.09295 18.9197 1.8337 17.4562 1.60855L10.4562 0.531623ZM6 5C6 4.44772 6.44771 4 7 4V20C6.44772 20 6 19.5523 6 19V5ZM11.75 13.5C12.4404 13.5 13 12.9404 13 12.25C13 11.5596 12.4404 11 11.75 11C11.0596 11 10.5 11.5596 10.5 12.25C10.5 12.9404 11.0596 13.5 11.75 13.5Z"/>',
    },
    {
        href:  `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/consolidation`,
        label: 'Сборка',
        svg:   '<rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M8 8H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 12H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 16H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="18" r="1.5" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1"/>',
    },
    {
        href:  `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/placement`,
        label: 'Размещение',
        svg:   '<path d="M22 8C22 10.2091 20.2091 12 18 12C16.8053 12 15.7329 11.4762 15 10.6458C14.2671 11.4762 13.1947 12 12 12C10.8053 12 9.73295 11.4762 9 10.6458C8.26706 11.4762 7.19469 12 6 12C3.79086 12 2 10.2091 2 8V4H22V8Z"/><path d="M3 13.1973C3.60738 13.5486 4.28208 13.7966 5 13.917V19H11V13.9168C11.3252 13.9715 11.6593 14 12 14C12.3407 14 12.6748 13.9715 13 13.9168V21H3V13.1973Z"/><path d="M19 13.917C19.7179 13.7966 20.3926 13.5486 21 13.1973V21H19V13.917Z"/>',
    },
    {
        href:  `https://logistics.market.yandex.ru/tpl-outlet/${OUTLET_ID}/organization/information?`,
        label: 'ПВЗ',
        svg:   '<path fill-rule="evenodd" clip-rule="evenodd" d="M2 11C2 5.66667 6.47273 3 12 3C17.5273 3 22 5.66667 22 11C22 16.3333 17.5273 19 12 19C11.6721 19 11.3479 18.9906 11.0282 18.9718L8 22H7V18.1306C4.00989 16.9521 2 14.5752 2 11ZM11 11C11 11.8284 10.3284 12.5 9.5 12.5C8.67157 12.5 8 11.8284 8 11C8 10.1716 8.67157 9.5 9.5 9.5C10.3284 9.5 11 10.1716 11 11ZM14.5 12.5C15.3284 12.5 16 11.8284 16 11C16 10.1716 15.3284 9.5 14.5 9.5C13.6716 9.5 13 10.1716 13 11C13 11.8284 13.6716 12.5 14.5 12.5Z"/>',
    },
];

const MORE_LINKS = [
    { href: `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/sortables`,  label: 'Грузоместа' },
    { href: `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/order-list`, label: 'Список заказов' },
    { href: `https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/inventory`,  label: 'Инвентаризация' },
];

const BADGE_CONFIG = {
    acceptance: {
        matchUrl:       href => href.includes('acceptance-request'),
        storageKey:     'nav_badge_acceptance',
        navHrefPattern: 'acceptance-request',
        scan() {
            const el = document.querySelector(
                '[data-i18n-key="widgets.acceptance-statistics:statistics.cargos"]'
            );
            if (!el) return null;
            const m = el.textContent.match(/\d+/);
            return m ? parseInt(m[0], 10) : null;
        },
    },
    issuing: {
        matchUrl:       href => /\/issuing\b/.test(href),
        storageKey:     'nav_badge_issuing',
        navHrefPattern: '/issuing',
        scan() {
            const titleSpan = document.querySelector(
                '[data-i18n-key="pages.client-issuing-session-list:group.title.IN_PROGRESS"]'
            );
            if (!titleSpan) return 0;
            const row = titleSpan.closest('[class*="mez-flex-row"]')
                     ?? titleSpan.parentElement?.parentElement;
            if (!row) return 0;
            const children = [...row.children];
            const n = parseInt(children[children.length - 1]?.textContent?.trim(), 10);
            return isNaN(n) ? 0 : n;
        },
    },
};

function applyNavBadge(type, value) {
    const cfg     = BADGE_CONFIG[type];
    const navLink = document.querySelector(`#modern-custom-nav a[href*="${cfg.navHrefPattern}"]`);
    if (!navLink) return;
    let badge = navLink.querySelector('.nav-badge');
    if (!value || value <= 0) { badge?.remove(); return; }
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        navLink.appendChild(badge);
    }
    badge.textContent = value > 99 ? '99+' : String(value);
}

function loadSavedBadges() {
    const keys = Object.values(BADGE_CONFIG).map(c => c.storageKey);
    chrome.storage.local.get(keys, items => {
        for (const [type, cfg] of Object.entries(BADGE_CONFIG)) {
            const val = items[cfg.storageKey];
            if (val !== undefined) applyNavBadge(type, parseInt(val, 10));
        }
    });
}

function scanAndSaveBadges() {
    const href = location.href;
    for (const [type, cfg] of Object.entries(BADGE_CONFIG)) {
        if (!cfg.matchUrl(href)) continue;
        const val = cfg.scan();
        if (val !== null) {
            chrome.storage.local.set({ [cfg.storageKey]: String(val) });
            applyNavBadge(type, val);
        }
    }
}

// ─── Домен ───────────────────────────────────────────────────────────────────
const IS_LOGISTICS = location.hostname.includes('logistics.market.yandex.ru');

const SELECTORS = IS_LOGISTICS
    ? {
        sidePanel:   'div[class*="menuContainer-menu"]',
        mainContent: 'div[class*="menuContainer-menu"] ~ div[class*="mez-flex"]',
        actionBtn:   'button[class*="__use--variant_action"]',
    }
    : {
        sidePanel:   'div[class*="mez-w-["], div[class*="min-w-["], .mez-min-w-\\[84px\\]',
        mainContent: '.mez-ml-\\[84px\\]',
        actionBtn:   'button[class*="themeControlPrimary"]',
    };

// ─── Кеш элементов ───────────────────────────────────────────────────────────
const elementCache = new Map();

function getCached(key, selector) {
    const now   = Date.now();
    const entry = elementCache.get(key);
    if (entry && (now - entry.ts) < CONFIG.CACHE_TTL) {
        const el = entry.ref?.deref?.() ?? null;
        if (el && document.contains(el)) return el;
    }
    const el = document.querySelector(selector);
    elementCache.set(key, {
        ref: el ? (typeof WeakRef !== 'undefined' ? new WeakRef(el) : { deref: () => el }) : null,
        ts:  now,
    });
    return el;
}

function invalidateCache() { elementCache.clear(); }

// ─── Флаги ───────────────────────────────────────────────────────────────────
let isModernizationScheduled = false;
let isModalCheckScheduled     = false;
let lastButtonFixTime         = 0;
let lastModalCheck            = 0;

// ─── Перехват SPA-навигации ───────────────────────────────────────────────────
function patchHistory() {
    if (window.__saikoPatchedHistory) return;
    window.__saikoPatchedHistory = true;
    const dispatch = () => window.dispatchEvent(new Event('locationchange'));
    ['pushState', 'replaceState'].forEach(method => {
        const original = history[method];
        history[method] = function (...args) {
            original.apply(this, args);
            dispatch();
        };
    });
    window.addEventListener('popstate', dispatch);
}

function isPdfPage() {
    try {
        if (location.pathname.toLowerCase().endsWith('.pdf')) return true;
        if (document.querySelector('embed[type="application/pdf"], iframe[src*=".pdf"]')) return true;
        const text = document.body?.innerText ?? '';
        if (text.includes('%PDF-') || text.includes('PDF document')) return true;
    } catch { /* ignore */ }
    return false;
}

function injectRedesignCSS() {
    if (document.getElementById('modernizer-css')) return;
    const link = document.createElement('link');
    link.id   = 'modernizer-css';
    link.rel  = 'stylesheet';
    link.href = chrome.runtime.getURL('redesign.css');
    document.head.appendChild(link);
}

function addPreloadStyles() {
    const inject = () => {
        injectRedesignCSS();
        if (document.getElementById('modernizer-preload-styles')) return;
        const style = document.createElement('style');
        style.id = 'modernizer-preload-styles';
        style.textContent = `
            body:not(.react-loaded) div[class*="mez-w-["],
            body:not(.react-loaded) div[class*="min-w-["],
            body:not(.react-loaded) .mez-min-w-\\[84px\\],
            body:not(.react-loaded) div[class*="menuContainer-menu"] {
                opacity: 0 !important;
                pointer-events: none !important;
                min-width: 0 !important;
                max-width: 0 !important;
                width: 0 !important;
                transition: none !important;
            }
            .mod-animate {
                animation: modFadeInUp 0.4s ease forwards !important;
            }
            @keyframes modFadeInUp {
                from { opacity: 0; transform: translateY(10px); }
                to   { opacity: 1; transform: translateY(0);    }
            }
            body.pdf-page #modern-custom-nav { display: none !important; }
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

let supportStylesAdded = false;

function addSupportButtonStyles() {
    if (supportStylesAdded || document.getElementById('modernizer-support-styles')) return;
    const style = document.createElement('style');
    style.id = 'modernizer-support-styles';
    style.textContent = `
        .support-btn {
            position: relative; overflow: hidden; cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            user-select: none; touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }
        [data-testid="overlay"].mez-fixed          { z-index: 1000010 !important; }
        [role="dialog"][aria-label="modal-content"] { z-index: 1000011 !important; }
        [data-e2e^="notification-"]                 { z-index: 1000013 !important; }
    `;
    document.head.appendChild(style);
    supportStylesAdded = true;
}

// ─── Инъекция навигационной панели ───────────────────────────────────────────
function injectNav() {
    if (isPdfPage()) { document.body?.classList.add('pdf-page'); return; }
    if (document.getElementById('modern-custom-nav')) return;

    const logoUrl = chrome.runtime.getURL('img/logo_header.png');
    const nav     = document.createElement('nav');
    nav.id        = 'modern-custom-nav';
    nav.className = 'modern-top-nav';

    const linksHtml = NAV_LINKS.map(({ href, label, svg }) => `
        <a href="${href}" class="nav-item" data-internal="false">
            <svg viewBox="0 0 24 24" fill="currentColor">${svg}</svg>
            <span>${label}</span>
        </a>
    `).join('');

    const moreLinksHtml = MORE_LINKS.map(({ href, label }) => `
        <a href="${href}" class="nav-dropdown-item" data-internal="false">${label}</a>
    `).join('');

    nav.innerHTML = `
        <div class="nav-left-group">
            <div class="logo-wrapper">
                <img src="${logoUrl}" alt="Логотип" class="nav-logo" onerror="this.style.display='none'">
            </div>
        </div>
        <div class="nav-links">
            ${linksHtml}
        </div>
        <div class="nav-right-group">
            <div class="nav-more-wrapper">
                <button class="nav-more-btn" id="nav-more-toggle" type="button" title="Остальное">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                    </svg>
                    <svg class="nav-more-chevron" viewBox="0 0 24 24" width="11" height="11"
                         fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </button>
                <div class="nav-more-dropdown nav-more-dropdown--right" id="nav-more-dropdown">
                    ${moreLinksHtml}
                </div>
            </div>
            <a href="https://hubs.market.yandex.ru/tpl-outlet/${OUTLET_ID}/support?tab=support"
               class="support-btn" data-internal="false">
                <span>Поддержка</span>
            </a>
        </div>
    `;

    const mount = () => {
        document.body.insertAdjacentElement('afterbegin', nav);
        setupNavListeners(nav);
        addSupportButtonStyles();
        loadSavedBadges();
    };

    if (document.body) {
        mount();
    } else {
        new MutationObserver((_, obs) => {
            if (document.body) { mount(); obs.disconnect(); }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }
}

let navAbortController = null;

function setupNavListeners(nav) {
    navAbortController?.abort();
    navAbortController = new AbortController();
    const { signal } = navAbortController;

    nav.querySelectorAll('a.nav-item, a.support-btn, a.nav-dropdown-item').forEach(link => {
        link.addEventListener('click',       handleNavClick,   { capture: true, signal });
        link.addEventListener('contextmenu', handleRightClick, { signal });
        link.addEventListener('mousedown',   e => e.stopPropagation(), { signal });
    });

    const moreBtn  = nav.querySelector('#nav-more-toggle');
    const dropdown = nav.querySelector('#nav-more-dropdown');
    if (moreBtn && dropdown) {
        moreBtn.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = dropdown.classList.toggle('nav-more-dropdown--open');
            moreBtn.classList.toggle('nav-more-btn--active', isOpen);
        }, { signal });
    }

    document.addEventListener('click', () => {
        dropdown?.classList.remove('nav-more-dropdown--open');
        moreBtn?.classList.remove('nav-more-btn--active');
    }, { signal });
}

function handleNavClick(e) {
    e.stopPropagation();
    e.preventDefault();
    const link = e.currentTarget;
    if (link.classList.contains('support-btn')) return;
    if (link.classList.contains('nav-dropdown-item')) {
        document.getElementById('nav-more-dropdown')?.classList.remove('nav-more-dropdown--open');
        document.getElementById('nav-more-toggle')?.classList.remove('nav-more-btn--active');
    }
    const href = link.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#')) return;
    if (link.getAttribute('data-internal') === 'true') {
        emulateReactNavigation(href);
    } else {
        location.href = href.startsWith('http') ? href : location.origin + href;
    }
}

function handleRightClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const href = e.currentTarget.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('#')) {
        window.open(href.startsWith('http') ? href : location.origin + href, '_blank');
    }
}

function emulateReactNavigation(url) {
    const fullUrl = url.startsWith('http') ? url : location.origin + url;
    history.pushState({}, '', fullUrl);
    const reactLink = document.querySelector(`a[href="${url}"]:not(#modern-custom-nav *)`);
    if (reactLink) {
        reactLink.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
        );
    }
}

// ─── Modernization ────────────────────────────────────────────────────────────
function animateContent() {
    const target = IS_LOGISTICS
        ? document.querySelector('div[class*="menuContainer-menu"] ~ div')
        : (document.querySelector('.mez-grow') ?? document.querySelector('main'));
    if (!target) return;
    target.classList.remove('mod-animate');
    void target.offsetHeight;
    target.classList.add('mod-animate');
}

function applyModernization() {
    if (isPdfPage()) {
        document.body?.classList.add('pdf-page');
        const nav = document.getElementById('modern-custom-nav');
        if (nav) nav.style.display = 'none';
        return;
    }

    document.body?.classList.add('react-loaded');
    const nav = document.getElementById('modern-custom-nav');
    if (nav) nav.style.display = 'flex';

    const sidePanel = getCached('sidePanel', SELECTORS.sidePanel);
    if (sidePanel) {
        const sp = sidePanel.style;
        sp.setProperty('min-width',      '0px',     'important');
        sp.setProperty('max-width',      '0px',     'important');
        sp.setProperty('width',          '0px',     'important');
        sp.setProperty('flex',           '0 0 0px', 'important');
        sp.setProperty('opacity',        '0',       'important');
        sp.setProperty('pointer-events', 'none',    'important');
    }

    const mainContent = getCached('mainContent', SELECTORS.mainContent);
    if (mainContent) {
        mainContent.style.setProperty('margin-left',  '0px', 'important');
        mainContent.style.setProperty('padding-left', '0px', 'important');
    }

    document.querySelectorAll('button[class*="themeControlPrimary"] span').forEach(span => {
        const txt = span.textContent.trim();
        if (txt.length > 2 && txt === txt.toUpperCase()) {
            span.style.textTransform = 'none';
            span.textContent = txt[0] + txt.slice(1).toLowerCase();
        }
    });

    if (document.documentElement.style.colorScheme !== 'light') {
        document.documentElement.style.colorScheme = 'light';
    }

    animateContent();
    scanAndSaveBadges();

    // Делегируем отгрузку в ship-redesign.js (если он активен)
    if (location.pathname.includes('unified-shipment')) {
        window.__saikoShipRefactor?.();
    }
}

function fixButtonColors() {
    const now = Date.now();
    if ((now - lastButtonFixTime) < CONFIG.BUTTON_FIX_INTERVAL) return;
    if (isPdfPage()) return;
    lastButtonFixTime = now;
    const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : queueMicrotask;
    schedule(() => {
        document.querySelectorAll(SELECTORS.actionBtn).forEach(btn => {
            btn.style.setProperty('background-color', '#ff5149', 'important');
            btn.style.setProperty('border-color',     '#ff5149', 'important');
            btn.style.setProperty('color',            '#ffffff', 'important');
            btn.querySelectorAll('span').forEach(s =>
                s.style.setProperty('color', '#ffffff', 'important')
            );
        });
    });
}

function forceModalToTop() {
    const now = Date.now();
    if ((now - lastModalCheck) < CONFIG.MODAL_CHECK_INTERVAL) return;
    lastModalCheck = now;

    const overlay = document.querySelector('[data-testid="overlay"].mez-fixed');
    if (overlay) overlay.style.setProperty('z-index', '1000010', 'important');

    const modal = document.querySelector('[role="dialog"][aria-label="modal-content"]');
    if (!modal) return;
    modal.style.setProperty('z-index', '1000011', 'important');

    if (modal.querySelector('input[placeholder="Код"]')) {
        modal.querySelectorAll('*').forEach(el => {
            el.style.setProperty('z-index',  '1000012', 'important');
            el.style.setProperty('position', 'relative', 'important');
        });
    }
}

// ─── Floating z-index ─────────────────────────────────────────────────────────
const FLOATING_Z = 1000000;

function isBodyPortal(el) {
    if (!(el instanceof Element)) return false;
    if (el.id === 'modern-custom-nav') return false;
    const tag = el.tagName;
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(tag)) return false;
    if (el.classList.contains('ReactModal__Overlay')) return true;
    const role = el.getAttribute('role');
    if (role === 'dialog' || role === 'alertdialog' || role === 'menu' || role === 'listbox') return true;
    if (el.hasAttribute('aria-modal')) return true;
    if (el.hasAttribute('data-testid') && !el.hasAttribute('data-tid')) return true;
    const pos = window.getComputedStyle(el).position;
    return pos === 'fixed' || pos === 'absolute';
}

function isInTreeTooltip(el) {
    return el instanceof Element &&
        el.getAttribute('role') === 'tooltip' &&
        el.classList.contains('mez-visible');
}

function isPopoverContainer(el) {
    if (!(el instanceof Element)) return false;
    const cls = el.className;
    if (typeof cls !== 'string' || !cls.includes('___container___')) return false;
    return !!(el.style.top || el.style.left);
}

function liftToTop(el) {
    if (!(el instanceof Element)) return;
    if (el.id === 'modern-custom-nav') return;
    let topAncestor = el;
    while (topAncestor.parentElement && topAncestor.parentElement !== document.body) {
        topAncestor = topAncestor.parentElement;
    }
    if (topAncestor.id !== 'modern-custom-nav') _setZ(topAncestor);
    _setZ(el);
}

function _setZ(el) {
    const raw     = el.style.zIndex || window.getComputedStyle(el).zIndex;
    const current = parseInt(raw, 10);
    if (isNaN(current) || current < FLOATING_Z) {
        el.style.setProperty('z-index', String(FLOATING_Z), 'important');
    }
}

function scanExistingFloating() {
    document.querySelectorAll('.ReactModal__Overlay').forEach(liftToTop);
    document.querySelectorAll('div[role="tooltip"].mez-visible').forEach(liftToTop);
    document.querySelectorAll('[class*="___container___"]').forEach(el => {
        if (isPopoverContainer(el)) liftToTop(el);
    });
}

let portalObserver = null;

function setupPortalObserver() {
    if (portalObserver || !document.body) return;
    portalObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (!isBodyPortal(node)) continue;
                requestAnimationFrame(() => liftToTop(node));
            }
        }
    });
    portalObserver.observe(document.body, { childList: true });
}

function initializeExtension() {
    addSupportButtonStyles();
    invalidateCache();
    applyModernization();
    fixButtonColors();
}

// ── Observer B+C ──────────────────────────────────────────────────────────────
let domObserver = null;

function setupObserver() {
    if (domObserver) return;
    let debounceTimer;

    domObserver = new MutationObserver(mutations => {
        let hasFloating    = false;
        let hasModal       = false;
        let hasShipmentRow = false;

        for (const m of mutations) {
            const { type, attributeName, target } = m;

            if (type === 'attributes' && attributeName === 'class') {
                if (isInTreeTooltip(target)) {
                    requestAnimationFrame(() => liftToTop(target));
                    hasFloating = true;
                    continue;
                }
            }

            if (type === 'attributes' && attributeName === 'style') {
                if (isPopoverContainer(target)) {
                    requestAnimationFrame(() => liftToTop(target));
                    hasFloating = true;
                    continue;
                }
            }

            for (const node of m.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                if (isInTreeTooltip(node) || isPopoverContainer(node)) {
                    requestAnimationFrame(() => liftToTop(node));
                    hasFloating = true;
                }

                if (!hasModal && (
                    node.matches?.('[role="dialog"], [data-testid="overlay"]') ||
                    node.querySelector?.('[role="dialog"], [data-testid="overlay"]')
                )) {
                    hasModal = true;
                }

                if (!hasShipmentRow && location.pathname.includes('unified-shipment')) {
                    const inTable = node.tagName === 'TR'
                        || node.closest?.('tr, tbody, table')
                        || node.querySelector?.('tr, td');
                    if (inTable) hasShipmentRow = true;
                }
            }

            if (!hasShipmentRow && location.pathname.includes('unified-shipment')) {
                for (const node of m.removedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (node.tagName === 'TR' || node.querySelector?.('tr')) {
                        hasShipmentRow = true;
                        break;
                    }
                }
            }
        }

        if (hasShipmentRow) {
            requestAnimationFrame(() => window.__saikoShipRefactor?.());
        }

        if (hasModal && !isModalCheckScheduled) {
            isModalCheckScheduled = true;
            requestAnimationFrame(() => {
                forceModalToTop();
                isModalCheckScheduled = false;
            });
            return;
        }

        if (hasFloating) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (isModernizationScheduled) return;
            isModernizationScheduled = true;
            requestAnimationFrame(() => {
                if (!isPdfPage()) {
                    applyModernization();
                    fixButtonColors();
                }
                isModernizationScheduled = false;
            });
        }, CONFIG.DEBOUNCE_DOM);
    });

    if (document.body) {
        domObserver.observe(document.body, {
            childList:       true,
            subtree:         true,
            attributes:      true,
            attributeFilter: ['class', 'style'],
        });
    }
}

function handleLocationChange() {
    invalidateCache();
    lastButtonFixTime = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (document.readyState === 'loading') return;
        const pdf = isPdfPage();
        document.body?.classList.toggle('pdf-page', pdf);
        const nav = document.getElementById('modern-custom-nav');
        if (nav) nav.style.display = pdf ? 'none' : 'flex';
        if (!pdf) initializeExtension();
    }));
}

function bootstrap() {
    if (isPdfPage()) { document.body?.classList.add('pdf-page'); return; }
    injectNav();
    initializeExtension();
    scanExistingFloating();
    setupPortalObserver();
    setupObserver();
}

// ─── Деактивация ─────────────────────────────────────────────────────────────
function destroy() {
    document.getElementById('modern-custom-nav')?.remove();
    document.getElementById('modernizer-css')?.remove();
    document.getElementById('modernizer-preload-styles')?.remove();
    document.getElementById('modernizer-support-styles')?.remove();
    navAbortController?.abort();
    domObserver?.disconnect();    domObserver    = null;
    portalObserver?.disconnect(); portalObserver = null;
    window.removeEventListener('locationchange', handleLocationChange);
    supportStylesAdded = false;
    // Вернуть сайдбар
    const sp = document.querySelector(SELECTORS.sidePanel);
    if (sp) ['min-width','max-width','width','flex','opacity','pointer-events']
        .forEach(p => sp.style.removeProperty(p));
    const mc = document.querySelector(SELECTORS.mainContent);
    if (mc) {
        mc.style.removeProperty('margin-left');
        mc.style.removeProperty('padding-left');
    }
}

// ─── Точка входа ─────────────────────────────────────────────────────────────
function run() {
    addPreloadStyles();
    patchHistory();
    window.addEventListener('locationchange', handleLocationChange);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(bootstrap, CONFIG.INIT_DELAY));
    } else {
        setTimeout(bootstrap, CONFIG.INIT_DELAY);
    }
}

try {
    chrome.storage.sync.get(['redesignEnabled'], ({ redesignEnabled }) => {
        if (redesignEnabled !== false) run();
    });
    chrome.storage.onChanged.addListener((changes) => {
        if (!('redesignEnabled' in changes)) return;
        changes.redesignEnabled.newValue !== false ? run() : destroy();
    });
} catch (e) {
    console.error('[redesign.js]', e);
}

})();
