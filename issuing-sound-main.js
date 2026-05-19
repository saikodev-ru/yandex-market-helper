// issuing-sound-main.js
// MAIN world скрипт — перехватывает Audio.prototype.play
// и блокирует воспроизведение конкретных Яндексовских звуков,
// которые конфликтуют с нашей озвучкой.
// Остальные звуки Яндекса (бипы, уведомления) НЕ блокируются.
//
// Страховка поверх declarativeNetRequest: даже если сетевой запрос
// прошёл (правило не сработало), play() будет отменён.

(function() {
  'use strict';

  const BLOCKED_HOST = 'pvz-sound.s3.yandex.net';

  // Хэши конкретных MP3, которые нужно блокировать
  const BLOCKED_HASHES = [
    '60BDA2A5F8EDD309028A8E3B8B2E047A',
    '6AB52C2C3FB0D74D168FF69D498245CE',
    'E2F9405756F98ED1339B540D1F604B6C',
  ];

  // Паттерн озвучки цифр: /{path}/{N}.mp3 (номер ячейки)
  const DIGIT_MP3_RE = /\/\d+\.mp3$/;

  /** Проверяет, нужно ли блокировать воспроизведение этого src */
  function shouldBlock(src) {
    if (!src || !src.includes(BLOCKED_HOST)) return false;
    // Проверяем конкретные хэши
    for (const hash of BLOCKED_HASHES) {
      if (src.includes(hash)) return true;
    }
    // Проверяем паттерн озвучки цифр (номер ячейки)
    if (DIGIT_MP3_RE.test(src)) return true;
    return false;
  }

  const origPlay = Audio.prototype.play;
  Audio.prototype.play = function() {
    if (shouldBlock(this.src)) {
      console.log('[Saiko] BLOCKED Yandex sound play():', this.src);
      // Возвращаем resolved promise — Yandex код не падает
      return Promise.resolve();
    }
    return origPlay.call(this);
  };

  console.log('[Saiko] MAIN world: Audio.prototype.play intercepted (specific pvz-sound hashes + digit MP3s blocked)');
})();
