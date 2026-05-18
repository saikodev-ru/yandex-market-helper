// issuing-sound.js — Подмена озвучки «Оплата при получении» на issuing/client-session
// Правило 104 в background.js блокирует загрузку E2F9405756F98ED1339B540D1F604B6C.mp3
// через declarativeNetRequest. Мы внедряем скрипт в MAIN world страницы,
// чтобы перехватить new Audio() / play() и подставить наш post_payment.mp3.
(function () {
  'use strict';

  // Работаем только на страницах выдачи client-session
  if (!/\/tpl-outlet\/\d{8}\/issuing\/client-session\//.test(location.pathname)) return;

  const POST_PAYMENT_URL = chrome.runtime?.getURL('sounds/post_payment.mp3');
  if (!POST_PAYMENT_URL) {
    console.warn('[MH] Не удалось получить URL post_payment.mp3');
    return;
  }

  const BLOCKED_HASH = 'E2F9405756F98ED1339B540D1F604B6C';

  // Внедряем скрипт в MAIN world — он может перехватывать
  // window.Audio и HTMLAudioElement.prototype.play в контексте страницы
  const script = document.createElement('script');
  script.textContent = `(function() {
    var BLOCKED = '${BLOCKED_HASH}';
    var REPLACE = '${POST_PAYMENT_URL}';

    // Перехват new Audio(url) — подменяем URL если содержит хеш заблокированного звука
    var OrigAudio = window.Audio;
    window.Audio = function(src) {
      var audio = new OrigAudio();
      if (src && typeof src === 'string' && src.indexOf(BLOCKED) !== -1) {
        console.log('[MH] Перехвачен new Audio с заблокированным звуком, подмена на post_payment.mp3');
        audio.src = REPLACE;
        return audio;
      }
      if (src) audio.src = src;
      return audio;
    };
    window.Audio.prototype = OrigAudio.prototype;
    Object.defineProperty(window.Audio, 'length', { value: OrigAudio.length });
    Object.defineProperty(window.Audio, 'name', { value: 'Audio' });

    // Перехват HTMLAudioElement.prototype.play — на случай если src установлен после создания
    var origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function() {
      var src = this.src || this.currentSrc || '';
      if (src.indexOf(BLOCKED) !== -1) {
        console.log('[MH] Перехвачен play() с заблокированным звуком, подмена на post_payment.mp3');
        this.src = REPLACE;
        this.volume = 0.8;
      }
      return origPlay.call(this);
    };

    // Перехват setter src на <audio> — подменяем URL при установке
    var origSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (origSrcDescriptor && origSrcDescriptor.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get: origSrcDescriptor.get,
        set: function(val) {
          if (typeof val === 'string' && val.indexOf(BLOCKED) !== -1) {
            console.log('[MH] Перехвачена установка src с заблокированным звуком, подмена на post_payment.mp3');
            val = REPLACE;
          }
          return origSrcDescriptor.set.call(this, val);
        },
        configurable: true,
        enumerable: true
      });
    }

    console.log('[MH] MAIN world перехваты звука установлены');
  })();`;

  // Внедряем как можно раньше — до того как Яндекс создаст Audio
  (document.head || document.documentElement).appendChild(script);
  script.remove(); // убираем следы — скрипт уже выполнился

  console.log('[MH] issuing-sound.js: MAIN world скрипт внедрён');
})();
