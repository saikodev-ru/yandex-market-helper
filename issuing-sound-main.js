// issuing-sound-main.js
// MAIN world скрипт — перехватывает Audio.prototype.play и fetch
// и блокирует воспроизведение конкретных Яндексовских звуков,
// которые конфликтуют с нашей озвучкой.
// Остальные звуки Яндекса (бипы, уведомления) НЕ блокируются.
//
// Страховка поверх declarativeNetRequest: даже если сетевой запрос
// прошёл (правило не сработало), play()/fetch() будет отменён.

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
  // Учитываем возможные query-параметры (?v=1 и т.п.)
  const DIGIT_MP3_RE = /\/\d+\.mp3(\?.*)?$/;

  /** Проверяет, нужно ли блокировать воспроизведение этого URL */
  function shouldBlock(url) {
    if (!url || !url.includes(BLOCKED_HOST)) return false;
    // Проверяем конкретные хэши
    for (const hash of BLOCKED_HASHES) {
      if (url.includes(hash)) return true;
    }
    // Проверяем паттерн озвучки цифр (номер ячейки)
    if (DIGIT_MP3_RE.test(url)) return true;
    return false;
  }

  // ─── Перехват Audio.prototype.play ────────────────────────────────
  const origPlay = Audio.prototype.play;
  Audio.prototype.play = function() {
    if (shouldBlock(this.src)) {
      console.log('[Saiko] BLOCKED Yandex sound play():', this.src);
      return Promise.resolve();
    }
    return origPlay.call(this);
  };

  // ─── Перехват fetch — блокируем загрузку MP3 через fetch + AudioContext ──
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input :
                input instanceof Request ? input.url :
                String(input);
    if (shouldBlock(url)) {
      console.log('[Saiko] BLOCKED Yandex sound fetch():', url);
      // Возвращаем пустой Response — Yandex код не падает,
      // но decodeAudioData получит невалидные данные и ничего не воспроизведёт
      return Promise.resolve(new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'audio/mpeg' },
      }));
    }
    return origFetch.apply(this, arguments);
  };

  console.log('[Saiko] MAIN world: Audio.prototype.play + fetch intercepted (specific pvz-sound hashes + digit MP3s blocked)');
})();
