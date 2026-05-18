// issuing-sound.js — Подмена озвучки «Оплата при получении» на issuing/client-session
// Правило 104 в background.js блокирует загрузку E2F9405756F98ED1339B540D1F604B6C.mp3
// через declarativeNetRequest. Мы воспроизводим свой post_payment.mp3,
// когда на странице появляется триггерный элемент.
// Работает так же, как все остальные звуки в content.js (new Audio + getURL).
(function () {
  'use strict';

  const POST_PAYMENT_AUDIO = chrome.runtime?.getURL('sounds/post_payment.mp3');

  // Хеш заблокированного звука Яндекса — для логов
  const BLOCKED_HASH = 'E2F9405756F98ED1339B540D1F604B6C';

  let postPaymentPlayed = false;
  let observer = null;

  // Работаем только на страницах выдачи client-session
  function isIssuingClientSessionPage() {
    return /\/tpl-outlet\/\d{8}\/issuing\/client-session\//.test(location.pathname);
  }

  /** Воспроизводим свой звук «Оплата при получении» с защитой от повтора */
  function playPostPaymentSound() {
    if (postPaymentPlayed) return;
    postPaymentPlayed = true;
    console.log('[MH] Воспроизведение post_payment.mp3 (замена заблокированного ' + BLOCKED_HASH + ')');
    if (!POST_PAYMENT_AUDIO) {
      console.warn('[MH] POST_PAYMENT_AUDIO не найден');
      return;
    }
    const audio = new Audio(POST_PAYMENT_AUDIO);
    audio.volume = 0.8;
    audio.play().catch(err => console.warn('[MH] Ошибка воспроизведения post_payment:', err));
    setTimeout(() => { postPaymentPlayed = false; }, 10000);
  }

  /**
   * Ищем триггерный элемент «Оплата при получении» на странице.
   * Яндекс показывает этот текст в элементе с data-i18n-key, когда заказ
   * требует оплаты. Как только элемент появляется — играем наш звук.
   */
  const PAYMENT_TRIGGER_KEYS = [
    'features.client-issuing-session:session-notification.PAYMENT_ON_DELIVERY.title',
    'features.client-issuing-session:session-notification.PAYMENT_ON_DELIVERY.description',
  ];

  // Также ищем по тексту (на случай если i18n-key изменится)
  const PAYMENT_TRIGGER_TEXTS = [
    'Оплата при получении',
    'Наличными или картой при получении',
  ];

  function checkForPaymentTrigger(node) {
    if (postPaymentPlayed) return;

    // Проверяем по data-i18n-key
    for (const key of PAYMENT_TRIGGER_KEYS) {
      const el = node.nodeType === 1 && node.matches?.(`[data-i18n-key="${key}"]`)
        ? node
        : node.querySelector?.(`[data-i18n-key="${key}"]`);
      if (el) {
        console.log('[MH] Найден триггер оплаты по data-i18n-key:', key);
        playPostPaymentSound();
        return;
      }
    }

    // Проверяем по тексту в листовых элементах
    const candidates = node.nodeType === 1
      ? (node.childElementCount === 0 ? [node] : node.querySelectorAll('span, p, div'))
      : [];
    for (const el of candidates) {
      if (el.childElementCount > 0) continue; // только листовые
      const text = el.textContent?.trim();
      if (!text) continue;
      for (const trigger of PAYMENT_TRIGGER_TEXTS) {
        if (text.includes(trigger)) {
          console.log('[MH] Найден триггер оплаты по тексту:', trigger);
          playPostPaymentSound();
          return;
        }
      }
    }
  }

  function init() {
    if (!isIssuingClientSessionPage()) return;

    // Проверяем уже существующие элементы
    checkForPaymentTrigger(document.body);

    // Наблюдаем за новыми элементами
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          checkForPaymentTrigger(node);
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }

    console.log('[MH] issuing-sound.js активирован на странице client-session');
  }

  // Запускаем как можно раньше (content_script run_at: document_start)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
