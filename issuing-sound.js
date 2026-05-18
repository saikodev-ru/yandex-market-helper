// issuing-sound.js — Подмена озвучки «Оплата при получении» на issuing/client-session
// Блокирует воспроизведение E2F9405756F98ED1339B540D1F604B6C.mp3
// и воспроизводит свой post_payment.mp3
(function () {
  'use strict';

  const POST_PAYMENT_HASH = 'E2F9405756F98ED1339B540D1F604B6C';
  const POST_PAYMENT_AUDIO = chrome.runtime?.getURL('sounds/post_payment.mp3');

  let postPaymentPlayed = false;

  // Работаем только на страницах выдачи client-session
  function isIssuingClientSessionPage() {
    return /\/tpl-outlet\/\d{8}\/issuing\/client-session\//.test(location.pathname);
  }

  /** Воспроизводим свой звук «Оплата при получении» с защитой от повтора */
  function playPostPaymentSound() {
    if (postPaymentPlayed) return;
    postPaymentPlayed = true;
    console.log('[MH] Воспроизведение post_payment.mp3');
    if (!POST_PAYMENT_AUDIO) {
      console.warn('[MH] POST_PAYMENT_AUDIO не найден');
      return;
    }
    const audio = new Audio(POST_PAYMENT_AUDIO);
    audio.volume = 0.8;
    audio.play().catch(err => console.warn('[MH] Ошибка воспроизведения post_payment:', err));
    setTimeout(() => { postPaymentPlayed = false; }, 10000);
  }

  // ── Способ 1: Перехват new Audio(url) ──────────────────────────
  // Яндекс создаёт audio через new Audio(url). Подменяем конструктор,
  // чтобы при совпадении хеша заблокировать оригинальный звук
  // и включить наш.
  const OriginalAudio = window.Audio;
  window.Audio = function (src) {
    const audio = new OriginalAudio();
    if (src && src.includes(POST_PAYMENT_HASH)) {
      console.log('[MH] Перехвачен new Audio с «Оплата при получении»');
      // Не загружаем заблокированный URL
      playPostPaymentSound();
      return audio;
    }
    if (src) audio.src = src;
    return audio;
  };
  // Сохраняем прототип и статические свойства
  window.Audio.prototype = OriginalAudio.prototype;
  Object.defineProperty(window.Audio, 'length', { value: OriginalAudio.length });
  Object.defineProperty(window.Audio, 'name', { value: 'Audio' });

  // ── Способ 2: Перехват HTMLAudioElement.prototype.play ─────────
  // На случай, если Яндекс устанавливает src после создания элемента
  const originalPlay = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    const src = this.src || this.currentSrc || '';
    if (src.includes(POST_PAYMENT_HASH)) {
      console.log('[MH] Заблокировано воспроизведение «Оплата при получении» через play()');
      this.pause();
      this.removeAttribute('src');
      this.load();  // сбрасываем загрузку
      playPostPaymentSound();
      return Promise.resolve();
    }
    return originalPlay.call(this);
  };

  // ── Способ 3: MutationObserver — на случай добавления <audio> в DOM ──
  function checkAudioElement(audioEl) {
    const src = audioEl.src || audioEl.currentSrc || '';
    if (src.includes(POST_PAYMENT_HASH)) {
      console.log('[MH] Найден <audio> с «Оплата при получении» в DOM');
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
      playPostPaymentSound();
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === 'AUDIO') checkAudioElement(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('audio').forEach(checkAudioElement);
        }
      }
    }
  });

  function init() {
    if (!isIssuingClientSessionPage()) return;

    // Проверяем уже существующие audio-элементы
    document.querySelectorAll('audio').forEach(checkAudioElement);

    // Наблюдаем за новыми
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
    // document_start — DOM ещё не готов, но скрипт уже работает
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
