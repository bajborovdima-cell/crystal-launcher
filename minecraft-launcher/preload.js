const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crystalAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  authWithGoogle: () => ipcRenderer.invoke('auth-google'),

  launchGame: (data) => ipcRenderer.invoke('launch-game', data),
  fetchVersions: () => ipcRenderer.invoke('fetch-versions'),
  getMinecraftStatus: (version) => ipcRenderer.invoke('get-minecraft-status', version),
  getJavaPath: () => ipcRenderer.invoke('get-java-path'),
  checkModloaderAvailability: (data) => ipcRenderer.invoke('check-modloader-availability', data),
  listMods: () => ipcRenderer.invoke('list-mods'),
  toggleMod: (name) => ipcRenderer.invoke('toggle-mod', name),
  removeMod: (name) => ipcRenderer.invoke('remove-mod', name),
  listModpacks: () => ipcRenderer.invoke('list-modpacks'),
  importModpack: () => ipcRenderer.invoke('import-modpack'),
  applyModpack: (id) => ipcRenderer.invoke('apply-modpack', id),
  installMod: () => ipcRenderer.invoke('install-mod'),
  openModBrowser: () => ipcRenderer.invoke('open-mod-browser'),
  clearMods: () => ipcRenderer.invoke('clear-mods'),
  downloadMod: (url) => ipcRenderer.invoke('download-mod', url),

  openGameFolder: () => ipcRenderer.invoke('open-game-folder'),

  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, msg) => cb(msg)),
  onLaunchLog: (cb) => ipcRenderer.on('launch-log', (_, msg) => cb(msg)),
  onLaunchError: (cb) => ipcRenderer.on('launch-error', (_, msg) => cb(msg)),
  onVersionStatusUpdated: (cb) => ipcRenderer.on('version-status-updated', (_, v) => cb(v)),
  onGameStatus: (cb) => ipcRenderer.on('game-status', (_, status) => cb(status)),
  onModInstalled: (cb) => ipcRenderer.on('mod-installed', (_, name) => cb(name)),
  onShowModBrowser: (cb) => ipcRenderer.on('show-mod-browser', (_, url) => cb(url)),
});
