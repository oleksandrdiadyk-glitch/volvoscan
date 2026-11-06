import { VolvoDiagnosticEngine, VOLVO_ECUS } from './volvoProtocol.js';

// --- State & App Init ---
const engine = new VolvoDiagnosticEngine(onEngineUpdate);

// Toast helper
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

// --- Tab Navigation ---
const tabs = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.tab-view');

tabs.forEach(btn => {
  btn.onclick = () => {
    tabs.forEach(t => t.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    const targetView = document.getElementById(btn.dataset.tab);
    if (targetView) targetView.classList.add('active');
  };
});

// --- Engine Update Handler (Live Data & UI Sync) ---
function onEngineUpdate(data) {
  // 1. Connection Pill & Battery
  const connPill = document.getElementById('conn-pill');
  const batteryVal = document.getElementById('battery-val');

  connPill.className = 'conn-pill';
  if (data.connected) {
    if (data.connectionType === 'demo') {
      connPill.classList.add('demo');
      connPill.textContent = '🟡 Демо-режим';
    } else {
      connPill.classList.add('online');
      connPill.textContent = '🟢 Подключено';
    }
    connPill.title = data.deviceName;
  } else {
    connPill.classList.add('offline');
    connPill.textContent = '⚪ Офлайн';
    connPill.title = 'Нажмите для подключения к OBD2';
  }

  batteryVal.textContent = `${data.batteryVoltage}V`;

  // 2. Live Sensors
  const live = data.liveData;
  document.getElementById('live-rpm').textContent = live.engineRpm;
  document.getElementById('live-coolant').textContent = live.coolantTemp;
  document.getElementById('live-fuel-press').textContent = live.fuelPressureBar;
  document.getElementById('live-ltft').textContent = (live.ltftBank1 > 0 ? '+' : '') + live.ltftBank1;

  // 6 Cylinders Misfires
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`cyl-${i}`);
    if (el) el.textContent = live.misfires[i - 1];
  }

  // Transmission & Haldex
  document.getElementById('live-atf-temp').textContent = live.atfTemp;
  document.getElementById('service-atf-temp').textContent = `${live.atfTemp} °C`;
  document.getElementById('live-gear').textContent = live.gearCurrent;
  document.getElementById('live-haldex-cur').textContent = live.haldexPumpCurrentMa;
  document.getElementById('live-haldex-press').textContent = live.haldexPressureBar;

  // Odometers
  document.getElementById('odo-dim').textContent = `${live.odometerDIM.toLocaleString('ru-RU')} км`;
  document.getElementById('odo-cem').textContent = `${live.odometerCEM.toLocaleString('ru-RU')} км`;
  document.getElementById('odo-tcm').textContent = `${live.odometerTCM.toLocaleString('ru-RU')} км`;

  // 3. Scan Progress UI
  const scanBar = document.getElementById('scan-bar');
  const scanStatus = document.getElementById('scan-status-text');
  const scanProgressWrap = document.getElementById('scan-progress-wrap');

  if (data.scanResults.status === 'scanning') {
    scanProgressWrap.style.display = 'flex';
    scanBar.style.width = `${data.scanResults.progress}%`;
    scanStatus.textContent = data.scanResults.currentEcu
      ? `Опрос модуля ${data.scanResults.currentEcu.id}: ${data.scanResults.currentEcu.name}...`
      : 'Подготовка к опросу шины CAN...';
  } else if (data.scanResults.status === 'finished') {
    scanProgressWrap.style.display = 'none';
  }
}

// --- Diagnostic Full Scan Action ---
const btnStartScan = document.getElementById('btn-start-scan');
const dtcListContainer = document.getElementById('dtc-list');
const dtcCountBadge = document.getElementById('dtc-count-badge');
const btnClearDtc = document.getElementById('btn-clear-dtc');

btnStartScan.onclick = async () => {
  if (!engine.connected) {
    // If not connected yet, automatically start Demo mode so user can see it right away!
    engine.enableDemoMode();
    showToast('Включен демо-режим для симуляции вашей XC70');
  }

  btnStartScan.disabled = true;
  btnStartScan.textContent = '⏳ Идет глубокое сканирование...';

  try {
    const errors = await engine.startFullScan();
    renderDtcResults(errors);
  } catch (err) {
    showToast(`Ошибка сканирования: ${err.message}`);
  } finally {
    btnStartScan.disabled = false;
    btnStartScan.innerHTML = '<span>🔍</span> Сканировать повторно';
  }
};

function renderDtcResults(errors) {
  dtcListContainer.innerHTML = '';
  dtcCountBadge.textContent = `Ошибок: ${errors.length}`;

  if (errors.length === 0) {
    dtcListContainer.innerHTML = `
      <div style="text-align: center; color: var(--green); padding: 20px 0; font-size: 14px; font-weight: 700;">
        ✅ Во всех 10 блоках управления ошибок не обнаружено!
      </div>
    `;
    btnClearDtc.style.display = 'none';
    return;
  }

  errors.forEach(err => {
    const item = document.createElement('div');
    item.className = `dtc-item ${err.severity}`;
    item.innerHTML = `
      <div class="dtc-head">
        <span class="dtc-code">${err.code}</span>
        <span class="dtc-status-pill">${err.ecu} • ${err.status}</span>
      </div>
      <div class="dtc-title">${err.title}</div>
    `;
    dtcListContainer.appendChild(item);
  });

  btnClearDtc.style.display = 'flex';
}

// Clear DTC Action
btnClearDtc.onclick = async () => {
  if (confirm('Стереть все коды неисправностей (DTC) во всех блоках?')) {
    btnClearDtc.disabled = true;
    btnClearDtc.textContent = 'Очистка памяти ЭБУ...';
    await engine.clearAllDTCs();
    renderDtcResults([]);
    showToast('Память кодов неисправностей успешно очищена!');
    btnClearDtc.disabled = false;
  }
};

// --- Service Functions ---

// 1. EPB Open (Service Mode for Rear Calipers)
document.getElementById('btn-epb-open').onclick = async () => {
  if (confirm('ВНИМАНИЕ: Автомобиль должен стоять на ровной поверхности с выключенным стояночным тормозом. Развести задние суппорты для замены колодок?')) {
    showToast('Разведение приводов суппортов (EPB)... Пожалуйста, подождите');
    const res = await engine.setEPBServiceMode(true);
    showToast(res.message, 4000);
  }
};

// 2. EPB Close & Calibrate
document.getElementById('btn-epb-close').onclick = async () => {
  showToast('Сведение приводов и калибровка рабочего зазора колодок...');
  const res = await engine.setEPBServiceMode(false);
  showToast(res.message, 4000);
};

// 3. Reset SRI Service Interval
document.getElementById('btn-reset-sri').onclick = async () => {
  const res = await engine.resetSRI();
  showToast(res.message, 3500);
};

// 4. Reset ATF Degradation Counter
document.getElementById('btn-reset-atf').onclick = async () => {
  if (confirm('Сбросить счетчик деградации масла АКПП Aisin TF-80SC? Выполняйте только после полной или частичной замены масла.')) {
    const res = await engine.resetAtfDegradation();
    showToast(res.message, 3500);
  }
};

// --- Connection Buttons ---
document.getElementById('conn-pill').onclick = () => {
  document.getElementById('btn-tab-conn').click();
};

// --- Native Android APK Bridge Integration ---
function initNativeBridge() {
  if (engine.isNativeAndroidAvailable()) {
    const card = document.getElementById('native-bt-card');
    if (card) card.style.display = 'block';
    refreshNativeDeviceList();
  }
}

function refreshNativeDeviceList() {
  const select = document.getElementById('native-bt-select');
  if (!select) return;
  select.innerHTML = '';

  try {
    const devices = engine.getNativePairedDevices();
    if (!devices || devices.length === 0) {
      select.innerHTML = '<option value="">(Нет спаренных устройств. Спарьте в Bluetooth телефона)</option>';
      return;
    }

    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.address;
      opt.textContent = `${d.name} [${d.address}]`;
      select.appendChild(opt);
    });
  } catch (err) {
    showToast(`Ошибка: ${err.message}`);
  }
}

document.getElementById('btn-refresh-paired').onclick = () => {
  refreshNativeDeviceList();
  showToast('Список Bluetooth устройств обновлен');
};

document.getElementById('btn-connect-native').onclick = async () => {
  const select = document.getElementById('native-bt-select');
  const mac = select ? select.value : '';
  if (!mac) {
    showToast('Выберите адаптер из списка');
    return;
  }
  showToast('Подключение к ELM327...');
  try {
    const res = await engine.connectNativeBluetooth(mac);
    showToast(`Успешно подключено: ${res.name}`, 4000);
    document.getElementById('btn-tab-diag').click();
  } catch (err) {
    showToast(`Ошибка: ${err.message}`, 4500);
  }
};

window.onNativeBridgeReady = initNativeBridge;
window.onNativePermissionsUpdated = refreshNativeDeviceList;
if (typeof window.AndroidBluetooth !== 'undefined') {
  initNativeBridge();
}

document.getElementById('btn-conn-bluetooth').onclick = async () => {
  try {
    const res = await engine.connectBluetooth();
    showToast(`Подключено: ${res.name}`);
    document.getElementById('btn-tab-diag').click();
  } catch (err) {
    showToast(`Ошибка Bluetooth: ${err.message || 'Отменено'}`);
  }
};

document.getElementById('btn-conn-usb').onclick = async () => {
  try {
    const res = await engine.connectUSB();
    showToast(`Подключено: ${res.name}`);
    document.getElementById('btn-tab-diag').click();
  } catch (err) {
    showToast(`Ошибка USB: ${err.message || 'Отменено'}`);
  }
};

document.getElementById('btn-conn-demo').onclick = () => {
  engine.enableDemoMode();
  showToast('Демо-режим активирован. Загружены параметры Volvo XC70 3.2 AWD');
  document.getElementById('btn-tab-diag').click();
};

// Auto start demo mode on load for immediate preview
engine.enableDemoMode();


// --- Service Worker Registration for Offline Usage in Garage ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('VolvoScan Service Worker registered successfully');
    }).catch(err => {
      console.warn('Service Worker registration failed:', err);
    });
  });
}

// --- PWA Installation Prompt ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showToast('Нажмите "Установить на телефон" для быстрого запуска', 5000);
});
