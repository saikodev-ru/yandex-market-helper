// issuing-sound.js — Подмена озвучки «Оплата при получении» на issuing/client-session
// Правило 104 в background.js блокирует E2F9405756F98ED1339B540D1F604B6C.mp3.
// Передаём URL нашего звука через data-атрибут в MAIN world скрипт,
// который подменяет src — Яндекс сам вызывает play() и autoplay проходит.
(function () {
  'use strict';

  if (!/\/tpl-outlet\/\d{8}\/issuing\/client-session\//.test(location.pathname)) return;

  const POST_PAYMENT_AUDIO = chrome.runtime?.getURL('sounds/post_payment.mp3');
  if (!POST_PAYMENT_AUDIO) return;

  // Передаём URL в MAIN world через data-атрибут (DOM общий для обоих миров)
  document.documentElement.dataset.mhPostPaymentUrl = POST_PAYMENT_AUDIO;

  // Загружаем MAIN world скрипт через <script src> (не inline — CSP пропускает)
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('issuing-sound-main.js');
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
