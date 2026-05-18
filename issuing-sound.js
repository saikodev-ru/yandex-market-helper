// issuing-sound.js — Подмена озвучки «Оплата при получении» на issuing/client-session
// Правило 104 в background.js блокирует загрузку E2F9405756F98ED1339B540D1F604B6C.mp3.
// Загружаем issuing-sound-main.js в MAIN world — он детектит попытку воспроизвести
// заблокированный звук и отправляет событие. Мы ловим его и играем свой post_payment.mp3.
(function () {
  'use strict';

  if (!/\/tpl-outlet\/\d{8}\/issuing\/client-session\//.test(location.pathname)) return;

  const POST_PAYMENT_AUDIO = chrome.runtime?.getURL('sounds/post_payment.mp3');
  const EVENT_NAME = 'mh-play-post-payment';

  // ── Ловим событие и играем наш звук (как все остальные звуки в content.js) ──
  let played = false;

  document.addEventListener(EVENT_NAME, function () {
    if (played) return;
    played = true;
    console.log('[MH] Заблокированный звук обнаружен, играем post_payment.mp3');
    const audio = new Audio(POST_PAYMENT_AUDIO);
    audio.volume = 0.8;
    audio.play().catch(err => console.warn('[MH] Ошибка воспроизведения post_payment:', err));
    setTimeout(() => { played = false; }, 10000);
  });

  // ── Загружаем MAIN world скрипт через <script src> (не inline — CSP пропустит) ──
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('issuing-sound-main.js');
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
