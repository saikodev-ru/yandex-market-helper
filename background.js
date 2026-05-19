

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
// Управляет динамическими правилами блокировки Яндексовской TTS.
// Блокируем ТОЛЬКО voice_generated_prod — это сгенерированная
// Яндексом озвучка ячейки выдачи, которая конфликтует с нашей.
// Остальные звуки (бипы, уведомления) НЕ блокируются.
// Правила активны когда ЛЮБАЯ из наших озвучек включена:
//   renumEnabled (ячейки при приёмке/размещении)
//   issuingCellVoiceEnabled (ячейка при выдаче)
// Если обе выключены — убираем блокировку, Яндекс озвучивает сам.

const PVZ_BLOCK_RULES = [
  // Блокируем ТОЛЬКО TTS-озвучку Яндекса (voice_generated_prod).
  // Это сгенерированные голосовые файлы, которые дублируют нашу озвучку ячеек.
  // Остальные звуки уведомлений (бипы и т.д.) не трогаем.
  {
    id: 101,
    priority: 1,
    action: { type: 'block' },
    condition: {
      regexFilter: '^https://pvz-sound\\.s3\\.yandex\\.net/voice_generated_prod/.*\\.mp3$',
      resourceTypes: ['media'],
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
