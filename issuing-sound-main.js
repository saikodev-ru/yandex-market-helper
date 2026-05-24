// issuing-sound-main.js
// MAIN world скрипт — перехватывает Audio.prototype.play, fetch, XMLHttpRequest
// и свойство HTMLMediaElement.prototype.src
// Блокирует воспроизведение конкретных Яндексовских звуков,
// которые конфликтуют с нашей озвучкой.
//
// E2F9405756F98ED1339B540D1F604B6C — «Оплата при получении»:
// перехватываем установку src, чтобы уведомить content script
// ДО того как DNR заблокирует сетевой запрос и Audio не загрузится.

(function() {
  'use strict';

  const BLOCKED_HOST = 'pvz-sound.s3.yandex.net';

  // Хэши MP3, которые нужно ПОЛНОСТЬЮ БЛОКИРОВАТЬ
  const BLOCKED_HASHES = [
    '60BDA2A5F8EDD309028A8E3B8B2E047A',
    '6AB52C2C3FB0D74D168FF69D498245CE',
  ];

  // Хэш «Оплата при получении» — блокируем воспроизведение,
  // уведомляем content script чтобы проиграл свой вариант через SoundQueue
  const POST_PAYMENT_HASH = 'E2F9405756F98ED1339B540D1F604B6C';

  /** Проверяет, нужно ли блокировать воспроизведение этого URL */
  function shouldBlock(url) {
    if (!url || !url.includes(BLOCKED_HOST)) return false;
    for (const hash of BLOCKED_HASHES) {
      if (url.includes(hash)) return true;
    }
    return false;
  }

  /** Проверяет, это URL «Оплата при получении» */
  function isPostPayment(url) {
    return url && url.includes(BLOCKED_HOST) && url.includes(POST_PAYMENT_HASH);
  }

  // ─── Перехват HTMLMediaElement.prototype.src ───────────────────────
  // DNR block убивает сетевой запрос → Audio не загружается →
  // canplay не наступает → play() не вызывается → наш перехват play()
  // не срабатывает. Поэтому перехватываем установку src —
  // это происходит ДО сетевого запроса.
  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (srcDescriptor) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      set(value) {
        if (isPostPayment(value)) {
          console.log('[Saiko] BLOCKED Yandex post-payment src, routing to SoundQueue:', value);
          // Если content script ещё не повесил лисенер — сохраняем флаг
          window.__saikoPostPaymentPending = true;
          document.dispatchEvent(new CustomEvent('saiko-post-payment'));
          // Не устанавливаем src — Audio не будет пытаться загрузить
          return;
        }
        srcDescriptor.set.call(this, value);
      },
      get() {
        return srcDescriptor.get.call(this);
      },
      configurable: true,
    });
  }

  // ─── Перехват Audio.prototype.play ────────────────────────────────
  const origPlay = Audio.prototype.play;
  Audio.prototype.play = function() {
    if (isPostPayment(this.src)) {
      console.log('[Saiko] BLOCKED Yandex post-payment play(), routing to SoundQueue:', this.src);
      document.dispatchEvent(new CustomEvent('saiko-post-payment'));
      return Promise.resolve();
    }
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
    if (isPostPayment(url)) {
      console.log('[Saiko] BLOCKED Yandex post-payment fetch(), routing to SoundQueue:', url);
      document.dispatchEvent(new CustomEvent('saiko-post-payment'));
      return Promise.resolve(new Response(null, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'audio/mpeg' },
      }));
    }
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
  const origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isPostPayment(url)) {
      this._saikoPostPayment = true;
      console.log('[Saiko] BLOCKED Yandex post-payment XHR, routing to SoundQueue:', url);
    } else if (shouldBlock(url)) {
      this._saikoBlocked = true;
      console.log('[Saiko] BLOCKED Yandex sound XHR:', url);
    }
    return origXHROpen.apply(this, arguments);
  };

  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (this._saikoPostPayment) {
      document.dispatchEvent(new CustomEvent('saiko-post-payment'));
    }
    if (this._saikoPostPayment || this._saikoBlocked) {
      Object.defineProperty(this, 'readyState', { value: 4, writable: true });
      Object.defineProperty(this, 'status', { value: 200, writable: true });
      Object.defineProperty(this, 'response', { value: new ArrayBuffer(0), writable: true });
      Object.defineProperty(this, 'responseText', { value: '', writable: true });
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

  console.log('[Saiko] MAIN world: src setter + play + fetch + XHR intercepted');
})();
