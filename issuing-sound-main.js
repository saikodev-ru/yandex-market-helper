// issuing-sound-main.js — работает в MAIN world страницы
// Заменяет src заблокированного звука на наш post_payment.mp3
// Код Яндекса сам вызывает play() — autoplay пропускается
(function () {
  var H = 'E2F9405756F98ED1339B540D1F604B6C';
  var R = document.documentElement.dataset.mhPostPaymentUrl;
  if (!R) { console.warn('[MH] Не найден URL для замены звука'); return; }

  // Перехват new Audio(url) — подменяем URL
  var O = window.Audio;
  window.Audio = function (s) {
    var a = new O();
    if (s && s.indexOf(H) !== -1) { a.src = R; return a; }
    if (s) a.src = s;
    return a;
  };
  window.Audio.prototype = O.prototype;

  // Перехват play() — подменяем src если ещё не заменён
  var p = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    if ((this.src || this.currentSrc || '').indexOf(H) !== -1) this.src = R;
    return p.call(this);
  };

  // Перехват src setter — подменяем URL при установке
  var d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (d && d.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      get: d.get,
      set: function (v) { if (typeof v === 'string' && v.indexOf(H) !== -1) v = R; return d.set.call(this, v); },
      configurable: true,
      enumerable: true
    });
  }

  console.log('[MH] MAIN world: подмена звука установлена');
})();
