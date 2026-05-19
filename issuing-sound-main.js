// issuing-sound-main.js
// MAIN world скрипт — перехватывает Audio.prototype.play
// и блокирует воспроизведение Яндексовской TTS-озвучки ячейки
// (pvz-sound.s3.yandex.net/voice_generated_prod/...).
// Наша озвучка воспроизводится из chrome-extension:// URL и не попадает.
// Остальные звуки Яндекса (бипы, уведомления) НЕ блокируются.
//
// Это страховка поверх declarativeNetRequest: даже если сетевой запрос
// прошёл (правило не сработало), play() будет отменён.

(function() {
  'use strict';

  const BLOCKED_HOST = 'pvz-sound.s3.yandex.net';
  const BLOCKED_PATH = '/voice_generated_prod/';

  const origPlay = Audio.prototype.play;
  Audio.prototype.play = function() {
    if (this.src && this.src.includes(BLOCKED_HOST) && this.src.includes(BLOCKED_PATH)) {
      console.log('[Saiko] BLOCKED Yandex TTS play():', this.src);
      // Возвращаем resolved promise — Yandex код не падает
      return Promise.resolve();
    }
    return origPlay.call(this);
  };

  console.log('[Saiko] MAIN world: Audio.prototype.play intercepted (pvz-sound/voice_generated_prod blocked)');
})();
