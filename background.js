

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
// Управляет динамическими правилами блокировки pvz-sound.
// Правила активны когда renumEnabled = true (озвучиваем сами — Яндекс молчит).
// Правила снимаются когда renumEnabled = false (Яндекс озвучивает сам).

const PVZ_BLOCK_RULES = [
  {
    id: 101,
    priority: 1,
    action: { type: 'block' },
    condition: {
      regexFilter: '^https://pvz-sound\\.s3\\.yandex\\.net/.*/\\d+\\.mp3$',
      resourceTypes: ['media'],
    },
  },
  {
    id: 102,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||pvz-sound.s3.yandex.net/*/60BDA2A5F8EDD309028A8E3B8B2E047A.mp3',
      resourceTypes: ['media'],
    },
  },
  {
    id: 103,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||pvz-sound.s3.yandex.net/*/6AB52C2C3FB0D74D168FF69D498245CE.mp3',
      resourceTypes: ['media'],
    },
  },
  {
    // «Оплата при получении» — редиректим на свой post_payment.mp3
    // Вместо block используем redirect: браузер прозрачно подменяет ответ,
    // код Яндекса сам воспроизводит наш звук — никаких проблем с autoplay/CSP.
    id: 104,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/sounds/post_payment.mp3' },
    },
    condition: {
      urlFilter: '||pvz-sound.s3.yandex.net/*/E2F9405756F98ED1339B540D1F604B6C.mp3',
      resourceTypes: ['media'],
    },
  },
];

const PVZ_RULE_IDS = PVZ_BLOCK_RULES.map(r => r.id);

async function applyPvzRules(renumEnabled) {
  if (renumEnabled) {
    // Озвучка наша — блокируем Яндексовские звуки
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: PVZ_BLOCK_RULES,
      removeRuleIds: PVZ_RULE_IDS,  // сначала удаляем чтобы не было дублей
    });
  } else {
    // Озвучка отключена — убираем блокировку, Яндекс звучит сам
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [],
      removeRuleIds: PVZ_RULE_IDS,
    });
  }
}

// При старте service worker — синхронизируем правила с текущим значением
chrome.storage.sync.get({ renumEnabled: true }, data => {
  applyPvzRules(data.renumEnabled);
});

// При изменении тоггла — обновляем правила мгновенно
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !('renumEnabled' in changes)) return;
  applyPvzRules(changes.renumEnabled.newValue);
});