// issuing-sound-main.js — работает в MAIN world страницы
// Детектит попытку воспроизвести заблокированный звук E2F9405756F98ED1339B540D1F604B6C.mp3
// и отправляет DOM-событие, которое ловит контент-скрипт issuing-sound.js
(function () {
  var H = 'E2F9405756F98ED1339B540D1F604B6C';
  var E = 'mh-play-post-payment';
  function signal() { document.dispatchEvent(new Event(E)); }

  // Перехват new Audio(url)
  var O = window.Audio;
  window.Audio = function (s) {
    var a = new O();
    if (s && s.indexOf(H) !== -1) { signal(); return a; }
    if (s) a.src = s;
    return a;
  };
  window.Audio.prototype = O.prototype;

  // Перехват play()
  var p = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    if ((this.src || this.currentSrc || '').indexOf(H) !== -1) signal();
    return p.call(this);
  };

  // Перехват src setter
  var d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (d && d.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      get: d.get,
      set: function (v) { if (typeof v === 'string' && v.indexOf(H) !== -1) signal(); return d.set.call(this, v); },
      configurable: true,
      enumerable: true
    });
  }

  console.log('[MH] MAIN world: перехваты звука установлены');
})();
