// issuing-sound.js — Подмена озвучки «Оплата при получении» на issuing/client-session
// Подмена выполняется через declarativeNetRequest redirect (правило 104 в background.js):
// браузер прозрачно подменяет E2F9405756F98ED1339B540D1F604B6C.mp3 → post_payment.mp3
// на сетевом уровне, код Яндекса сам воспроизводит наш звук.
//
// Ранее здесь были перехваты window.Audio и HTMLAudioElement.prototype.play,
// но они не работали — контент-скрипт выполняется в изолированном JS-мире
// и его переопределения не влияют на код страницы (MAIN world).
// MutationObserver тоже мешал — он видел оригинальный URL в src атрибуте
// и приостанавливал воспроизведение, блокируя уже подменённый редиректом звук.
(function () {
  'use strict';

  function isIssuingClientSessionPage() {
    return /\/tpl-outlet\/\d{8}\/issuing\/client-session\//.test(location.pathname);
  }

  if (isIssuingClientSessionPage()) {
    console.log('[MH] issuing-sound.js: подмена «Оплата при получении» активна (через redirect правила 104)');
  }
})();
