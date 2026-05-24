const SETTINGS = [
  { id: 'toggleRedesign',          key: 'redesignEnabled',          def: true  },
  { id: 'toggleShipRedesign',      key: 'shipRedesignEnabled',      def: true  },
  { id: 'toggleCompactHint',       key: 'compactHintEnabled',       def: true  },
  { id: 'toggleCompactNews',       key: 'compactNewsEnabled',       def: true  },
  { id: 'toggleFadeInElements',    key: 'fadeInElementsEnabled',    def: true  },
  { id: 'toggleNewIssuing',        key: 'newIssuingEnabled',        def: false },
  { id: 'toggleIssuingCellVoice',  key: 'issuingCellVoiceEnabled',  def: true  },
  { id: 'toggleNewAcceptance',     key: 'newAcceptanceEnabled',     def: false },
  { id: 'toggleNoBarcode',         key: 'noBarcodeEnabled',         def: true  },
  { id: 'toggleVoiceAlerts',       key: 'voiceAlertsEnabled',       def: true  },
  { id: 'toggleRenum',             key: 'renumEnabled',             def: true  },
  { id: 'togglePlacementComplete', key: 'placementCompleteEnabled', def: true  },
  { id: 'toggleGoSound',           key: 'goSoundEnabled',           def: true  },
  { id: 'toggleEnterCodeSound',    key: 'enterCodeSoundEnabled',    def: true  },
  { id: 'toggleOplataSound',       key: 'oplataSoundEnabled',       def: true  },
  { id: 'toggleSuccessShipSound',  key: 'successShipSoundEnabled',  def: true  },
  { id: 'toggleHotkeys',           key: 'hotkeysEnabled',           def: true  },
];

document.addEventListener('DOMContentLoaded', () => {
  const storageKeys = [...SETTINGS.map(s => s.key), 'voiceProfile', 'hiddenNewsBlocks'];

  chrome.storage.sync.get(storageKeys, (data) => {
    // Тогглы
    SETTINGS.forEach(({ id, key, def }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = data[key] !== undefined ? data[key] : def;
    });

    // Голос
    setActiveVoice(data.voiceProfile || 'alice');

    // Скрытые новости
    updateRestoreRow(data.hiddenNewsBlocks || []);
  });

  // Обработчики тогглов
  SETTINGS.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => chrome.storage.sync.set({ [key]: el.checked }));
  });

  // ── Выбор голоса (pill-кнопки) ──
  function setActiveVoice(voice) {
    document.querySelectorAll('.vpill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.voice === voice);
    });
  }

  document.querySelectorAll('.vpill').forEach(btn => {
    btn.addEventListener('click', () => {
      const voice = btn.dataset.voice;
      setActiveVoice(voice);
      chrome.storage.sync.set({ voiceProfile: voice });
    });
  });

  // ── Восстановление скрытых новостей ──
  const restoreRow  = document.getElementById('restoreNewsRow');
  const restoreDesc = document.getElementById('restoreNewsDesc');
  const restoreBtn  = document.getElementById('restoreNewsBtn');

  function updateRestoreRow(list) {
    const count = (list || []).length;
    if (restoreRow) restoreRow.style.display = count > 0 ? '' : 'none';
    if (restoreDesc) restoreDesc.textContent = `Скрыто блоков: ${count}`;
  }

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      chrome.storage.sync.set({ hiddenNewsBlocks: [] }, () => {
        updateRestoreRow([]);
        chrome.tabs.query(
          { url: ['*://hubs.market.yandex.ru/*', '*://logistics.market.yandex.ru/*'] },
          tabs => tabs.forEach(tab =>
            chrome.tabs.sendMessage(tab.id, { action: 'mh-restore-news' }).catch(() => {})
          )
        );
      });
    });
  }
});
