// Все настройки расширения: [id чекбокса, ключ в storage, значение по умолчанию]
const SETTINGS = [
  { id: 'toggleRedesign',          key: 'redesignEnabled',          def: true  },
  { id: 'toggleShipRedesign',      key: 'shipRedesignEnabled',      def: true  },
  { id: 'toggleCompactHint',       key: 'compactHintEnabled',       def: true  },
  { id: 'toggleCompactNews',       key: 'compactNewsEnabled',       def: true  },
  { id: 'toggleNewIssuing',        key: 'newIssuingEnabled',        def: false },
  { id: 'toggleNewAcceptance',     key: 'newAcceptanceEnabled',     def: false },
  { id: 'toggleNoBarcode',         key: 'noBarcodeEnabled',        def: true  },
  { id: 'toggleVoiceAlerts',       key: 'voiceAlertsEnabled',      def: true  },
  { id: 'togglePlacementComplete', key: 'placementCompleteEnabled', def: true  },
  { id: 'toggleGoSound',           key: 'goSoundEnabled',          def: true  },
  { id: 'toggleEnterCodeSound',    key: 'enterCodeSoundEnabled',   def: true  },
  { id: 'toggleOplataSound',       key: 'oplataSoundEnabled',      def: true  },
  { id: 'toggleSuccessShipSound',  key: 'successShipSoundEnabled', def: true  },
  { id: 'toggleHotkeys',           key: 'hotkeysEnabled',          def: true  },
  { id: 'toggleRenum',             key: 'renumEnabled',             def: true  },
  { id: 'toggleFadeInElements',    key: 'fadeInElementsEnabled',    def: true  },
];

document.addEventListener('DOMContentLoaded', () => {
  const storageKeys = [...SETTINGS.map(s => s.key), 'theme'];

  // Загружаем сохранённые значения и выставляем состояния тогглов + тему
  chrome.storage.sync.get(storageKeys, (data) => {
    SETTINGS.forEach(({ id, key, def }) => {
      const checkbox = document.getElementById(id);
      if (!checkbox) return;
      const value = (data[key] !== undefined) ? data[key] : def;
      checkbox.checked = value;
    });

    // Восстанавливаем тему
    const theme = data.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  });

  // Вешаем обработчики: изменение тоггла → сохраняем в storage
  SETTINGS.forEach(({ id, key }) => {
    const checkbox = document.getElementById(id);
    if (!checkbox) return;
    checkbox.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: checkbox.checked });
    });
  });

  // Кнопка смены темы
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      chrome.storage.sync.set({ theme: next });
    });
  }

  // ── Восстановление скрытых новостных блоков ──────────────────────────────
  const restoreRow  = document.getElementById('restoreNewsRow');
  const restoreDesc = document.getElementById('restoreNewsDesc');
  const restoreBtn  = document.getElementById('restoreNewsBtn');

  function updateRestoreRow() {
    chrome.storage.sync.get({ hiddenNewsBlocks: [] }, data => {
      const count = (data.hiddenNewsBlocks || []).length;
      if (count > 0) {
        restoreRow.style.display = '';
        restoreDesc.textContent = `Скрыто блоков: ${count}`;
      } else {
        restoreRow.style.display = 'none';
      }
    });
  }
  updateRestoreRow();

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      // Сбрасываем список скрытых
      chrome.storage.sync.set({ hiddenNewsBlocks: [] }, () => {
        updateRestoreRow();
        // Отправляем сообщение во все вкладки с маркетом
        chrome.tabs.query({ url: ['*://hubs.market.yandex.ru/*', '*://logistics.market.yandex.ru/*'] }, tabs => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'mh-restore-news' }).catch(() => {});
          });
        });
      });
    });
  }
});