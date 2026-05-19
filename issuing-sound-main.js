// issuing-sound-main.js
// MAIN world скрипт — перехватывает Audio.prototype.play, fetch и XMLHttpRequest
// и блокирует воспроизведение конкретных Яндексовских звуков,
// которые конфликтуют с нашей озвучкой.
// Остальные звуки Яндекса (бипы, уведомления) НЕ блокируются.
//
// Страховка поверх declarativeNetRequest: даже если сетевой запрос
// прошёл (правило не сработало), play()/fetch()/XHR будет отменён.
//
// ВАЖНО: E2F9405756F98ED1339B540D1F604B6C НЕ блокируется здесь —
// DNR правило 104 делает REDIRECT на post_payment.mp3.
// Если блокировать play(), редирект не сработает.

(function() {
  'use strict';

  const BLOCKED_HOST = 'pvz-sound.s3.yandex.net';

  // Хэши MP3, которые нужно ПОЛНОСТЬЮ БЛОКИРОВАТЬ
  // E2F94... НЕ здесь — он редиректится на наш звук через DNR правило 104
  const BLOCKED_HASHES = [
    '60BDA2A5F8EDD309028A8E3B8B2E047A',
    '6AB52C2C3FB0D74D168FF69D498245CE',
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

  // ─── Перехват fetch ───────────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input :
                input instanceof Request ? input.url :
                String(input);
    if (shouldBlock(url)) {
      console.log('[Saiko] BLOCKED Yandex sound fetch():', url);
      return Promise.resolve(new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'audio/mpeg' },
      }));
    }
    return origFetch.apply(this, arguments);
  };

  // ─── Перехват XMLHttpRequest ──────────────────────────────────────
  // Яндекс может грузить MP3 через XHR + AudioContext.decodeAudioData
  const origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (shouldBlock(url)) {
      // Помечаем запрос — в send() просто не отправляем
      this._saikoBlocked = true;
      console.log('[Saiko] BLOCKED Yandex sound XHR:', url);
    }
    return origXHROpen.apply(this, arguments);
  };

  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (this._saikoBlocked) {
      // Имитируем успешный ответ с пустыми данными
      Object.defineProperty(this, 'readyState', { value: 4, writable: true });
      Object.defineProperty(this, 'status', { value: 200, writable: true });
      Object.defineProperty(this, 'response', { value: new ArrayBuffer(0), writable: true });
      Object.defineProperty(this, 'responseText', { value: '', writable: true });
      // Вызываем обработчики асинхронно
      const self = this;
      setTimeout(() => {
        if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
        if (typeof self.onload === 'function') self.onload();
        if (typeof self.onloadend === 'function') self.onloadend();
        self.dispatchEvent(new Event('load'));
        self.dispatchEvent(new Event('loadend'));
      }, 0);
      return;
    }
    return origXHRSend.apply(this, arguments);
  };

  console.log('[Saiko] MAIN world: Audio.prototype.play + fetch + XHR intercepted');
})();
