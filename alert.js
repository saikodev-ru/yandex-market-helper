/**
 * alert.js — Глобальный модуль уведомлений MHAlert
 *
 * Доступен из любого .js как window.MHAlert
 *
 * API:
 *   window.MHAlert.notify({ title, body })
 *     — информационная панель с крестиком (без кнопок подтверждения)
 *
 *   window.MHAlert.confirm({ title, body, confirmText?, cancelText?, onConfirm, onCancel? })
 *     — диалог подтверждения с двумя кнопками
 */

(function () {
  'use strict';

  const STYLE_ID = 'mh-alert-style';

  // ── Стили ──────────────────────────────────────────────────────────────────
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      /* ── Общий оверлей ── */
      .mh-alert-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(0,0,0,0.40);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: mh-alert-fade-in 0.18s ease;
      }
      @keyframes mh-alert-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      /* ── Карточка ── */
      .mh-alert-card {
        position: relative;
        background: #fff;
        color: #111;
        border-radius: 20px;
        padding: 28px 28px 24px;
        max-width: 380px;
        width: calc(100vw - 48px);
        box-shadow:
          0 24px 64px rgba(0,0,0,0.22),
          0 4px 16px rgba(0,0,0,0.12);
        animation: mh-alert-slide-up 0.24s cubic-bezier(.34,1.56,.64,1);
        font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
        box-sizing: border-box;
      }
      @keyframes mh-alert-slide-up {
        from { opacity: 0; transform: translateY(14px) scale(0.96); }
        to   { opacity: 1; transform: none; }
      }

      /* ── Кнопка закрытия (крестик) ── */
      .mh-alert-close {
        position: absolute;
        top: 14px;
        right: 14px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: none;
        background: rgba(0,0,0,0.06);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        color: rgba(0,0,0,0.45);
        transition: background 0.15s, color 0.15s;
        flex-shrink: 0;
      }
      .mh-alert-close:hover {
        background: rgba(0,0,0,0.11);
        color: rgba(0,0,0,0.75);
      }
      .mh-alert-close svg {
        width: 13px;
        height: 13px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2.5;
        stroke-linecap: round;
        display: block;
      }

      /* ── Иконка ── */
      .mh-alert-icon {
        width: 50px;
        height: 50px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
        flex-shrink: 0;
      }
      .mh-alert-icon svg {
        width: 26px;
        height: 26px;
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        display: block;
      }
      /* Notify: синяя иконка */
      .mh-alert-icon--info {
        background: #eef4ff;
      }
      .mh-alert-icon--info svg { stroke: #3b82f6; }
      /* Confirm: красная иконка */
      .mh-alert-icon--danger {
        background: #fff3f2;
      }
      .mh-alert-icon--danger svg { stroke: #e53e3e; }

      /* ── Тексты ── */
      .mh-alert-title {
        font-size: 17px;
        font-weight: 700;
        margin: 0 0 8px;
        line-height: 1.3;
        letter-spacing: -0.01em;
        padding-right: 28px; /* не залезать под крестик */
      }
      .mh-alert-body {
        font-size: 14px;
        color: #555;
        margin: 0 0 20px;
        line-height: 1.6;
      }
      /* Для notify без кнопок убираем нижний отступ */
      .mh-alert-card--notify .mh-alert-body {
        margin-bottom: 4px;
      }

      /* ── Кнопки ── */
      .mh-alert-btns {
        display: flex;
        gap: 8px;
        margin-top: 20px;
      }
      .mh-alert-btns button {
        flex: 1;
        padding: 12px 14px;
        border-radius: 12px;
        border: none;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, background 0.15s;
        font-family: inherit;
      }
      .mh-alert-btn-cancel {
        background: #f0f0f0;
        color: #333;
      }
      .mh-alert-btn-cancel:hover { background: #e4e4e4; }
      .mh-alert-btn-confirm {
        background: #e53e3e;
        color: #fff;
      }
      .mh-alert-btn-confirm:hover { background: #c53030; }
    `;
    document.head.appendChild(s);
  }

  // ── Закрытие с анимацией ───────────────────────────────────────────────────
  function dismiss(overlay) {
    overlay.style.transition = 'opacity 0.16s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 170);
  }

  // ── notify ─────────────────────────────────────────────────────────────────
  // Показывает информационное уведомление с крестиком.
  // Параметры: { title: string, body: string }
  function notify({ title, body }) {
    ensureStyle();

    const overlay = document.createElement('div');
    overlay.className = 'mh-alert-overlay';
    overlay.innerHTML = `
      <div class="mh-alert-card mh-alert-card--notify">
        <button class="mh-alert-close" aria-label="Закрыть">
          <svg viewBox="0 0 14 14">
            <line x1="1" y1="1" x2="13" y2="13"/>
            <line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
        <div class="mh-alert-icon mh-alert-icon--info">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <circle cx="12" cy="16" r="0.5" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <div class="mh-alert-title">${title}</div>
        <div class="mh-alert-body">${body}</div>
      </div>
    `;

    const close = () => dismiss(overlay);

    overlay.querySelector('.mh-alert-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Закрытие по Escape
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
  }

  // ── confirm ────────────────────────────────────────────────────────────────
  // Показывает диалог подтверждения с двумя кнопками.
  // Параметры: { title, body, confirmText?, cancelText?, onConfirm, onCancel? }
  function confirm({ title, body, confirmText = 'Подтвердить', cancelText = 'Отмена', onConfirm, onCancel }) {
    ensureStyle();

    const overlay = document.createElement('div');
    overlay.className = 'mh-alert-overlay';
    overlay.innerHTML = `
      <div class="mh-alert-card mh-alert-card--confirm">
        <button class="mh-alert-close" aria-label="Закрыть">
          <svg viewBox="0 0 14 14">
            <line x1="1" y1="1" x2="13" y2="13"/>
            <line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
        <div class="mh-alert-icon mh-alert-icon--danger">
          <svg viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </div>
        <div class="mh-alert-title">${title}</div>
        <div class="mh-alert-body">${body}</div>
        <div class="mh-alert-btns">
          <button class="mh-alert-btn-cancel">${cancelText}</button>
          <button class="mh-alert-btn-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    const close = () => dismiss(overlay);

    overlay.querySelector('.mh-alert-close').addEventListener('click', () => { close(); onCancel?.(); });
    overlay.querySelector('.mh-alert-btn-cancel').addEventListener('click', () => { close(); onCancel?.(); });
    overlay.querySelector('.mh-alert-btn-confirm').addEventListener('click', () => { close(); onConfirm?.(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) { close(); onCancel?.(); } });

    const onKey = e => {
      if (e.key === 'Escape') { close(); onCancel?.(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    // Фокус на безопасную кнопку
    overlay.querySelector('.mh-alert-btn-cancel').focus();
  }

  // ── Экспорт ────────────────────────────────────────────────────────────────
  window.MHAlert = { notify, confirm };

})();
