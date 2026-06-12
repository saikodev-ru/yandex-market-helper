

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
    id: 104,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||pvz-sound.s3.yandex.net/voice_generated_prod/RU/NORMAL/39747E975806EAA650385B84F760CB92.mp3',
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


// ============================================================
// Перехват заблокированных звуков (ERR_BLOCKED_BY_CLIENT)
// Если Яндекс пытается воспроизвести N.mp3 и он блокируется
// (нашим расширением или внешним блокировщиком) — подменяем
// своим звуком из sounds/num/N.mp3
// ============================================================

const NOT_FOUND_HASH = '39747E975806EAA650385B84F760CB92';

// ============================================================
// Окончание смены — FNAF-анимация по таймеру
// ============================================================

const MATCH_URLS = [
  'https://partner.market.yandex.ru/*',
  'https://hubs.market.yandex.ru/*',
  'https://logistics.market.yandex.ru/*',
];

function getNextShiftEndMs(timeStr) {
  const [h, m] = (timeStr || '21:00').split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= new Date()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function scheduleShiftEndAlarm() {
  chrome.alarms.clear('shiftEnd', () => {
    chrome.storage.sync.get({ shiftEndEnabled: true, shiftEndTime: '21:00' }, data => {
      if (!data.shiftEndEnabled) return;
      chrome.alarms.create('shiftEnd', { when: getNextShiftEndMs(data.shiftEndTime) });
    });
  });
}

// При старте SW
scheduleShiftEndAlarm();

// При изменении настроек
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if ('shiftEndEnabled' in changes || 'shiftEndTime' in changes) {
    scheduleShiftEndAlarm();
  }
});

// Когда будильник срабатывает
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'shiftEnd') return;
  chrome.storage.sync.get({ shiftEndTime: '21:00' }, data => {
    const timeStr = data.shiftEndTime || '21:00';
    chrome.tabs.query({ url: MATCH_URLS }, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showShiftEndAnimation',
          time: timeStr,
        }).catch(() => {});
      });
    });
  });
});

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.type !== 'media') return;
    if (details.tabId === -1) return;

    // not_found звук
    if (details.url.includes(NOT_FOUND_HASH)) {
      chrome.tabs.sendMessage(details.tabId, {
        action: 'playBlockedSound',
        sound: 'sounds/not_found.mp3'
      }).catch(() => {});
      return;
    }

    // числовой звук ячейки (N.mp3)
    const match = details.url.match(/\/(\d{1,3})\.mp3(?:\?|$)/i);
    if (!match) return;
    const number = parseInt(match[1], 10);
    if (isNaN(number) || number < 1) return;

    chrome.tabs.sendMessage(details.tabId, {
      action: 'playBlockedNumber',
      number
    }).catch(() => {});
  },
  { urls: ['<all_urls>'] }
);