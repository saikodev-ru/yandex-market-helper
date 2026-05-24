// offscreen.js — Воспроизведение аудио через offscreen document.
// Offscreen-документ создаётся с reason: 'AUDIO', что позволяет
// воспроизводить звук БЕЗ пользовательского gesture (без клика
// по странице). Это решает проблему: после перезагрузки страницы
// браузер блокирует audio.play() до первого взаимодействия.

console.log('🔊 Offscreen: document loaded');

// Счётчик для уникальных ID запросов
let _requestId = 0;

// Текущий воспроизводимый Audio (для возможности остановки)
let _currentAudio = null;

/**
 * Воспроизвести MP3-файл.
 * Отправляет 'mh-audio-done' когда воспроизведение завершено.
 * При ошибке пробует fallbackSrc, при его наличии.
 */
function playAudioFile(src, volume, speed, fallbackSrc, requestId) {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio = null;
  }

  const audio = new Audio(src);
  _currentAudio = audio;
  audio.volume = volume ?? 0.8;
  if (speed && speed !== 1.0) {
    audio.playbackRate = speed;
  }

  const onDone = () => {
    _currentAudio = null;
    chrome.runtime.sendMessage({
      action: 'mh-audio-done',
      requestId
    }).catch(() => {});
  };

  const onError = () => {
    _currentAudio = null;
    if (fallbackSrc) {
      console.warn('Offscreen: fallback →', fallbackSrc);
      playAudioFile(fallbackSrc, volume, speed, null, requestId);
    } else {
      onDone();
    }
  };

  audio.onended = onDone;
  audio.onerror = onError;

  audio.play().catch(e => {
    if (e.name === 'NotAllowedError') {
      console.warn('Offscreen: NotAllowedError (unexpected for offscreen AUDIO)');
    }
    onError();
  });

  // Страховка: если onended не сработал
  setTimeout(onDone, 10000);
}

// === Обработка сообщений от background.js ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'mh-offscreen-play') {
    const { src, volume, speed, fallbackSrc, requestId } = msg;
    playAudioFile(src, volume, speed, fallbackSrc, requestId);
    sendResponse({ ok: true });
    return false; // synchronous response
  }

  if (msg.action === 'mh-offscreen-stop') {
    if (_currentAudio) {
      _currentAudio.pause();
      _currentAudio = null;
    }
    sendResponse({ ok: true });
    return false;
  }
});

console.log('🔊 Offscreen: ready for audio playback');
