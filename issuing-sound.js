// issuing-sound.js — Подмена озвучки «Оплата при получении» на issuing/client-session
// Правило 104 в background.js блокирует загрузку E2F9405756F98ED1339B540D1F604B6C.mp3.
// Мы внедряем скрипт в MAIN world — он детектит попытку воспроизвести этот звук
// и отправляет событие. Контент-скрипт ловит его и воспроизводит наш post_payment.mp3
// — так же, как все остальные звуки в content.js.
(function () {
  'use strict';

  if (!/\/tpl-outlet\/\d{8}\/issuing\/client-session\//.test(location.pathname)) return;

  const POST_PAYMENT_AUDIO = chrome.runtime?.getURL('sounds/post_payment.mp3');
  const BLOCKED_HASH = 'E2F9405756F98ED1339B540D1F604B6C';
  const EVENT_NAME = 'mh-play-post-payment';

  // ── Контент-скрипт: ловим событие и играем наш звук ──
  let played = false;

  document.addEventListener(EVENT_NAME, function () {
    if (played) return;
    played = true;
    console.log('[MH] Получен сигнал: заблокированный звук обнаружен, играем post_payment.mp3');
    const audio = new Audio(POST_PAYMENT_AUDIO);
    audio.volume = 0.8;
    audio.play().catch(err => console.warn('[MH] Ошибка воспроизведения post_payment:', err));
    setTimeout(() => { played = false; }, 10000);
  });

  // ── MAIN world: детектим попытку воспроизвести заблокированный звук ──
  const script = document.createElement('script');
  script.textContent = `(function() {
    var H = '${BLOCKED_HASH}';
    var E = '${EVENT_NAME}';
    function signal() { document.dispatchEvent(new Event(E)); }

    // Перехват new Audio(url)
    var O = window.Audio;
    window.Audio = function(s) {
      var a = new O();
      if (s && s.indexOf(H) !== -1) { signal(); return a; }
      if (s) a.src = s;
      return a;
    };
    window.Audio.prototype = O.prototype;

    // Перехват play()
    var p = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function() {
      if ((this.src || this.currentSrc || '').indexOf(H) !== -1) signal();
      return p.call(this);
    };

    // Перехват src setter
    var d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (d && d.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get: d.get,
        set: function(v) { if (typeof v === 'string' && v.indexOf(H) !== -1) signal(); return d.set.call(this, v); },
        configurable: true, enumerable: true
      });
    }
  })();`;

  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
