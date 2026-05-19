// issuing-sound-main.js
// MAIN world скрипт — перехватывает Audio.prototype.play
// и блокирует воспроизведение Яндексовской TTS (pvz-sound.s3.yandex.net).
// Наша озвучка использует chrome-extension:// URL и не попадает под перехват.
//
// Это страховка поверх declarativeNetRequest: даже если сетевой запрос
// прошёл (правило не сработало), play() будет отменён.

(function() {
  'use strict';

  const BLOCKED_HOST = 'pvz-sound.s3.yandex.net';

  const origPlay = Audio.prototype.play;
  Audio.prototype.play = function() {
    if (this.src && this.src.includes(BLOCKED_HOST)) {
      console.log('[Saiko] BLOCKED Yandex TTS play():', this.src);
      // Возвращаем resolved promise — Yandex код не падает
      return Promise.resolve();
    }
    return origPlay.call(this);
  };

  console.log('[Saiko] MAIN world: Audio.prototype.play intercepted (pvz-sound blocked)');
})();
