const SETTINGS = [
  { id: 'toggleRedesign',          key: 'redesignEnabled',          def: true  },
  { id: 'toggleShipRedesign',      key: 'shipRedesignEnabled',      def: true  },
  { id: 'toggleCompactHint',       key: 'compactHintEnabled',       def: true  },
  { id: 'toggleCompactNews',       key: 'compactNewsEnabled',       def: true  },
  { id: 'toggleNewIssuing',        key: 'newIssuingEnabled',        def: false },
  { id: 'toggleNewAcceptance',     key: 'newAcceptanceEnabled',     def: false },
  { id: 'toggleNoBarcode',         key: 'noBarcodeEnabled',         def: true  },
  { id: 'toggleVoiceAlerts',       key: 'voiceAlertsEnabled',       def: true  },
  { id: 'togglePlacementComplete', key: 'placementCompleteEnabled', def: true  },
  { id: 'toggleGoSound',           key: 'goSoundEnabled',           def: true  },
  { id: 'toggleEnterCodeSound',    key: 'enterCodeSoundEnabled',    def: true  },
  { id: 'toggleOplataSound',       key: 'oplataSoundEnabled',       def: true  },
  { id: 'toggleSuccessShipSound',  key: 'successShipSoundEnabled',  def: true  },
  { id: 'toggleHotkeys',           key: 'hotkeysEnabled',           def: true  },
  { id: 'toggleRenum',             key: 'renumEnabled',             def: true  },
  { id: 'toggleShiftEnd',          key: 'shiftEndEnabled',          def: true  },
];

document.addEventListener('DOMContentLoaded', () => {
  const storageKeys = [...SETTINGS.map(s => s.key), 'theme', 'shiftEndTime'];

  // Загрузка состояний
  chrome.storage.sync.get(storageKeys, (data) => {
    SETTINGS.forEach(({ id, key, def }) => {
      const cb = document.getElementById(id);
      if (!cb) return;
      cb.checked = data[key] !== undefined ? data[key] : def;
    });

    // Тема
    document.documentElement.setAttribute('data-theme', data.theme || 'dark');

    // Время окончания смены
    const timeInput = document.getElementById('shiftEndTime');
    if (timeInput) timeInput.value = data.shiftEndTime || '21:00';

    // Видимость строки времени
    updateShiftEndRow();
  });

  // Тогглы → storage
  SETTINGS.forEach(({ id, key }) => {
    const cb = document.getElementById(id);
    if (!cb) return;
    cb.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: cb.checked });
      if (key === 'shiftEndEnabled') updateShiftEndRow();
    });
  });

  // Время окончания смены
  const timeInput = document.getElementById('shiftEndTime');
  if (timeInput) {
    timeInput.addEventListener('change', () => {
      chrome.storage.sync.set({ shiftEndTime: timeInput.value });
    });
  }

  // Кнопка «Тест»
  const testBtn = document.getElementById('testShiftEnd');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        const time = document.getElementById('shiftEndTime').value || '21:00';
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showShiftEndAnimation',
          time
        }).catch(() => {});
      });
    });
  }

  // Смена темы
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      chrome.storage.sync.set({ theme: next });
    });
  }

  // Восстановление скрытых новостей
  const restoreRow = document.getElementById('restoreNewsRow');
  const restoreTitle = document.getElementById('restoreNewsTitle');
  const restoreBtn = document.getElementById('restoreNewsBtn');

  function updateRestoreRow() {
    chrome.storage.sync.get({ hiddenNewsBlocks: [] }, data => {
      const count = (data.hiddenNewsBlocks || []).length;
      if (count > 0 && restoreRow && restoreTitle) {
        restoreRow.style.display = '';
        restoreTitle.textContent = `Скрыто: ${count}`;
      } else if (restoreRow) {
        restoreRow.style.display = 'none';
      }
    });
  }
  updateRestoreRow();

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      chrome.storage.sync.set({ hiddenNewsBlocks: [] }, () => {
        updateRestoreRow();
        chrome.tabs.query({ url: ['*://hubs.market.yandex.ru/*', '*://logistics.market.yandex.ru/*'] }, tabs => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'mh-restore-news' }).catch(() => {});
          });
        });
      });
    });
  }
});

function updateShiftEndRow() {
  const row = document.getElementById('shiftEndTimeRow');
  const cb = document.getElementById('toggleShiftEnd');
  if (row && cb) row.style.display = cb.checked ? '' : 'none';
}