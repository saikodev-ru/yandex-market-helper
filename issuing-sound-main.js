// issuing-sound-main.js
// MAIN world скрипт — перехватывает Audio.prototype.play и fetch
// и блокирует воспроизведение конкретных Яндексовских звуков,
// которые конфликтуют с нашей озвучкой.
// Остальные звуки Яндекса (бипы, уведомления) НЕ блокируются.
//
// Страховка поверх declarativeNetRequest: даже если сетевой запрос
// прошёл (правило не сработало), play()/fetch() будет отменён.
//
// Также принимает запросы на воспроизведение от content script
// через custom events — MAIN world использует MEI домена для autoplay.

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

  // ─── Воспроизведение звуков от content script ──────────────────────
  // Content script работает в изолированном мире и не получает MEI домена.
  // MAIN world получает MEI hubs.market.yandex.ru → autoplay разрешён.
  // Content script отправляет saiko-play-audio, мы играем через new Audio()
  // и отчитываемся через saiko-audio-done.
  document.addEventListener('saiko-play-audio', function(e) {
    const { url, volume, callbackId } = e.detail;
    let reported = false;

    const reportDone = () => {
      if (reported) return;
      reported = true;
      document.dispatchEvent(new CustomEvent('saiko-audio-done', {
        detail: { callbackId }
      }));
    };

    try {
      const audio = new Audio(url);
      audio.volume = volume ?? 0.8;

      audio.onended = reportDone;
      audio.onerror = () => {
        console.warn('[Saiko] MAIN play error:', url);
        reportDone();
      };

      const p = audio.play();
      if (p && p.catch) {
        p.catch(err => {
          console.warn('[Saiko] MAIN play rejected:', err.name, err.message);
          reportDone();
        });
      }

      // Страховка: 5 сек максимум
      setTimeout(reportDone, 5000);
    } catch (_) {
      reportDone();
    }
  });

  console.log('[Saiko] MAIN world: Audio.prototype.play + fetch intercepted + play-audio listener');
})();
