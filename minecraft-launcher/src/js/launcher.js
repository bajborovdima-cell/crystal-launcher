let isLaunching = false;
let isRunning = false;
let selectedModloader = 'vanilla';
let availableVersions = [];
let selectedVersion = '26.1.2';
let modloaderVersionOptions = [];

function setPlayButton(mode) {
  const btn = document.getElementById('playBtn');
  if (mode === 'loading') {
    btn.classList.add('btn-loading');
    btn.disabled = true;
    btn.innerHTML = `
      <span class="btn-icon-play">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke="currentColor" fill="none"/>
          <path d="M12 6v6l4 2" stroke="currentColor"/>
        </svg>
      </span>
      <span class="btn-text-play">Загрузка...</span>
    `;
  } else if (mode === 'running') {
    btn.classList.remove('btn-loading');
    btn.disabled = true;
    btn.innerHTML = `
      <span class="btn-icon-play">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
        </svg>
      </span>
      <span class="btn-text-play">Запущенно</span>
    `;
  } else {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    btn.innerHTML = `
      <span class="btn-icon-play">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </span>
      <span class="btn-text-play">Играть</span>
    `;
  }
}

async function playGame() {
  if (isLaunching || isRunning) return;
  isLaunching = true;

  const username = document.getElementById('usernameInput').value.trim() || 'Player';
  const ram = document.querySelector('.ram-btn.active')?.dataset.ram || 4;
  localStorage.setItem('saved-ram', ram);
  localStorage.setItem('saved-username', username);

  if (username.length > 16) {
    showToast('Ник не может быть длиннее 16 символов');
    isLaunching = false;
    return;
  }

  setPlayButton('loading');

  try {
    const version = document.getElementById('versionSelect').value || selectedVersion;

    const result = await crystalAPI.launchGame({
      username,
      version,
      modloader: selectedModloader,
      jvmArgs: [`-Xmx${ram}G`, `-Xms${ram}G`, '-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC']
    });

    if (result.success) {
      showToast(`Minecraft ${version} запущен!`);
    } else {
      showToast('Ошибка: ' + (result.error || 'неизвестная'));
      setPlayButton('idle');
      isLaunching = false;
    }
  } catch (err) {
    showToast('Ошибка запуска: ' + err.message);
    setPlayButton('idle');
    isLaunching = false;
  }
}

async function refreshVersions() {
  const select = document.getElementById('versionSelect');
  select.innerHTML = '<option>Загрузка...</option>';
  select.disabled = true;

  try {
    const list = await crystalAPI.fetchVersions();
    availableVersions = list;
    if (!list || list.length === 0) throw new Error('Список версий пуст');
    addConsoleLog(`Загружено версий: ${list.length}`);
    select.innerHTML = '';

    const releases = list.filter(v => v.type === 'release').sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    const snapshots = list.filter(v => v.type === 'snapshot').sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    const others = list.filter(v => v.type !== 'release' && v.type !== 'snapshot').sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

    function addGroup(label, items) {
      if (items.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = label;
      items.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.id;
        if (v.id === selectedVersion) opt.selected = true;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }

    addGroup('Релизы', releases);
    addGroup('Снимки', snapshots);
    addGroup('Прочее', others);

    select.disabled = false;
    // Если selectedVersion не найден в списке — выбираем первый релиз
    if (!list.some(v => v.id === selectedVersion)) {
      if (releases.length > 0) selectedVersion = releases[0].id;
      else if (snapshots.length > 0) selectedVersion = snapshots[0].id;
      else if (others.length > 0) selectedVersion = others[0].id;
      select.value = selectedVersion;
    }
    onVersionChange();
  } catch (err) {
    showToast('Ошибка загрузки версий: ' + err.message);
    select.innerHTML = `<option value="${selectedVersion}">${selectedVersion}</option>`;
    select.disabled = false;
  }
}

let statusCheckTimer = null;

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
}

function onVersionChange() {
  const select = document.getElementById('versionSelect');
  const v = select.value;
  if (v) {
    selectedVersion = v;
    document.getElementById('selectedVersionDisplay').textContent = v;
    const info = availableVersions.find(x => x.id === v);
    const typeLabel = info ? (info.type === 'release' ? 'Релиз' : info.type === 'snapshot' ? 'Снимок' : info.type) : '';
    document.getElementById('selectedVersionLabel').textContent = typeLabel;
    document.getElementById('releaseDate').textContent = formatDate(info?.releaseTime);
    checkVersionStatus(v);
    checkModloaderAvailability(v);
  }
}

function selectModloader(type) {
  selectedModloader = type;
  document.querySelectorAll('.modloader-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.modloader === type);
  });
}

async function checkModloaderAvailability(v, preselectedValue) {
  const btns = {
    fabric: document.querySelector('.modloader-btn[data-modloader="fabric"]'),
    forge: document.querySelector('.modloader-btn[data-modloader="forge"]'),
    neoforge: document.querySelector('.modloader-btn[data-modloader="neoforge"]'),
    quilt: document.querySelector('.modloader-btn[data-modloader="quilt"]'),
    crystite: document.querySelector('.modloader-btn[data-modloader="crystite"]')
  };
  for (const b of Object.values(btns)) if (b) b.classList.add('checking');
  const [fabricOk, forgeOk] = await Promise.all([
    crystalAPI.checkModloaderAvailability({ version: v, type: 'fabric' }),
    crystalAPI.checkModloaderAvailability({ version: v, type: 'forge' })
  ]);
  // NeoForge, Quilt, Crystite — в разработке, пока недоступны
  const results = { fabric: fabricOk, forge: forgeOk, neoforge: false, quilt: false, crystite: false };
  for (const [key, btn] of Object.entries(btns)) {
    if (btn) {
      btn.classList.remove('checking');
      if (key === 'neoforge' || key === 'quilt' || key === 'crystite') {
        btn.style.display = 'none';
      } else {
        btn.style.opacity = results[key] ? '1' : '0.4';
      }
    }
  }

  if (selectedModloader !== 'vanilla') {
    const active = document.querySelector('.modloader-btn.active');
    if (active && active.style.opacity === '0.4') {
      selectModloader('vanilla');
    }
  }
}

function startStatusPolling() {
  stopStatusPolling();
  statusCheckTimer = setInterval(() => {
    checkVersionStatus(selectedVersion);
  }, 5000);
}

function stopStatusPolling() {
  if (statusCheckTimer) {
    clearInterval(statusCheckTimer);
    statusCheckTimer = null;
  }
}

async function checkVersionStatus(v) {
  const el = document.getElementById('mcStatus');
  try {
    const status = await crystalAPI.getMinecraftStatus(v);
    el.textContent = status.installed ? 'Установлена' : 'Не установлена';
    el.style.color = status.installed ? 'var(--green)' : 'var(--red)';
  } catch {
    el.textContent = '—';
  }
}

crystalAPI.onDownloadProgress((msg) => addConsoleLog(msg));
crystalAPI.onLaunchLog((msg) => addConsoleLog(msg));
crystalAPI.onLaunchError((msg) => addConsoleLog(`[ОШИБКА] ${msg}`));
crystalAPI.onVersionStatusUpdated((version) => {
  if (version === selectedVersion) checkVersionStatus(version);
});
crystalAPI.onGameStatus((status) => {
  if (status.running) {
    isRunning = true;
    isLaunching = false;
    setPlayButton('running');
  } else {
    isRunning = false;
    setPlayButton('idle');
  }
});

function addConsoleLog(msg) {
  const output = document.getElementById('consoleOutput');
  const time = new Date().toLocaleTimeString();
  output.innerHTML += `[${time}] ${msg}\n`;
  output.scrollTop = output.scrollHeight;
}

function showConsole() {
  document.getElementById('console').style.display = 'block';
}

function hideConsole() {
  document.getElementById('console').style.display = 'none';
}

async function openGameFolder() {
  try {
    await crystalAPI.openGameFolder();
  } catch {
    showToast('Не удалось открыть папку игры');
  }
}

async function checkJavaStatus() {
  const el = document.getElementById('javaStatus');
  try {
    const javaPath = await crystalAPI.getJavaPath();
    el.textContent = javaPath ? javaPath.replace(/\\/g, '/').split('/').pop() : 'Не найдена';
  } catch {
    el.textContent = 'Не найдена';
  }
}

function dismissWelcome() {
  localStorage.setItem('welcome-dismissed', '1');
  document.getElementById('welcomeOverlay').classList.add('hidden');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function loadMods() {
  const list = document.getElementById('modsList');
  const count = document.getElementById('modsCount');
  try {
    const mods = await crystalAPI.listMods();
    count.textContent = mods.length;
    if (mods.length === 0) {
      list.innerHTML = '<div class="mods-empty">Моды не найдены. Поместите .jar файлы в папку mods или импортируйте модпак.</div>';
      return;
    }
    list.innerHTML = '';
    for (const mod of mods) {
      const item = document.createElement('div');
      item.className = 'mod-item' + (mod.enabled ? '' : ' disabled');
      item.dataset.name = mod.name;
      item.innerHTML = `
        <div class="mod-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        </div>
        <div class="mod-info">
          <div class="mod-name">${mod.name.replace(/\.(jar|disabled)$/g, '')}</div>
          <div class="mod-meta">${formatSize(mod.size)} &middot; ${mod.enabled ? 'включён' : 'отключён'}</div>
        </div>
        <div class="mod-actions">
          <label class="toggle-switch">
            <input type="checkbox" class="mod-toggle" ${mod.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          <button class="mod-btn danger mod-delete">Удалить</button>
        </div>`;
      list.appendChild(item);
    }
  } catch {
    list.innerHTML = '<div class="mods-empty">Ошибка загрузки модов</div>';
  }
}

document.addEventListener('change', (e) => {
  const toggle = e.target.closest('.mod-toggle');
  if (toggle) {
    const item = toggle.closest('.mod-item');
    if (item) {
      crystalAPI.toggleMod(item.dataset.name).then(() => loadMods());
    }
    return;
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.mod-delete');
  if (btn) {
    const item = btn.closest('.mod-item');
    if (item) {
      crystalAPI.removeMod(item.dataset.name).then(() => loadMods());
    }
  }
});

async function installMod() {
  const result = await crystalAPI.openModBrowser();
  if (!result.success) {
    showToast('Ошибка: ' + (result.error || 'неизвестная'));
  }
}

let modWebviewInit = false;
let modBrowserResizeObserver = null;

function updateWebviewZoom() {
  const webview = document.getElementById('modWebview');
  if (!webview || !webview.src) return;
  const w = webview.offsetWidth;
  if (w > 0) {
    let zoom = w / 1200;
    zoom = Math.max(0.4, Math.min(1, zoom));
    webview.setZoomFactor(zoom);
  }
}

function initModWebview() {
  const webview = document.getElementById('modWebview');
  const container = document.getElementById('modBrowserContainer');
  if (!webview || modWebviewInit) return;
  modWebviewInit = true;

  if (container && !modBrowserResizeObserver) {
    modBrowserResizeObserver = new ResizeObserver(() => updateWebviewZoom());
    modBrowserResizeObserver.observe(container);
  }

  webview.addEventListener('did-finish-load', () => {
    updateWebviewZoom();
    webview.insertCSS(`
      .header, .menu_main, .sidebar, .footer,
      .box.widget,
      [id^="yandex_rtb"], [class*="yandex"],
      [style*="text-align:center"],
      .profile-bar, [class*="branding"],
      .post__creator { display: none !important; }
      .content.row { display: flex !important; flex-wrap: nowrap !important; }
      .page.col-md-8 { width: 100% !important; flex: 1 1 100% !important; max-width: 100% !important; margin: 0 !important; padding: 4px !important; }
      .box.box_grass.post { margin-bottom: 3px !important; }
      .box__body { padding: 4px !important; }
      .box__heading { padding: 4px 8px !important; }
      body { background: #1a1a2e !important; color: #e0e0e0 !important; }
      .box { background: #16213e !important; border-color: #0f3460 !important; border-radius: 6px !important; }
      .box__heading { background: #0f3460 !important; border-radius: 6px 6px 0 0 !important; }
      .box__title a { color: #55ffff !important; }
      .info, .info__item { color: #a0a0b0 !important; font-size: 11px !important; }
      a { color: #55ffff !important; }
      .box__title { font-size: 14px !important; }
      .post__cover { float: left !important; margin-right: 10px !important; }
      .post__cover img { max-width: 120px !important; max-height: 120px !important; }
    `);
    webview.executeJavaScript(`
      document.addEventListener('click', function(e) {
        var link = e.target.closest('a[href*=".jar"], a[href*="/download"], a[href*="/file/"], a[href*="/get/"]');
        if (link) {
          e.preventDefault();
          e.stopPropagation();
          document.title = 'DOWNLOAD::' + link.href;
          link.innerHTML += ' \\u2713';
          link.style.color = '#55ff55';
        }
      }, true);
    `);
  });

  webview.addEventListener('page-title-updated', (e) => {
    if (e.title.startsWith('DOWNLOAD::')) {
      const url = e.title.replace('DOWNLOAD::', '');
      crystalAPI.downloadMod(url).then(result => {
        if (result.success) {
          showToast('Скачан: ' + result.name);
          loadMods();
        }
      });
    }
  });
}

function showModBrowser(url) {
  const container = document.getElementById('modBrowserContainer');
  const list = document.getElementById('modsList');
  const header = document.getElementById('modsListHeader');
  const section = document.querySelector('.mods-section');
  const webview = document.getElementById('modWebview');
  const tab = document.getElementById('tab-mods');
  if (container && webview) {
    if (section) section.style.display = 'none';
    list.style.display = 'none';
    header.style.display = 'none';
    container.classList.add('visible');
    if (tab) tab.classList.add('mods-browser-open');
    initModWebview();
    if (webview.src !== url) {
      webview.src = url;
    }
  }
}

function webviewGoBack() {
  const wv = document.getElementById('modWebview');
  if (wv && wv.canGoBack()) wv.goBack();
}

function webviewGoForward() {
  const wv = document.getElementById('modWebview');
  if (wv && wv.canGoForward()) wv.goForward();
}

function closeModBrowser() {
  const container = document.getElementById('modBrowserContainer');
  const list = document.getElementById('modsList');
  const header = document.getElementById('modsListHeader');
  const section = document.querySelector('.mods-section');
  const tab = document.getElementById('tab-mods');
  if (container) {
    container.classList.remove('visible');
    if (tab) tab.classList.remove('mods-browser-open');
    list.style.display = '';
    header.style.display = '';
    if (section) section.style.display = '';
    loadMods();
  }
}

async function installModFile() {
  const result = await crystalAPI.installMod();
  if (result.success) {
    showToast(`Установлено модов: ${result.count}`);
    loadMods();
  } else if (!result.canceled) {
    showToast('Ошибка: ' + (result.error || 'неизвестная'));
  }
}

async function importModpack() {
  const result = await crystalAPI.importModpack();
  if (result.success) {
    showToast('Модпак импортирован');
    loadModpacks();
    document.getElementById('modpackSelect').value = result.packId;
    onModpackChange();
  } else if (!result.canceled) {
    showToast('Ошибка импорта: ' + (result.error || 'неизвестная'));
  }
}

async function loadModpacks() {
  const select = document.getElementById('modpackSelect');
  try {
    const packs = await crystalAPI.listModpacks();
    const current = select.value;
    select.innerHTML = '<option value="">Без модпака</option>';
    for (const p of packs) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.modCount} модов)`;
      select.appendChild(opt);
    }
    if (current && [...select.options].some(o => o.value === current)) select.value = current;
  } catch {}
}

async function onModpackChange() {
  const packId = document.getElementById('modpackSelect').value;
  if (!packId) {
    const result = await crystalAPI.clearMods();
    if (result.success) {
      localStorage.removeItem('active-modpack');
      showToast(`Моды очищены (удалено ${result.count})`);
      loadMods();
    } else {
      showToast('Ошибка: ' + (result.error || 'неизвестная'));
    }
    return;
  }
  const result = await crystalAPI.applyModpack(packId);
  if (result.success) {
    localStorage.setItem('active-modpack', packId);
    showToast(`Модпак "${packId}" применён (${result.count} модов)`);
    loadMods();
  } else {
    showToast('Ошибка: ' + (result.error || 'неизвестная'));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('welcome-dismissed')) {
    document.getElementById('welcomeOverlay').classList.add('hidden');
  }
  checkJavaStatus();
  refreshVersions();
  loadModpacks();
  document.getElementById('versionSelect')?.addEventListener('change', onVersionChange);
  document.getElementById('tab-mods')?.addEventListener('tab-show', loadMods);
  document.getElementById('installModBtn')?.addEventListener('click', installMod);
  startStatusPolling();

  const savedRam = localStorage.getItem('saved-ram');
  if (savedRam) {
    const btn = document.querySelector(`.ram-btn[data-ram="${savedRam}"]`);
    if (btn) {
      document.querySelectorAll('.ram-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }
  const savedUsername = localStorage.getItem('saved-username');
  if (savedUsername) {
    document.getElementById('usernameInput').value = savedUsername;
    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = savedUsername;
  }

  const activePack = localStorage.getItem('active-modpack');
  if (activePack) {
    document.getElementById('modpackSelect').value = activePack;
  }

  crystalAPI.onModInstalled((name) => {
    showToast(`Мод установлен: ${name}`);
    loadMods();
  });
  crystalAPI.onShowModBrowser((url) => {
    showModBrowser(url);
  });
});

// Listen for tab changes
const origNav = document.querySelector('.sidebar-nav');
if (origNav) {
  origNav.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (item) {
      if (item.dataset.tab !== 'mods') {
        closeModBrowser();
      } else {
        setTimeout(loadMods, 50);
      }
    }
  });
}
