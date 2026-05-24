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
 *
 * Особенности fallback-цепочки:
 *  - Если основной файл не найден (onerror / play reject) — пробуем fallback
 *  - Safety timeout очищается при старте fallback, чтобы не было гонки
 *  - Гарантируем ровно один mh-audio-done на requestId
 */
function playAudioFile(src, volume, speed, fallbackSrc, requestId) {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio = null;
  }

  // Флаг защиты от двойного вызова onDone
  let done = false;
  let safetyTimer = null;

  const onDone = () => {
    if (done) return;
    done = true;
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    _currentAudio = null;
    chrome.runtime.sendMessage({
      action: 'mh-audio-done',
      requestId
    }).catch(() => {});
  };

  const onError = () => {
    _currentAudio = null;
    if (done) return;
    if (fallbackSrc) {
      console.warn('Offscreen: fallback →', fallbackSrc);
      // Очищаем safety timer основного файла перед запуском fallback
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      playAudioFile(fallbackSrc, volume, speed, null, requestId);
    } else {
      onDone();
    }
  };

  const audio = new Audio(src);
  _currentAudio = audio;
  audio.volume = volume ?? 0.8;
  if (speed && speed !== 1.0) {
    audio.playbackRate = speed;
  }

  audio.onended = onDone;
  audio.onerror = onError;

  audio.play().catch(e => {
    if (e.name === 'NotAllowedError') {
      console.warn('Offscreen: NotAllowedError (unexpected for offscreen AUDIO)');
    }
    // play() reject — пробуем fallback
    onError();
  });

  // Страховка: если onended не сработал (например, звук завис)
  safetyTimer = setTimeout(onDone, 10000);
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
