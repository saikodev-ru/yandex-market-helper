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

// Parent toggle → dependent sub-element
const DEPENDENTS = {
  toggleShiftEnd: 'shiftEndSub',
};

document.addEventListener('DOMContentLoaded', () => {
  const storageKeys = [...SETTINGS.map(s => s.key), 'theme', 'shiftEndTime', 'hiddenNewsBlocks'];

  // ── Load states ──
  chrome.storage.sync.get(storageKeys, (data) => {
    SETTINGS.forEach(({ id, key, def }) => {
      const cb = document.getElementById(id);
      if (!cb) return;
      cb.checked = data[key] !== undefined ? data[key] : def;
    });

    document.documentElement.setAttribute('data-theme', data.theme || 'dark');

    initHourPicker(data.shiftEndTime || '21:00');
    updateDependents();
    updateRestoreRow(data);
  });

  // ── Toggles → storage ──
  SETTINGS.forEach(({ id, key }) => {
    const cb = document.getElementById(id);
    if (!cb) return;
    cb.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: cb.checked });
      updateDependents();
    });
  });

  // ── Tabs ──
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab)?.classList.add('active');
    });
  });

  // ── Test button ──
  const testBtn = document.getElementById('testShiftEnd');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        const time = document.getElementById('hourRow')?.dataset.value || '21:00';
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showShiftEndAnimation',
          time
        }).catch(() => {});
      });
    });
  }

  // ── Theme ──
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      chrome.storage.sync.set({ theme: next });
    });
  }

  // ── Upload (type lines) ──
  const uploadText = document.getElementById('uploadText');
  const uploadCount = document.getElementById('uploadCount');
  const uploadStart = document.getElementById('uploadStart');

  if (uploadText && uploadCount) {
    const updateCount = () => {
      const lines = uploadText.value.split('\n').filter(l => l.trim());
      uploadCount.textContent = lines.length + ' строк';
    };
    uploadText.addEventListener('input', updateCount);
    updateCount();
  }

  if (uploadStart) {
    uploadStart.addEventListener('click', () => {
      const text = uploadText?.value || '';
      const lines = text.split('\n').filter(l => l.trim());
      if (!lines.length) return;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'typeLines',
          lines
        }).catch(() => {});
      });
      // Visual feedback
      const originalHTML = uploadStart.innerHTML;
      uploadStart.innerHTML = '<svg viewBox=\"0 0 24 24\" style=\"width:12px;height:12px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;\"><polyline points=\"20 6 9 17 4 12\"/></svg>Отправлено';
      uploadStart.style.background = '#34c759';
      setTimeout(() => {
        uploadStart.innerHTML = originalHTML;
        uploadStart.style.background = '';
      }, 1200);
    });
  }

  // ── Restore hidden news ──
  const restoreBtn = document.getElementById('restoreNewsBtn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      chrome.storage.sync.set({ hiddenNewsBlocks: [] }, () => {
        chrome.storage.sync.get({ hiddenNewsBlocks: [] }, updateRestoreRow);
        chrome.tabs.query({ url: ['*://hubs.market.yandex.ru/*', '*://logistics.market.yandex.ru/*'] }, tabs => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'mh-restore-news' }).catch(() => {});
          });
        });
      });
    });
  }
});

// ── Dependent sub-elements ──
function updateDependents() {
  Object.entries(DEPENDENTS).forEach(([toggleId, subId]) => {
    const cb = document.getElementById(toggleId);
    const sub = document.getElementById(subId);
    if (!cb || !sub) return;
    sub.classList.toggle('disabled', !cb.checked);
  });
}

// ── Restore news row ──
function updateRestoreRow(data) {
  const row = document.getElementById('restoreNewsRow');
  const title = document.getElementById('restoreNewsTitle');
  if (!data) {
    chrome.storage.sync.get({ hiddenNewsBlocks: [] }, updateRestoreRow);
    return;
  }
  const count = (data.hiddenNewsBlocks || []).length;
  if (count > 0 && row && title) {
    row.style.display = '';
    title.textContent = 'Скрыто: ' + count;
  } else if (row) {
    row.style.display = 'none';
  }
}

// ── Hour picker ──
function initHourPicker(selectedTime) {
  const row = document.getElementById('hourRow');
  if (!row) return;

  const selectedHour = parseInt(selectedTime, 10) || 21;
  const HOURS = [17, 18, 19, 20, 21, 22];

  HOURS.forEach(h => {
    const btn = document.createElement('button');
    btn.className = 'hpill' + (h === selectedHour ? ' active' : '');
    btn.textContent = h;
    btn.addEventListener('click', () => {
      row.querySelectorAll('.hpill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = String(h).padStart(2, '0') + ':00';
      row.dataset.value = val;
      chrome.storage.sync.set({ shiftEndTime: val });
    });
    row.appendChild(btn);
  });

  row.dataset.value = String(Math.min(Math.max(selectedHour, 17), 22)).padStart(2, '0') + ':00';
}