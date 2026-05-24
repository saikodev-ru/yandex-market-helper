// ============================================================
// === Offscreen Document Management ===
// ============================================================
// Offscreen-документ с reason: 'AUDIO' позволяет воспроизводить
// MP3-звуки БЕЗ пользовательского gesture. После перезагрузки
// страницы браузер блокирует audio.play() до первого клика —
// offscreen document решает эту проблему.

let offscreenCreated = false;
const pendingAudioRequests = new Map(); // requestId → tabId

/** Создать offscreen document (если ещё не создан) */
async function ensureOffscreenDocument() {
  if (offscreenCreated) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO'],
      justification: 'Воспроизведение звуковых уведомлений расширения без требования user gesture на странице'
    });
    offscreenCreated = true;
    console.log('🔊 Background: offscreen document created');
  } catch (e) {
    if (e.message?.includes('Only a single offscreen')) {
      offscreenCreated = true;
      return; // уже создан
    }
    console.error('🔊 Background: ошибка создания offscreen:', e);
  }
}

// При старте service worker — создаём offscreen документ
ensureOffscreenDocument();

// Когда offscreen документ закрывается (например, при сне service worker) —
// сбрасываем флаг, чтобы пересоздать при следующем запросе
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Если получили сообщение от offscreen — значит он жив
  if (sender.documentId) {
    offscreenCreated = true;
  }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // === Маршрутизация аудио через offscreen ===
  if (request.action === 'mh-play-audio') {
    const tabId = sender.tab?.id;
    const requestId = request.requestId;
    if (tabId && requestId) {
      pendingAudioRequests.set(requestId, tabId);
      // Автоочистка через 15 сек (на случай если done не придёт)
      setTimeout(() => pendingAudioRequests.delete(requestId), 15000);
    }
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({
        action: 'mh-offscreen-play',
        src: request.src,
        volume: request.volume,
        speed: request.speed,
        fallbackSrc: request.fallbackSrc,
        requestId
      }).catch(e => {
        console.warn('🔊 Background: send to offscreen failed:', e);
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: 'mh-audio-done',
            requestId
          }).catch(() => {});
        }
        pendingAudioRequests.delete(requestId);
      });
    });
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === 'mh-audio-done') {
    const tabId = pendingAudioRequests.get(request.requestId);
    if (tabId) {
      pendingAudioRequests.delete(request.requestId);
      chrome.tabs.sendMessage(tabId, {
        action: 'mh-audio-done',
        requestId: request.requestId
      }).catch(() => {});
    }
    return false;
  }

  if (request.action === "switchTab") {
    chrome.tabs.query({}, (tabs) => {
      const targetTab = tabs.find(tab => tab.title.includes(request.keyword));
      if (targetTab) {
        chrome.tabs.update(targetTab.id, { active: true }, () => {
          // Ждём немного, чтобы вкладка точно активировалась
          setTimeout(() => {
            chrome.tabs.sendMessage(targetTab.id, { action: "insertCode", code: request.code });
          }, 700);
        });
      } else {
        console.warn("Вкладка с ключевым словом не найдена:", request.keyword);
      }
    });
  }
});


chrome.declarativeNetRequest.updateDynamicRules({
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "content-security-policy", operation: "remove" },
        { header: "x-frame-options", operation: "remove" }
      ]
    },
    condition: {
      urlFilter: "hubs.market.yandex.ru",
      resourceTypes: ["sub_frame"]
    }
  }],
  removeRuleIds: [1]
});

// background.js
// Управляет динамическими правилами блокировки конкретных Яндексовских звуков.
// Блокируем ТОЛЬКО конкретные MP3 по хэшам/паттернам, которые конфликтуют
// с нашей озвучкой. Остальные звуки Яндекса (бипы, уведомления) НЕ трогаем.
// Правила активны когда ЛЮБАЯ из наших озвучек включена:
//   renumEnabled (ячейки при приёмке/размещении)
//   issuingCellVoiceEnabled (ячейка при выдаче)
// Если обе выключены — убираем блокировку, Яндекс озвучивает сам.

const PVZ_BLOCK_RULES = [
  // 101: Озвучка цифр (номер ячейки) — Яндекс генерирует /{path}/{N}.mp3
  // Блокируем, т.к. мы озвучиваем сами через sounds/num/
  {
    id: 101,
    priority: 1,
    action: { type: 'block' },
    condition: {
      regexFilter: '^https://pvz-sound\\.s3\\.yandex\\.net/.*/\\d+\\.mp3',
    },
  },
  // 102: Конкретный звук — блокируем
  {
    id: 102,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||pvz-sound.s3.yandex.net/*/60BDA2A5F8EDD309028A8E3B8B2E047A.mp3',
    },
  },
  // 103: Конкретный звук — блокируем
  {
    id: 103,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||pvz-sound.s3.yandex.net/*/6AB52C2C3FB0D74D168FF69D498245CE.mp3',
    },
  },
  // 104: «Оплата при получении» — BLOCK
  // Вместо redirect: MAIN world перехватывает play() и отправляет
  // событие в content script, чтобы post_payment.mp3 играло в SoundQueue
  {
    id: 104,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||pvz-sound.s3.yandex.net/*/E2F9405756F98ED1339B540D1F604B6C.mp3',
    },
  },
];

// Включаем старые ID для очистки при обновлении
const PVZ_RULE_IDS = [101, 102, 103, 104];

/** Блокируем Яндексовскую TTS когда ЛЮБАЯ из наших озвучек активна */
async function applyPvzRules(renumEnabled, issuingCellVoiceEnabled) {
  const shouldBlock = renumEnabled || issuingCellVoiceEnabled;
  if (shouldBlock) {
    // Хотя бы одна наша озвучка активна — блокируем Яндексовские звуки
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: PVZ_BLOCK_RULES,
      removeRuleIds: PVZ_RULE_IDS,  // сначала удаляем чтобы не было дублей
    });
  } else {
    // Все наши озвучки выключены — убираем блокировку, Яндекс звучит сам
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [],
      removeRuleIds: PVZ_RULE_IDS,
    });
  }
}

// При старте service worker — синхронизируем правила с текущими значениями
chrome.storage.sync.get({ renumEnabled: true, issuingCellVoiceEnabled: true }, data => {
  applyPvzRules(data.renumEnabled, data.issuingCellVoiceEnabled);
});

// При изменении любого тоггла — обновляем правила мгновенно
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!('renumEnabled' in changes) && !('issuingCellVoiceEnabled' in changes)) return;
  // Перечитываем оба значения чтобы не рассинхронизироваться
  chrome.storage.sync.get({ renumEnabled: true, issuingCellVoiceEnabled: true }, data => {
    applyPvzRules(data.renumEnabled, data.issuingCellVoiceEnabled);
  });
});
