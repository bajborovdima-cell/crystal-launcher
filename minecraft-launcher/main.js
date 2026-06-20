const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

let mainWindow;
function sendToUI(channel, ...args) {
  try {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    // Дублируем launch-log в файл
    if (channel === 'launch-log' || channel === 'launch-error') {
      try {
        const logPath = path.join(MC_DIR, 'launcher.log');
        fs.appendFileSync(logPath, `[${new Date().toLocaleTimeString('ru-RU')}] ${msg}\n`);
      } catch {}
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
  } catch {}
}

const MC_DIR = path.join(app.getPath('appData'), '.crystal-launcher');
const ASSETS_DIR = path.join(MC_DIR, 'assets');
const LIBRARIES_DIR = path.join(MC_DIR, 'libraries');
const NATIVES_DIR = path.join(MC_DIR, 'natives');
const VERSIONS_ROOT = path.join(MC_DIR, 'versions');
const MODS_DIR = path.join(MC_DIR, 'game', 'mods');
const MODPACKS_DIR = path.join(MC_DIR, 'modpacks');


function ensureDirs() {
  [MC_DIR, ASSETS_DIR, LIBRARIES_DIR, NATIVES_DIR, VERSIONS_ROOT, path.join(MC_DIR, 'game'), MODS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function downloadFile(url, dest, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, {
      headers: { 'User-Agent': 'CrystalLauncher/1.0' },
      timeout: timeoutMs
    }, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', err => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(new Error(`Timeout: ${url}`));
    });
  });
}

async function downloadFileIfMissing(url, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dest)) {
    await downloadFile(url, dest);
    return true;
  }
  return false;
}

async function fetch(url, raw) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CrystalLauncher/1.0' }, timeout: 15000 }, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const loc = res.headers.location;
        const redirectUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
        return fetch(redirectUrl, raw).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
        else if (raw) resolve(data);
        else try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchVersionMeta(version) {
  const manifest = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  const entry = manifest.versions.find(v => v.id === version);
  if (!entry) throw new Error(`Версия ${version} не найдена`);
  const meta = await fetch(entry.url);
  return meta;
}

async function prepareVersion(version) {
  const vDir = path.join(VERSIONS_ROOT, version);
  if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });

  sendToUI('download-progress', `Загрузка метаданных ${version}...`);
  const versionData = await fetchVersionMeta(version);

  const jarPath = path.join(vDir, `${version}.jar`);
  const jsonPath = path.join(vDir, `${version}.json`);
  const clientDownload = versionData.downloads.client;

  // Проверка SHA1 — если файл битый, удаляем для перезагрузки
  if (fs.existsSync(jarPath) && clientDownload.sha1) {
    try {
      const actualHash = crypto.createHash('sha1').update(fs.readFileSync(jarPath)).digest('hex');
      if (actualHash !== clientDownload.sha1) {
        fs.unlinkSync(jarPath);
        sendToUI('launch-log', `${version}.jar: SHA1 mismatch, перезагрузка`);
      }
    } catch (e) {
      fs.unlinkSync(jarPath);
      sendToUI('launch-log', `${version}.jar: ошибка чтения, перезагрузка`);
    }
  }

  await downloadFileIfMissing(clientDownload.url, jarPath);
  if (!fs.existsSync(jsonPath)) fs.writeFileSync(jsonPath, JSON.stringify(versionData));

  const libs = [];
  for (const lib of versionData.libraries) {
    if (lib.downloads?.artifact) libs.push({ url: lib.downloads.artifact.url, path: path.join(LIBRARIES_DIR, lib.downloads.artifact.path) });
    if (lib.downloads?.classifiers) {
      for (const c of Object.values(lib.downloads.classifiers)) libs.push({ url: c.url, path: path.join(LIBRARIES_DIR, c.path) });
    }
  }

  const missing = libs.filter(l => !fs.existsSync(l.path));
  if (missing.length > 0) {
    sendToUI('download-progress', `Библиотеки (${missing.length})...`);
    for (let i = 0; i < missing.length; i += 8) {
      await Promise.all(missing.slice(i, i + 8).map(l => downloadFileIfMissing(l.url, l.path)));
    }
  }

  await downloadAssetsInBackground(versionData);
  return versionData;
}

async function downloadAssetsInBackground(versionData) {
  try {
    const index = versionData.assetIndex;
    const indexPath = path.join(ASSETS_DIR, 'indexes', `${index.id}.json`);
    await downloadFileIfMissing(index.url, indexPath);

    const assets = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entries = Object.entries(assets.objects || {});
    let queue = entries.filter(([, d]) => !fs.existsSync(path.join(ASSETS_DIR, 'objects', d.hash.slice(0, 2), d.hash)));
    if (queue.length === 0) return;

    sendToUI('download-progress', `Ассеты (${queue.length})...`);
    for (let i = 0; i < queue.length; i += 16) {
      await Promise.all(queue.slice(i, i + 16).map(async ([, d]) => {
        const subdir = d.hash.slice(0, 2);
        const assetPath = path.join(ASSETS_DIR, 'objects', subdir, d.hash);
        if (!fs.existsSync(path.dirname(assetPath))) fs.mkdirSync(path.dirname(assetPath), { recursive: true });
        await downloadFile(`https://resources.download.minecraft.net/${subdir}/${d.hash}`, assetPath);
      }));
    }
    sendToUI('download-progress', `Ассеты загружены (${queue.length})`);
  } catch (e) {
    sendToUI('download-progress', `Ассеты: ${e.message} (пропущено)`);
  }
}

function getJavaBinName() {
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

async function getJavaPath(version) {
  const verNum = version ? parseVersion(version) : null;
  const minJava = getMinJavaVersion(verNum);
  const javaBin = getJavaBinName();

  const allJavas = new Map();

  // Кроссплатформенный рекурсивный поиск Java
  const searchDirs = [];
  if (process.platform === 'win32') {
    searchDirs.push(
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Amazon Corretto') : null
    );
  } else if (process.platform === 'darwin') {
    searchDirs.push('/Library/Java/JavaVirtualMachines');
    searchDirs.push('/System/Library/Java/JavaVirtualMachines');
  } else {
    searchDirs.push('/usr/lib/jvm');
    searchDirs.push('/usr/java');
    searchDirs.push('/opt/java');
  }
  if (process.env.JAVA_HOME) searchDirs.push(process.env.JAVA_HOME);
  const uniqueDirs = [...new Set(searchDirs.filter(Boolean))];

  function findJavaInDir(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir);
      for (const e of entries) {
        const full = path.join(dir, e);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            const binPath = path.join(full, 'bin', javaBin);
            if (fs.existsSync(binPath)) {
              if (!allJavas.has(binPath)) allJavas.set(binPath, null);
            } else {
              findJavaInDir(full);
            }
          }
        } catch {}
      }
    } catch {}
  }
  for (const d of uniqueDirs) findJavaInDir(d);

  // Поиск через PATH
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execSync(`${whichCmd} ${javaBin}`, { encoding: 'utf-8' }).trim();
    for (const line of out.split('\n').map(l => l.trim()).filter(Boolean)) {
      const p = path.resolve(line);
      if (!allJavas.has(p) && fs.existsSync(p)) allJavas.set(p, null);
    }
  } catch {}

  // Получаем версии для всех найденных
  for (const [p] of allJavas) {
    const v = await getJavaVersionFromPath(p);
    if (v) allJavas.set(p, v);
  }

  // Для старых версий (<= 1.16) prefer Java 8-16
  if (verNum !== null && verNum < 17) {
    let best = null;
    for (const [p, v] of allJavas) {
      if (v >= 8 && v <= 16 && (!best || v < allJavas.get(best) || allJavas.get(best) > 16)) {
        best = p;
      }
    }
    if (best) return best;
  }

  // Для современных ищем Java >= minJava, выбираем самую новую
  let best = null;
  let bestVer = 0;
  for (const [p, v] of allJavas) {
    if (v >= minJava && v > bestVer) {
      best = p;
      bestVer = v;
    }
  }
  if (best) return best;

  // Ничего не найдено — скачиваем нужную версию Java через API adoptium
  sendToUI('launch-log', `Java ${minJava}+ не найдена. Получаю ссылку...`);
  const javaDir = path.join(MC_DIR, 'runtime', `java${minJava}`);
  try {
    // Получаем latest релиз через API
    const adoptOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    const apiUrl = `https://api.adoptium.net/v3/assets/latest/${minJava}/hotspot?architecture=x64&os=${adoptOs}&image_type=jdk`;
    const apiResp = await fetch(apiUrl);
    if (apiResp && apiResp.length > 0) {
      const rel = apiResp[0];
      const pkg = rel.binary?.package;
      if (pkg?.link) {
        sendToUI('launch-log', `Скачиваю ${pkg.name}...`);
        const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
        const archivePath = path.join(os.tmpdir(), `java${minJava}.${ext}`);
        await downloadFile(pkg.link, archivePath, 120000);
        if (process.platform === 'win32') {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(archivePath);
          zip.extractAllTo(javaDir, true);
        } else {
          const { execSync } = require('child_process');
          fs.mkdirSync(javaDir, { recursive: true });
          execSync(`tar -xzf "${archivePath}" -C "${javaDir}"`, { stdio: 'ignore' });
        }
        const entries = fs.readdirSync(javaDir);
        const sub = entries.find(e => fs.existsSync(path.join(javaDir, e, 'bin', getJavaBinName())));
        if (sub) return path.join(javaDir, sub, 'bin', getJavaBinName());
      }
    }
  } catch (e) {
    sendToUI('launch-log', `Не удалось скачать Java: ${e.message}`);
  }
  sendToUI('launch-log', `Установите Java ${minJava}+ вручную: https://adoptium.net/temurin/releases/?version=${minJava}`);
  return 'java';
}

function getMinJavaVersion(verNum) {
  if (verNum === null || verNum === undefined) return 21;
  if (verNum >= 26) return 25; // Minecraft 26+ (класс файл 69) требует Java 25+
  if (verNum >= 25) return 21; // 1.20.5+ требует Java 21+
  if (verNum >= 18) return 17; // 1.18+ требует Java 17+
  if (verNum === 17) return 16;
  return 8;
}

async function getJavaVersionFromPath(javaPath) {
  try {
    const out = execSync(`"${javaPath}" -version 2>&1`, { encoding: 'utf-8' });
    const m = out.match(/version\s+"(\d+)/);
    if (m) {
      const v = parseInt(m[1]);
      return v === 1 ? 8 : v;
    }
  } catch {}
  return null;
}



async function getJavaMajorVersion(version) {
  try {
    const out = execSync('"'+await getJavaPath(version)+'" -version 2>&1', { encoding: 'utf-8' });
    const m = out.match(/version\s+\"(\d+)/);
    if (m) {
      const v = parseInt(m[1]);
      if (v === 1) return 8;
      return v;
    }
  } catch {}
  return 0;
}

function getJavaCompatArgs(javaMajor) {
  if (javaMajor < 17) return [];
  const args = [
    '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
    '--add-opens', 'java.base/java.util=ALL-UNNAMED',
    '--add-opens', 'java.base/java.io=ALL-UNNAMED',
    '--add-opens', 'java.base/java.net=ALL-UNNAMED',
    '--add-opens', 'java.base/java.nio=ALL-UNNAMED',
    '--add-opens', 'java.base/sun.security.util=ALL-UNNAMED',
    '--add-opens', 'java.base/sun.reflect.generics.reflectiveObjects=ALL-UNNAMED',
    '--add-exports', 'jdk.unsupported/sun.misc=ALL-UNNAMED',
  ];
  if (javaMajor >= 22) {
    args.push('--enable-native-access', 'ALL-UNNAMED');
  }
  return args;
}

function getOS() {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'osx';
  return 'linux';
}

function isLibAllowed(lib) {
  if (!lib.rules || lib.rules.length === 0) return true;
  const osName = getOS();
  let allowed = false;
  for (const rule of lib.rules) {
    let match = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== osName) match = false;
      if (rule.os.arch) {
        let arch = process.arch;
        if (arch === 'ia32') arch = 'x86';
        else if (arch === 'x64') arch = 'x64';
        if (arch !== rule.os.arch) match = false;
      }
      if (rule.os.version && !new RegExp(rule.os.version).test(os.release())) match = false;
    }
    if (rule.features) {
      for (const val of Object.values(rule.features)) {
        if (val) match = false;
      }
    }
    if (match) allowed = rule.action === 'allow';
  }
  return allowed;
}

function extractNatives(versionData, nativesDir) {
  if (!versionData.libraries) return;
  const os = getOS();

  for (const lib of versionData.libraries) {
    if (!isLibAllowed(lib)) continue;
    if (!lib.natives || !lib.natives[os]) continue;
    const classifier = lib.natives[os];
    if (!lib.downloads?.classifiers?.[classifier]) continue;

    const jarInfo = lib.downloads.classifiers[classifier];
    const jarPath = path.join(LIBRARIES_DIR, jarInfo.path);
    if (!fs.existsSync(jarPath)) continue;

    const extractExcludes = (lib.extract?.exclude || []).map(e => e.endsWith('/') ? e : e + '/');

    try {
      const zip = new AdmZip(jarPath);
      const entries = zip.getEntries();
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const name = entry.entryName;
        const excluded = extractExcludes.some(ex => name.startsWith(ex));
        if (excluded) continue;
        const dest = path.join(nativesDir, path.basename(name));
        if (!fs.existsSync(dest)) {
          fs.writeFileSync(dest, entry.getData());
        }
      }
    } catch (e) {
      sendToUI('launch-log', `Не удалось извлечь нативы: ${e.message}`);
    }
  }
}

function mavenToPath(name) {
  const parts = name.split(':');
  const group = parts[0].replace(/\./g, '/');
  const artifact = parts[1];
  let version = parts[2];
  const classifier = parts.length > 3 ? parts[3] : null;
  let ext = (parts.length > 4 && parts[4]) ? parts[4] : 'jar';
  // Обработка @ext в версии (например, 1.20.1-20230612.114412@zip)
  const atIdx = version.indexOf('@');
  if (atIdx >= 0) { ext = version.slice(atIdx + 1); version = version.slice(0, atIdx); }
  const filename = classifier ? `${artifact}-${version}-${classifier}.${ext}` : `${artifact}-${version}.${ext}`;
  return `${group}/${artifact}/${version}/${filename}`;
}

async function resolveFabric(version) {
  const meta = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}`);
  if (!Array.isArray(meta) || meta.length === 0) throw new Error(`Fabric не поддерживается для ${version}`);
  const latest = meta[0];
  const profile = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}/${latest.loader.version}/profile/json`);
  return profile;
}

async function runNeoForgeProcessors(mcJar, installerPath) {
  const zip = new AdmZip(installerPath);
  const profile = JSON.parse(zip.readAsText('install_profile.json'));
  const data = profile.data || {};
  const processors = (profile.processors || []).filter(p => !p.sides || p.sides.includes('client'));
  if (processors.length === 0) return;
  const ROOT = MC_DIR;
  const INSTALLER = installerPath;
  const MINECRAFT_JAR = mcJar;
  const tmpDir = path.join(os.tmpdir(), 'forge-process-' + Date.now());
  // Скачиваем библиотеки из install_profile.json (installertools и т.д.)
  const instLibs = profile.libraries || [];
  const procLibPaths = [];
  for (const lib of instLibs) {
    if (!lib.name) continue;
    const mavenPath = mavenToPath(lib.name);
    const baseUrl = lib.url || 'https://maven.neoforged.net/releases/';
    const url = baseUrl.replace(/\/?$/, '/') + mavenPath;
    const libPath = path.join(LIBRARIES_DIR, mavenPath);
    try { await downloadFileIfMissing(url, libPath); } catch {}
    if (fs.existsSync(libPath)) procLibPaths.push(libPath);
  }
  // Скачиваем Maven-артефакты из данных (например, mcp_config)
  const dataRepos = ['https://libraries.minecraft.net/', 'https://maven.neoforged.net/releases/', 'https://maven.minecraft.net/'];
  for (const [key, dval] of Object.entries(data)) {
    const raw = (typeof dval === 'string') ? dval : (dval.client || dval.server || '');
    if (!raw.startsWith('[') || !raw.endsWith(']')) continue;
    const artifact = raw.slice(1, -1);
    const mavenPath = mavenToPath(artifact);
    const libPath = path.join(LIBRARIES_DIR, mavenPath);
    sendToUI('launch-log', `NeoForge: загрузка данных ${key}: ${mavenPath}`);
    if (!fs.existsSync(libPath)) {
      for (const repo of dataRepos) {
        try { await downloadFileIfMissing(repo.replace(/\/?$/, '/') + mavenPath, libPath); sendToUI('launch-log', `NeoForge: скачан из ${repo}`); break; } catch (e) { sendToUI('launch-log', `NeoForge: ${repo} — ${e.message}`); }
      }
    } else {
      sendToUI('launch-log', `NeoForge: ${key} уже есть`);
    }
    if (fs.existsSync(libPath)) procLibPaths.push(libPath);
  }
  sendToUI('launch-log', `NeoForge: запуск ${processors.length} процессоров...`);
  // Функция разрешения плейсхолдеров
  const SIDE = 'client';
  function resolve(val) {
    if (typeof val !== 'string') return val;
    let result = val
      .replace(/{MINECRAFT_JAR}/g, MINECRAFT_JAR)
      .replace(/{INSTALLER}/g, INSTALLER)
      .replace(/{ROOT}/g, ROOT);
    for (const [key, dval] of Object.entries(data)) {
      const keyRe = new RegExp('\\{' + key + '\\}', 'g');
      const raw = (typeof dval === 'string') ? dval : (dval[SIDE] || dval.server || '');
      if (raw.startsWith('/')) {
        const ep = raw.replace(/^\//, '');
        const entry = zip.getEntry(ep);
        if (entry) {
          const outPath = path.join(tmpDir, ep.replace(/[\\/]/g, '_'));
          if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, entry.getData());
          result = result.replace(keyRe, outPath);
        }
      } else if (raw.startsWith('[') && raw.endsWith(']')) {
        const artifact = raw.slice(1, -1);
        const parts = artifact.split(':');
        if (parts.length >= 3) {
          let ver = parts[2];
          let ext = parts.length > 4 ? parts[4] : 'jar';
          const atIdx = ver.indexOf('@');
          if (atIdx >= 0) { ext = ver.slice(atIdx + 1); ver = ver.slice(0, atIdx); }
          const filename = parts[1] + '-' + ver + (parts.length >= 4 ? '-' + parts[3] : '') + '.' + ext;
          const mavenPath = parts[0].replace(/\./g, '/') + '/' + parts[1] + '/' + ver + '/' + filename;
          result = result.replace(keyRe, path.join(LIBRARIES_DIR, mavenPath));
        }
      } else {
        result = result.replace(keyRe, raw);
      }
    }
    return result;
  }
  const mcVer = path.basename(mcJar, '.jar');
  const javaPath = await getJavaPath(mcVer);
  for (const proc of processors) {
    const procMaven = proc.jar;
    if (!procMaven) continue;
    const procMavenPath = mavenToPath(procMaven);
    const procJar = path.join(LIBRARIES_DIR, procMavenPath);
    if (!fs.existsSync(procJar)) {
      sendToUI('launch-log', `NeoForge: процессор ${procMaven} — JAR не найден`);
      continue;
    }
    let procClass = proc.class;
    if (!procClass) {
      try {
        const pz = new AdmZip(procJar);
        const mf = pz.getEntry('META-INF/MANIFEST.MF');
        if (mf) {
          const manifest = mf.getData().toString('utf8');
          const match = manifest.match(/^Main-Class:\s*(\S+)/m);
          if (match) procClass = match[1];
        }
      } catch {}
    }
    if (!procClass) { sendToUI('launch-log', `NeoForge: процессор ${procMaven} — Main-Class не найден`); continue; }
    // Убираем --no-mod-manifest, иначе patched JAR не содержит Minecraft-Dists в manifest
    const rawArgs = (proc.args || []).filter(a => a !== '--no-mod-manifest');
    const resolvedArgs = rawArgs.map(a => resolve(a));
    const procCp = procJar + path.delimiter + procLibPaths.join(path.delimiter);
    sendToUI('launch-log', `NeoForge: процессор ${procClass}...`);
    sendToUI('launch-log', `NeoForge: args: [${resolvedArgs.slice(0, 10).join(', ')}]`);
    const result = spawnSync(javaPath, ['-cp', procCp, procClass, ...resolvedArgs], { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
    if (result.error) {
      const msg = `NeoForge: процессор ${procClass} ошибка: ${result.error.message}`;
      sendToUI('launch-log', msg);
      sendToUI('launch-error', msg);
      return;
    }
    if (result.status !== 0) {
      const err = (result.stderr || '').toString().trim();
      const msg = `NeoForge: процессор ${procClass} завершился с кодом ${result.status}${err ? ': ' + err : ''}`;
      sendToUI('launch-log', msg);
      // Определяем причину: checksum mismatch = Mojang перевыпустил jar
      if (err.includes('Patch expected') && err.includes('checksum')) {
        const verMsg = `Mojang перевыпустил jar Minecraft — NeoForge не обновлён под новую версию. Попробуйте другую версию Minecraft или дождитесь обновления NeoForge.`;
        sendToUI('launch-error', verMsg);
      } else {
        sendToUI('launch-error', msg);
      }
      // Удаляем битый output-файл (частичная запись)
      try {
        const outIdx = (proc.args || []).indexOf('--output');
        if (outIdx >= 0 && outIdx + 1 < (proc.args || []).length) {
          const outPath = resolve(proc.args[outIdx + 1]);
          if (outPath && fs.existsSync(outPath)) {
            fs.unlinkSync(outPath);
            sendToUI('launch-log', `NeoForge: удалён битый output ${path.basename(outPath)}`);
          }
        }
      } catch {}
      return;
    }
    sendToUI('launch-log', `NeoForge: процессор ${procClass} завершён (код 0)`);
  }
  // Пост-обработка: проверяем Minecraft-Dists в manifest patched jar
  try {
    const patchedFiles = new Set();
    // Определяем путь через {PATCHED}
    const patchPath = resolve('{PATCHED}');
    if (patchPath && typeof patchPath === 'string' && fs.existsSync(patchPath)) patchedFiles.add(patchPath);
    // Fallback: minecraft-client-patched директория
    const patchDir = path.join(LIBRARIES_DIR, 'net', 'neoforged', 'minecraft-client-patched');
    if (fs.existsSync(patchDir)) {
      for (const entry of fs.readdirSync(patchDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        for (const f of fs.readdirSync(path.join(patchDir, entry.name)).filter(f => f.endsWith('.jar'))) {
          patchedFiles.add(path.join(patchDir, entry.name, f));
        }
      }
    }
    for (const jarPath of patchedFiles) {
      try {
        const jz = new AdmZip(jarPath);
        const mfEntry = jz.getEntry('META-INF/MANIFEST.MF');
        if (mfEntry) {
          const manifest = mfEntry.getData().toString('utf8');
          if (!manifest.includes('Minecraft-Dists')) {
            sendToUI('launch-log', `NeoForge: Minecraft-Dists отсутствует в ${path.basename(jarPath)}, добавляю...`);
            // Вставляем в main-секцию (до первой пустой строки — разделителя individual entries)
            const sep = manifest.indexOf('\n\n');
            const mainSection = sep >= 0 ? manifest.substring(0, sep) : manifest.trim();
            const restSection = sep >= 0 ? manifest.substring(sep) : '';
            const newManifest = mainSection + '\nMinecraft-Dists: client\n' + restSection.replace(/^\n+/, '') + '\n';
            jz.deleteFile('META-INF/MANIFEST.MF');
            jz.addFile('META-INF/MANIFEST.MF', Buffer.from(newManifest));
            fs.writeFileSync(jarPath + '.tmp', jz.toBuffer());
            fs.renameSync(jarPath + '.tmp', jarPath);
            sendToUI('launch-log', `NeoForge: Minecraft-Dists добавлен в ${path.basename(jarPath)}`);
          } else {
            // Проверка: действительно ли атрибут в main-секции, а не в individual entries
            const sep = manifest.indexOf('\n\n');
            const mainSection = sep >= 0 ? manifest.substring(0, sep) : manifest;
            if (!mainSection.includes('Minecraft-Dists')) {
              sendToUI('launch-log', `NeoForge: Minecraft-Dists есть, но не в main-секции ${path.basename(jarPath)}, перемещаю...`);
              const restSection = sep >= 0 ? manifest.substring(sep) : '';
              const newManifest = mainSection + '\nMinecraft-Dists: client\n' + restSection.replace(/^\n+/, '') + '\n';
              jz.deleteFile('META-INF/MANIFEST.MF');
              jz.addFile('META-INF/MANIFEST.MF', Buffer.from(newManifest));
              fs.writeFileSync(jarPath + '.tmp', jz.toBuffer());
              fs.renameSync(jarPath + '.tmp', jarPath);
              sendToUI('launch-log', `NeoForge: Minecraft-Dists перемещён в main-секцию в ${path.basename(jarPath)}`);
            } else {
              sendToUI('launch-log', `NeoForge: Minecraft-Dists в main-секции ${path.basename(jarPath)}, OK`);
            }
          }
        }
      } catch (e) {
        sendToUI('launch-log', `NeoForge: не удалось проверить manifest ${path.basename(jarPath)}: ${e.message}`);
      }
    }
  } catch (e) {
    sendToUI('launch-log', `NeoForge: пост-обработка manifest: ${e.message}`);
  }
}

async function downloadModloaderLibs(libs, repos) {
  const dl = [];
  for (const lib of libs) {
    const mavenPath = mavenToPath(lib.name);
    const libPath = path.join(LIBRARIES_DIR, mavenPath);
    const urls = [];
    if (lib.url) {
      urls.push(lib.url.replace(/\/?$/, '/') + mavenPath);
    }
    if (repos) {
      for (const r of repos) urls.push(r.replace(/\/?$/, '/') + mavenPath);
    }
    if (urls.length === 0) urls.push('https://libraries.minecraft.net/' + mavenPath);
    dl.push({ urls, path: libPath });
  }
  const results = [];
  const missing = dl.filter(l => !fs.existsSync(l.path));
  if (missing.length > 0) {
    sendToUI('download-progress', `Загрузка библиотек ${missing.length}...`);
    for (let i = 0; i < missing.length; i += 8) {
      const batch = missing.slice(i, i + 8).map(async l => {
        for (const url of l.urls) {
          try { await downloadFileIfMissing(url, l.path); return true; } catch {}
        }
        return false;
      });
      await Promise.all(batch);
    }
  }
  for (const l of dl) {
    if (fs.existsSync(l.path)) results.push(l.path);
  }
  return results;
}

async function resolveForge(version) {
  const promosRaw = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
  const promos = promosRaw.promos || {};
  const key = Object.keys(promos).find(k => k.startsWith(version + '-') && k.endsWith('-latest'));
  if (!key) throw new Error(`Forge не найден для ${version}`);
  const forgeVer = promos[key];
  const forgeVerStr = `${version}-${forgeVer}`;

  async function tryDownload(pattern) {
    const relPath = pattern;
    const p = path.join(LIBRARIES_DIR, relPath);
    const url = `https://maven.minecraftforge.net/${pattern}`;
    await downloadFileIfMissing(url, p);
    return p;
  }
  const verStr = forgeVerStr;
  const suffixVer = `${forgeVerStr}-${version}`;
  let forgeFullVer = verStr;
  let installerPath;
  try {
    installerPath = await tryDownload(`net/minecraftforge/forge/${verStr}/forge-${verStr}-installer.jar`);
  } catch (e) {
    forgeFullVer = suffixVer;
    installerPath = await tryDownload(`net/minecraftforge/forge/${suffixVer}/forge-${suffixVer}-installer.jar`);
  }

  const zip = new AdmZip(installerPath);
  const profileRaw = zip.readAsText('install_profile.json');
  if (!profileRaw) throw new Error('install_profile.json не найден в установщике Forge');
  const profile = JSON.parse(profileRaw);

  let versionData;
  if (profile.versionInfo && typeof profile.versionInfo === 'object') {
    versionData = profile.versionInfo;
  } else if (profile.profile && typeof profile.profile === 'object') {
    versionData = profile.profile;
  } else if (profile.json || (profile.profile && typeof profile.profile === 'string')) {
    const jsonPath = profile.json || `/version.json`;
    const entry = zip.getEntry(jsonPath.replace(/^\//, ''));
    if (entry) {
      versionData = JSON.parse(entry.getData().toString());
    } else {
      throw new Error('Не удалось найти version.json в установщике Forge');
    }
  } else {
    throw new Error('Неизвестный формат install_profile.json Forge');
  }

  const libs = versionData.libraries || [];
  const mainClass = versionData.mainClass || profile.mainClass || 'net.minecraftforge.fml.loading.FMLClientLaunchProvider';
  let forgeGameArgs = [];
  let forgeJvmArgs = [];
  if (versionData.arguments) {
    if (Array.isArray(versionData.arguments.jvm)) {
      forgeJvmArgs = versionData.arguments.jvm.filter(a => typeof a === 'string');
    }
    if (Array.isArray(versionData.arguments.game)) {
      const raw = versionData.arguments.game.filter(a => typeof a === 'string');
      const launchIdx = raw.indexOf('--launchTarget');
      if (launchIdx >= 0 && launchIdx + 1 < raw.length) {
        forgeGameArgs = ['--launchTarget', raw[launchIdx + 1]];
      }
    }
  }
  if (mainClass === 'cpw.mods.modlauncher.Launcher' || mainClass.includes('fml')) {
    const hasJvmTarget = forgeJvmArgs.some(a => a.includes('modlauncher.launchTarget') || a.includes('launchTarget'));
    if (!hasJvmTarget) {
      forgeJvmArgs.push('-Dmodlauncher.launchTarget=forgeclient');
    }
    if (forgeGameArgs.length === 0) {
      forgeGameArgs = ['--launchTarget', 'forgeclient'];
    }
  }
  let tweakClass = null;
  if (versionData.minecraftArguments && typeof versionData.minecraftArguments === 'string') {
    const m = versionData.minecraftArguments.match(/--tweakClass\s+(\S+)/);
    if (m) tweakClass = m[1];
  }
  if (mainClass === 'net.minecraft.launchwrapper.Launch' || mainClass.includes('LaunchWrapper') || mainClass.includes('launchwrapper')) {
    const hasTweak = forgeGameArgs.some(a => a === '--tweakClass');
    if (!hasTweak) {
      forgeGameArgs.unshift('--tweakClass', tweakClass || 'net.minecraftforge.fml.common.launcher.FMLTweaker');
    }
  }
  return { libraries: libs, mainClass, gameArgs: forgeGameArgs, jvmArgs: forgeJvmArgs, version: forgeFullVer, forgeVer, installerPath, inheritsFrom: versionData.inheritsFrom };
}

async function resolveNeoForge(version) {
  const parts = version.split('.').map(Number);
  let prefix, group, artifact;
  if (parts[0] === 1) {
    // MC 1.20.1 использует net.neoforged:forge — версии в Maven с префиксом 1.20.1-
    if (parts[1] === 20 && parts[2] === 1) {
      prefix = version;
      group = 'net.neoforged';
      artifact = 'forge';
    } else {
      prefix = `${parts[1]}.${parts[2] || 0}`;
      group = 'net.neoforged';
      artifact = 'neoforge';
    }
  } else {
    prefix = `${parts[0]}.${parts[1]}`;
    group = 'net.neoforged';
    artifact = 'neoforge';
  }
  const xmlText = await fetch(`https://maven.neoforged.net/releases/${group.replace(/\./g, '/')}/${artifact}/maven-metadata.xml`, true);
  const versions = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    versions.push(m[1]);
  }
  const matching = versions.filter(v => v.startsWith(prefix)).sort().reverse();
  if (matching.length === 0) throw new Error(`NeoForge не найден для ${version}`);
  const neoVer = matching[0];
  const installerPath = path.join(LIBRARIES_DIR, group.replace(/\./g, path.sep), artifact, neoVer, `${artifact}-${neoVer}-installer.jar`);
  await downloadFileIfMissing(`https://maven.neoforged.net/releases/${group.replace(/\./g, '/')}/${artifact}/${neoVer}/${artifact}-${neoVer}-installer.jar`, installerPath);

  const zip = new AdmZip(installerPath);
  const profileRaw = zip.readAsText('install_profile.json');
  if (!profileRaw) throw new Error('install_profile.json не найден в установщике NeoForge');
  const profile = JSON.parse(profileRaw);

  let versionData;
  if (profile.versionInfo && typeof profile.versionInfo === 'object') {
    versionData = profile.versionInfo;
  } else if (profile.profile && typeof profile.profile === 'object') {
    versionData = profile.profile;
  } else {
    const jsonPath = profile.json || 'version.json';
    const entry = zip.getEntry(jsonPath.replace(/^\//, ''));
    if (entry) versionData = JSON.parse(entry.getData().toString());
    else throw new Error('Не удалось найти version.json в установщике NeoForge');
  }

  const libs = versionData.libraries || [];
  // Извлекаем universal JAR из установщика
  const universalName = `${group}:${artifact}:${neoVer}:universal`;
  const universalPath = path.join(LIBRARIES_DIR, group.replace(/\./g, path.sep), artifact, neoVer, `${artifact}-${neoVer}-universal.jar`);
  if (!fs.existsSync(universalPath)) {
    const uEntry = zip.getEntry(`${artifact}-${neoVer}-universal.jar`);
    if (uEntry) {
      if (!fs.existsSync(path.dirname(universalPath))) fs.mkdirSync(path.dirname(universalPath), { recursive: true });
      fs.writeFileSync(universalPath, uEntry.getData());
    }
  }
  // Production mode: universal jar не добавляем в classpath — он находится через locateProductionMinecraft() при старте
  // Подставляем переменные в jvm/game args
  const libDir = LIBRARIES_DIR.replace(/\\/g, '/');
  const mainClass = versionData.mainClass || profile.mainClass || 'net.neoforged.bootstrap.Launcher';
  let gameArgs = [], jvmArgs = [];
  if (versionData.arguments) {
    if (Array.isArray(versionData.arguments.jvm)) {
      jvmArgs = versionData.arguments.jvm
        .filter(a => typeof a === 'string')
        .map(a => a.replace(/\$\{library_directory\}/g, libDir));
    }
    if (Array.isArray(versionData.arguments.game)) {
      gameArgs = versionData.arguments.game
        .filter(a => typeof a === 'string')
        .map(a => a.replace(/\$\{library_directory\}/g, libDir));
    }
  }
  return { libraries: libs, mainClass, gameArgs, jvmArgs, version: neoVer, installerPath };
}

async function resolveQuilt(version) {
  const meta = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${version}`);
  if (!Array.isArray(meta) || meta.length === 0) throw new Error(`Quilt не поддерживается для ${version}`);
  const latest = meta[0];
  const profile = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${version}/${latest.loader.version}/profile/json`);
  return profile;
}

async function downloadForgeLibs(libs, os, installerPath) {
  const dl = [];
  for (const lib of libs) {
    if (!lib.name) continue;
    if (!isLibAllowed(lib)) continue;
    const isForgeLib = lib.name.includes('forge') || lib.name.includes('minecraftforge');
    if (lib.downloads?.artifact) {
      const p = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
      const url = lib.downloads.artifact.url || (isForgeLib
        ? `https://maven.minecraftforge.net/${lib.downloads.artifact.path}`
        : `https://libraries.minecraft.net/${lib.downloads.artifact.path}`);
      dl.push({ url, path: p });
    } else {
      const mavenPath = mavenToPath(lib.name);
      const p = path.join(LIBRARIES_DIR, mavenPath);
      const url = isForgeLib
        ? `https://maven.minecraftforge.net/${mavenPath}`
        : `https://libraries.minecraft.net/${mavenPath}`;
      dl.push({ url, path: p });
    }
    if (lib.downloads?.classifiers) {
      const nativeClassifier = lib.natives ? lib.natives[os] : null;
      for (const [key, c] of Object.entries(lib.downloads.classifiers)) {
        if (nativeClassifier && key !== nativeClassifier) continue;
        const p = path.join(LIBRARIES_DIR, c.path);
        const url = c.url || `https://libraries.minecraft.net/${c.path}`;
        dl.push({ url, path: p });
      }
    }
  }
  const missing = dl.filter(l => !fs.existsSync(l.path));
  if (missing.length > 0) {
    sendToUI('download-progress', `Загрузка библиотек Forge (${missing.length})...`);
    for (let i = 0; i < missing.length; i += 8) {
      const batch = missing.slice(i, i + 8).map(async l => {
        try { await downloadFileIfMissing(l.url, l.path); } catch {
          const alt = l.url.includes('libraries.minecraft.net')
            ? l.url.replace('libraries.minecraft.net', 'maven.minecraftforge.net')
            : l.url.includes('maven.minecraftforge.net')
              ? l.url.replace('maven.minecraftforge.net', 'libraries.minecraft.net')
              : null;
          if (alt) try { await downloadFileIfMissing(alt, l.path); } catch {}
        }
      });
      await Promise.all(batch);
    }
  }
  // Если после загрузки всё ещё нет forge universal JAR — извлекаем из установщика
  if (installerPath && fs.existsSync(installerPath)) {
    const forgeUniversal = dl.find(l => l.path.includes('forge') && l.path.includes('universal'));
    if (forgeUniversal && !fs.existsSync(forgeUniversal.path)) {
      try {
        const zip = new AdmZip(installerPath);
        const mavenEntry = zip.getEntry(`maven/net/minecraftforge/forge/`);
        // Ищем entry, который соответствует universal.jar
        const entries = zip.getEntries();
        const jarEntry = entries.find(e =>
          e.entryName.endsWith('-universal.jar') && e.entryName.includes('/forge/')
        );
        if (jarEntry) {
          const dir = path.dirname(forgeUniversal.path);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(forgeUniversal.path, jarEntry.getData());
          sendToUI('launch-log', `Forge universal JAR извлечён из установщика: ${forgeUniversal.path}`);
        }
      } catch (e) {
        sendToUI('launch-log', `Не удалось извлечь Forge JAR из установщика: ${e.message}`);
      }
    }
  }
  const results = [];
  for (const l of dl) {
    if (fs.existsSync(l.path)) results.push(l.path);
  }
  return results;
}

async function runForgeProcessors(jarPath, patchedJar, forgeProfile) {
  const zip = new AdmZip(forgeProfile.installerPath);
  const profile = JSON.parse(zip.readAsText('install_profile.json'));
  const data = profile.data || {};
  const processors = profile.processors || [];
  if (processors.length === 0) return false;

  sendToUI('launch-log', `Forge: запуск ${processors.length} процессоров...`);
  const ROOT = MC_DIR;
  const INSTALLER = forgeProfile.installerPath;
  const MINECRAFT_JAR = jarPath;
  const tmpDir = path.join(os.tmpdir(), 'forge-process-' + Date.now());

  // Скачиваем библиотеки процессоров (profile.libraries)
  const instLibs = profile.libraries || [];
  const libPaths = [];
  for (const lib of instLibs) {
    if (!lib.name) continue;
    const mavenPath = mavenToPath(lib.name);
    const baseUrl = lib.url || 'https://maven.minecraftforge.net/';
    const url = baseUrl.endsWith('/') ? baseUrl + mavenPath : baseUrl + '/' + mavenPath;
    const libPath = path.join(LIBRARIES_DIR, mavenPath);
    try {
      await downloadFileIfMissing(url, libPath);
    } catch {}
    if (fs.existsSync(libPath)) libPaths.push(libPath);
  }

  // Добавляем forge universal JAR в classpath (нужен для процессоров)
  const forgeJar = path.join(LIBRARIES_DIR, 'net', 'minecraftforge', 'forge', forgeProfile.version, `forge-${forgeProfile.version}-universal.jar`);
  const allCp = [...libPaths];
  if (fs.existsSync(forgeJar)) allCp.push(forgeJar);

  // Функция разрешения плейсхолдеров
  const SIDE = 'client'; // лаунчер всегда клиентский
  function resolveDataValue(dval) {
    if (typeof dval === 'string') return dval;
    if (dval && typeof dval === 'object') return dval[SIDE] || dval.server || '';
    return '';
  }
  function resolve(val) {
    if (typeof val !== 'string') return val;
    let result = val
      .replace(/{MINECRAFT_JAR}/g, MINECRAFT_JAR)
      .replace(/{INSTALLER}/g, INSTALLER)
      .replace(/{ROOT}/g, ROOT);
    for (const [key, dval] of Object.entries(data)) {
      const keyRe = new RegExp('\\{' + key + '\\}', 'g');
      const resolved = resolveDataValue(dval);
      if (resolved.startsWith('/')) {
        const entryPath = resolved.replace(/^\//, '');
        const entry = zip.getEntry(entryPath);
        if (entry) {
          const outPath = path.join(tmpDir, entryPath.replace(/[\\/]/g, '_'));
          if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, entry.getData());
          result = result.replace(keyRe, outPath);
        }
      } else if (resolved.startsWith('[') && resolved.endsWith(']')) {
        // artifact reference: [group:name:version:classifier] -> maven path
        const artifact = resolved.slice(1, -1);
        const parts = artifact.split(':');
        if (parts.length >= 3) {
          const group = parts[0];
          const name = parts[1];
          const ver = parts[2];
          const classifier = parts.length >= 4 ? '-' + parts[3] : '';
          const mavenPath = group.replace(/\./g, '/') + '/' + name + '/' + ver + '/' + name + '-' + ver + classifier + '.jar';
          const absPath = path.join(LIBRARIES_DIR, mavenPath);
          result = result.replace(keyRe, absPath);
        }
      } else {
        result = result.replace(keyRe, resolved);
      }
    }
    return result;
  }

  // Удаляем старый output перед запуском процессоров
  const patchedPath = resolve('{PATCHED}');
  if (patchedPath && typeof patchedPath === 'string' && fs.existsSync(patchedPath)) {
    fs.unlinkSync(patchedPath);
    sendToUI('launch-log', 'Forge: старый output процессора удалён');
  }

  const javaPath = await getJavaPath(forgeProfile.inheritsFrom || '1.21.1');
  let anyFailure = false;

  for (const proc of processors) {
    // Фильтр по стороне: пропускаем процессоры, чей sides не включает нашу сторону
    const procSides = proc.sides;
    if (procSides && Array.isArray(procSides) && !procSides.includes(SIDE)) {
      continue;
    }

    const procMaven = proc.jar;
    let procClass = proc.class;
    const rawArgs = proc.args || [];

    // Найти JAR процессора
    const procMavenPath = mavenToPath(procMaven);
    const procJar = path.join(LIBRARIES_DIR, procMavenPath);
    if (!fs.existsSync(procJar)) {
      sendToUI('launch-log', `Forge: процессор ${procClass || procMaven} — JAR не найден: ${procJar}, пропуск`);
      continue;
    }

    // Если class не указан, читаем Main-Class из MANIFEST.MF JAR-а
    if (!procClass) {
      try {
        const zip = new AdmZip(procJar);
        const manifestEntry = zip.getEntry('META-INF/MANIFEST.MF');
        if (manifestEntry) {
          const manifest = manifestEntry.getData().toString('utf8');
          const match = manifest.match(/^Main-Class:\s*(\S+)/m);
          if (match) procClass = match[1];
        }
      } catch (e) {
        sendToUI('launch-log', `Forge: не удалось прочитать MANIFEST.MF из ${procMaven}: ${e.message}`);
        continue;
      }
    }

    if (!procClass) {
      sendToUI('launch-log', `Forge: процессор ${procMaven} — не указан class и не найден Main-Class, пропуск`);
      continue;
    }

    const resolvedArgs = rawArgs.map(a => resolve(a));
    const procCp = [...allCp, procJar].join(path.delimiter);

    sendToUI('launch-log', `Forge: процессор ${procClass}...`);
    const result = spawnSync(javaPath, ['-cp', procCp, procClass, ...resolvedArgs], { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
    if (result.error) {
      sendToUI('launch-log', `Forge: процессор ${procClass} ошибка: ${result.error.message}`);
      anyFailure = true;
      continue;
    }
    if (result.status !== 0) {
      const err = (result.stderr || '').toString().trim();
      sendToUI('launch-log', `Forge: процессор ${procClass} завершился с кодом ${result.status}${err ? ': ' + err : ''}`);
      anyFailure = true;
      continue;
    }
    const out = (result.stdout || '').toString().trim();
    if (out) sendToUI('launch-log', `Forge: [${procClass}] ${out}`);
    sendToUI('launch-log', `Forge: процессор ${procClass} завершён (код 0)`);
  }

    // Если какой-то процессор упал — удаляем битый output
    if (anyFailure && patchedPath && fs.existsSync(patchedPath)) {
      fs.unlinkSync(patchedPath);
      sendToUI('launch-log', 'Forge: битый output процессора удалён');
      return false;
    }

    // Ищем созданный PATCHED JAR (patchedPath уже определён выше)
    if (patchedPath && typeof patchedPath === 'string' && fs.existsSync(patchedPath)) {
      if (patchedPath !== patchedJar) {
        fs.copyFileSync(patchedPath, patchedJar);
        sendToUI('launch-log', `Forge: PATCHED JAR скопирован в ${patchedJar}`);
      }
    } else {
      const vDir = path.dirname(patchedJar);
      if (fs.existsSync(vDir)) {
        const files = fs.readdirSync(vDir).filter(f => f.endsWith('-client.jar') && f.includes('forge'));
        for (const f of files) {
          const fp = path.join(vDir, f);
          if (fp !== patchedJar) {
            fs.copyFileSync(fp, patchedJar);
            sendToUI('launch-log', `Forge: найден и скопирован ${f}`);
            break;
          }
        }
      }
    }

    return fs.existsSync(patchedJar);
}

function parseVersion(v) {
  const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const major = parseInt(m[1]);
  if (major >= 26) return 26;
  if (major === 1 && m[2]) return parseInt(m[2]);
  return major;
}

async function launchMinecraft(username, version, modloader, jvmArgs, gameArgs) {
  try {
    const versionData = await prepareVersion(version);
    const javaPath = await getJavaPath(version);
    const javaMajor = await getJavaMajorVersion(version);
    const vDir = path.join(VERSIONS_ROOT, version);
    const nativesDir = path.join(NATIVES_DIR, version);
    if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });
    extractNatives(versionData, nativesDir);

    sendToUI('launch-log', `Java: ${javaPath} (major: ${javaMajor})`);

    // Очистка временных DLL LWJGL (предотвращает краш из-за битых нативных библиотек)
    const lwjglTemp = path.join(os.tmpdir(), 'lwjgldimos');
    if (fs.existsSync(lwjglTemp)) {
      fs.rmSync(lwjglTemp, { recursive: true, force: true });
      sendToUI('launch-log', 'Очищены временные библиотеки LWJGL');
    }

    let mainClass = versionData.mainClass || 'net.minecraft.client.main.Main';
    const vNum = parseVersion(version);
    let mcArgs = [
      '--username', username,
      '--version', version,
      '--gameDir', path.join(MC_DIR, 'game'),
      '--assetsDir', ASSETS_DIR,
      '--assetIndex', versionData.assetIndex.id,
      '--uuid', crypto.randomUUID(),
      '--accessToken', '0',
      '--userType', 'mojang',
      '--versionType', 'release',
      ...((vNum !== null && vNum <= 7) ? ['--userProperties', '{}'] : []),
      ...(gameArgs || [])
    ];

    let cp, extraJvmArgs = [], extraGameArgs = [], forgeProfile = null;
    if (modloader === 'fabric') {
      const profile = await resolveFabric(version);
      sendToUI('launch-log', `Fabric: ${profile.id}`);
      const libPaths = await downloadModloaderLibs(profile.libraries);
      cp = [path.join(vDir, `${version}.jar`)];
      const cpOs = getOS();
      for (const lib of versionData.libraries) {
        if (!isLibAllowed(lib)) continue;
        if (lib.downloads?.artifact) {
          const p = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
          if (fs.existsSync(p)) cp.push(p);
        }
        if (lib.downloads?.classifiers) {
          const nativeClassifier = lib.natives ? lib.natives[cpOs] : null;
          for (const [key, c] of Object.entries(lib.downloads.classifiers)) {
            if (nativeClassifier && key !== nativeClassifier) continue;
            const p = path.join(LIBRARIES_DIR, c.path);
            if (fs.existsSync(p)) cp.push(p);
          }
        }
      }
      cp.push(...libPaths);
      mainClass = profile.mainClass || mainClass;
    } else if (modloader === 'neoforge') {
      sendToUI('launch-log', 'NeoForge: поиск...');
      try {
        const neoProfile = await resolveNeoForge(version);
        const libPaths = await downloadModloaderLibs(neoProfile.libraries, ['https://maven.neoforged.net/releases', 'https://libraries.minecraft.net']);
        // Генерируем patched JAR через installertools, если её нет
        const neoPatched = path.join(LIBRARIES_DIR, 'net', 'neoforged', 'minecraft-client-patched', neoProfile.version, `minecraft-client-patched-${neoProfile.version}.jar`);
        const srgJar = path.join(LIBRARIES_DIR, 'net', 'minecraft', 'client', `${version}-1`, `client-${version}-1-srg.jar`);
        if (!fs.existsSync(neoPatched) || !fs.existsSync(srgJar)) {
          await runNeoForgeProcessors(path.join(vDir, `${version}.jar`), neoProfile.installerPath);
        }
        if (!fs.existsSync(neoPatched)) {
          throw new Error(`Patched jar не создан: Mojang обновил jar Minecraft ${version} (перевыпуск), NeoForge не обновлён. Попробуйте другую версию.`);
        }
        // Production mode: не заменяем ванильный jar patched-версией — NeoForge bootstrap находит её через locateProductionMinecraft()
        cp = [path.join(vDir, `${version}.jar`)];
        const cpOs = getOS();
        for (const lib of versionData.libraries) {
          if (!isLibAllowed(lib)) continue;
          if (lib.downloads?.artifact) {
            const p = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
            if (fs.existsSync(p)) cp.push(p);
          }
          if (lib.downloads?.classifiers) {
            const nativeClassifier = lib.natives ? lib.natives[cpOs] : null;
            for (const [key, c] of Object.entries(lib.downloads.classifiers)) {
              if (nativeClassifier && key !== nativeClassifier) continue;
              const p = path.join(LIBRARIES_DIR, c.path);
              if (fs.existsSync(p)) cp.push(p);
            }
          }
        }
        cp.push(...libPaths);
        mainClass = neoProfile.mainClass || mainClass;
        extraJvmArgs = neoProfile.jvmArgs;
        extraGameArgs = neoProfile.gameArgs;
        sendToUI('launch-log', `NeoForge: ${neoProfile.version}`);
      } catch (e) {
        sendToUI('launch-log', `NeoForge: ${e.message}`);
        throw e;
      }
    } else if (modloader === 'quilt') {
      sendToUI('launch-log', 'Quilt: поиск...');
      try {
        const quiltProfile = await resolveQuilt(version);
        const libPaths = await downloadModloaderLibs(quiltProfile.libraries);
        cp = [path.join(vDir, `${version}.jar`)];
        const cpOs = getOS();
        for (const lib of versionData.libraries) {
          if (!isLibAllowed(lib)) continue;
          if (lib.downloads?.artifact) {
            const p = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
            if (fs.existsSync(p)) cp.push(p);
          }
          if (lib.downloads?.classifiers) {
            const nativeClassifier = lib.natives ? lib.natives[cpOs] : null;
            for (const [key, c] of Object.entries(lib.downloads.classifiers)) {
              if (nativeClassifier && key !== nativeClassifier) continue;
              const p = path.join(LIBRARIES_DIR, c.path);
              if (fs.existsSync(p)) cp.push(p);
            }
          }
        }
        cp.push(...libPaths);
        // Quilt Loader 0.20.0-beta.9 использует Mixin, которому на Java 25+ нужен launchwrapper в classpath
        if (javaMajor >= 25) {
          const lwPath = path.join(LIBRARIES_DIR, 'net', 'minecraft', 'launchwrapper', '1.12', 'launchwrapper-1.12.jar');
          if (!fs.existsSync(lwPath)) {
            await downloadFileIfMissing('https://libraries.minecraft.net/net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar', lwPath);
          }
          if (fs.existsSync(lwPath)) cp.push(lwPath);
        }
        mainClass = quiltProfile.mainClass || mainClass;
        extraJvmArgs = extraJvmArgs.concat([
          '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
          '--add-opens', 'java.base/java.lang.reflect=ALL-UNNAMED',
        ]);
        sendToUI('launch-log', `Quilt: ${quiltProfile.id}`);
      } catch (e) {
        sendToUI('launch-log', `Quilt: ${e.message}`);
        throw e;
      }
    } else if (modloader === 'forge') {
      sendToUI('launch-log', 'Forge: поиск...');
      try {
        forgeProfile = await resolveForge(version);
        // Прямое извлечение Forge JAR из установщика
        const forgeJarDir = path.join(LIBRARIES_DIR, 'net', 'minecraftforge', 'forge', forgeProfile.version);
        let forgeJarPath = path.join(forgeJarDir, `forge-${forgeProfile.version}-universal.jar`);
        // Если universal.jar не существует — пробуем без суффикса
        if (!fs.existsSync(forgeJarPath)) {
          const plainJar = path.join(forgeJarDir, `forge-${forgeProfile.version}.jar`);
          if (fs.existsSync(plainJar)) forgeJarPath = plainJar;
        }
        // Если всё ещё нет — извлекаем из установщика
        if (!fs.existsSync(forgeJarPath) && fs.existsSync(forgeProfile.installerPath)) {
          try {
            const zip = new AdmZip(forgeProfile.installerPath);
            const entries = zip.getEntries();
            const jarEntry = entries.find(e => {
              const name = e.entryName;
              if (!name.endsWith('.jar')) return false;
              return (name.endsWith('-universal.jar') || name.includes(`forge-${forgeProfile.version}.jar`))
                && (name.includes('/forge/') || !name.includes('/'));
            });
            if (jarEntry) {
              if (!fs.existsSync(forgeJarDir)) fs.mkdirSync(forgeJarDir, { recursive: true });
              fs.writeFileSync(forgeJarPath, jarEntry.getData());
              sendToUI('launch-log', `Forge JAR извлечён: ${forgeJarPath}`);
            } else {
              sendToUI('launch-log', 'Forge JAR entry не найден в установщике');
            }
          } catch (e) {
            sendToUI('launch-log', `Ошибка извлечения Forge JAR: ${e.message}`);
          }
        }
        extractNatives(forgeProfile, nativesDir);
        const jarPath = path.join(vDir, `${version}.jar`);
        if (!fs.existsSync(jarPath)) throw new Error(`Minecraft JAR не найден: ${jarPath}`);
        let primaryJarPath = jarPath;
        // Forge 1.21+ (ForgeBootstrap) требует пропатченный Minecraft JAR
        if (forgeProfile.mainClass === 'net.minecraftforge.bootstrap.ForgeBootstrap') {
          const patchedJar = path.join(vDir, `forge-${forgeProfile.version}-client.jar`);
          // Всегда удаляем старый patched JAR и запускаем процессоры
          if (fs.existsSync(patchedJar)) {
            fs.unlinkSync(patchedJar);
            sendToUI('launch-log', 'Forge: старый patched JAR удалён');
          }
          sendToUI('launch-log', 'Forge: запуск процессоров установщика...');
          const success = await runForgeProcessors(jarPath, patchedJar, forgeProfile);
          if (success && fs.existsSync(patchedJar)) {
            primaryJarPath = patchedJar;
            sendToUI('launch-log', 'Forge: patched JAR создан процессорами');
          } else {
            sendToUI('launch-log', 'Forge: процессоры не сработали, попытка ручного патчинга...');
            try {
              fs.copyFileSync(jarPath, patchedJar);
              const zip = new AdmZip(patchedJar);
              zip.addFile('.forge_patched_minecraft', Buffer.alloc(0));
              zip.writeZip(patchedJar);
              if (fs.existsSync(patchedJar)) {
                primaryJarPath = patchedJar;
                sendToUI('launch-log', 'Forge: patched JAR создан (только маркер)');
              }
            } catch (e) {
              sendToUI('launch-log', `Forge: ошибка патчинга: ${e.message}`);
            }
          }
        }
        cp = [primaryJarPath];
        const cpOs = getOS();
        // Сначала добавляем Forge-библиотеки (приоритет над ванильными)
        const forgeLibs = await downloadForgeLibs(forgeProfile.libraries, cpOs, forgeProfile.installerPath);
        const cpSet = new Set([primaryJarPath, ...forgeLibs]);
        for (const l of forgeLibs) cp.push(l);
        // Затем ванильные библиотеки (не дублируем уже добавленные)
        for (const lib of versionData.libraries) {
          if (!isLibAllowed(lib)) continue;
          if (lib.downloads?.artifact) {
            const p = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
            if (fs.existsSync(p) && !cpSet.has(p)) { cp.push(p); cpSet.add(p); }
          }
          if (lib.downloads?.classifiers) {
            const nativeClassifier = lib.natives ? lib.natives[cpOs] : null;
            for (const [key, c] of Object.entries(lib.downloads.classifiers)) {
              if (nativeClassifier && key !== nativeClassifier) continue;
              const p = path.join(LIBRARIES_DIR, c.path);
              if (fs.existsSync(p) && !cpSet.has(p)) { cp.push(p); cpSet.add(p); }
            }
          }
        }
        // Добавляем Forge JAR в classpath вручную, если его там нет
        if (fs.existsSync(forgeJarPath) && !cpSet.has(forgeJarPath)) {
          cp.push(forgeJarPath);
          cpSet.add(forgeJarPath);
          sendToUI('launch-log', `Forge JAR добавлен в classpath вручную`);
        }
        mainClass = forgeProfile.mainClass || mainClass;
        if (forgeProfile.jvmArgs.length > 0) {
          extraJvmArgs = forgeProfile.jvmArgs;
        }
        if (forgeProfile.gameArgs.length > 0) {
          extraGameArgs = forgeProfile.gameArgs;
        }
        sendToUI('launch-log', `Forge: ${forgeProfile.version}, библиотек всего: ${cp.length}`);
        // Проверяем classpath
        const hasMc = cp.some(p => p.includes(`${version}.jar`) || p.includes('forge-') || p.includes('forge'));
        const hasLw = cp.some(p => p.includes('launchwrapper'));
        const jarSize = fs.existsSync(primaryJarPath) ? fs.statSync(primaryJarPath).size : 0;
        sendToUI('launch-log', `Minecraft JAR: ${hasMc ? 'в classpath' : 'НЕТ'}, размер: ${jarSize} байт, launchwrapper: ${hasLw ? 'да' : 'НЕТ'}`);
        sendToUI('launch-log', `Main class: ${mainClass}, extraGameArgs: [${extraGameArgs.join(', ')}], extraJvmArgs: [${extraJvmArgs.join(', ')}]`);
      } catch (e) {
        sendToUI('launch-log', `Forge: ${e.message}`);
        throw e;
      }
    } else {
      cp = [path.join(vDir, `${version}.jar`)];
      const cpOs = getOS();
      for (const lib of versionData.libraries) {
        if (!isLibAllowed(lib)) continue;
        if (lib.downloads?.artifact) {
          const p = path.join(LIBRARIES_DIR, lib.downloads.artifact.path);
          if (fs.existsSync(p)) cp.push(p);
        }
        if (lib.downloads?.classifiers) {
          const nativeClassifier = lib.natives ? lib.natives[cpOs] : null;
          for (const [key, c] of Object.entries(lib.downloads.classifiers)) {
            if (nativeClassifier && key !== nativeClassifier) continue;
            const p = path.join(LIBRARIES_DIR, c.path);
            if (fs.existsSync(p)) cp.push(p);
          }
        }
      }
    }

    // Для Forge 1.7.10: заменяем Guava 17.0 на 21.0 (в 17.0 нет CharSource.readLines)
    if (modloader === 'forge') {
      const vNum = parseVersion(version);
      if (vNum !== null && vNum <= 7) {
        let guavaIdx = -1;
        for (let i = 0; i < cp.length; i++) {
          const b = path.basename(cp[i]).toLowerCase();
          if (b.includes('guava') && (cp[i].includes('17.0') || b.includes('guava-17'))) {
            guavaIdx = i;
            break;
          }
        }
        if (guavaIdx >= 0) {
          const guava21Path = path.join(LIBRARIES_DIR, 'com', 'google', 'guava', 'guava', '21.0', 'guava-21.0.jar');
          if (!fs.existsSync(guava21Path)) {
            await downloadFileIfMissing('https://libraries.minecraft.net/com/google/guava/guava/21.0/guava-21.0.jar', guava21Path);
          }
          if (fs.existsSync(guava21Path)) {
            cp[guavaIdx] = guava21Path;
            // Обновляем cpSet, если используется
            if (typeof cpSet !== 'undefined' && cpSet.delete) {
              cpSet.delete(cp[guavaIdx]);
              cpSet.add(guava21Path);
            }
            sendToUI('launch-log', `Guava: заменён 17.0 → 21.0 (требуется CharSource.readLines)`);
          }
        }
      }
    }

    const compatArgs = getJavaCompatArgs(javaMajor);
    const jvmArgsFull = [
      ...compatArgs,
      ...extraJvmArgs,
      `-Djava.library.path=${nativesDir}`,
      '-Dminecraft.launcher.brand=crystal-launcher',
      '-Dminecraft.launcher.version=1.0.0',
      ...(jvmArgs || [])
    ];

    const allGameArgs = [...mcArgs, ...extraGameArgs];
    const args = [...jvmArgsFull, '-cp', cp.join(path.delimiter), mainClass, ...allGameArgs];

    sendToUI('launch-log', `Запуск Minecraft ${version} (${modloader})...`);
    // Диагностика classpath — только для Forge
    if (modloader === 'forge') {
      let forgeJar = cp.find(p => p.includes('forge') && p.includes('universal'));
      if (!forgeJar && forgeProfile) {
        forgeJar = cp.find(p => p.includes(`forge-${forgeProfile.version}`) && p.endsWith('.jar'));
      }
      if (!forgeJar) {
        forgeJar = cp.find(p => p.includes('forge') && (p.includes('forge-') || p.endsWith('.jar')));
      }
      if (forgeJar) {
        const exists = fs.existsSync(forgeJar);
        const size = exists ? fs.statSync(forgeJar).size : 0;
        sendToUI('launch-log', `Forge JAR: ${forgeJar} | существует: ${exists} | размер: ${size} байт`);
        if (exists) {
          try {
            const jarZip = new AdmZip(forgeJar);
            const cls = jarZip.getEntries().find(e => e.entryName.includes('FMLTweaker'));
            sendToUI('launch-log', `FMLTweaker в forge JAR: ${cls ? cls.entryName : 'НЕ НАЙДЕН'}`);
            const mf = jarZip.readAsText('META-INF/MANIFEST.MF');
            sendToUI('launch-log', `MANIFEST: ${mf ? mf.replace(/\n/g, ' | ') : 'нет'}`);
          } catch (e) {
            sendToUI('launch-log', `forge JAR read error: ${e.message}`);
          }
        }
      } else {
        sendToUI('launch-log', '⚠ Forge JAR НЕ НАЙДЕН в classpath!');
        const allForge = cp.filter(p => p.includes('forge'));
        sendToUI('launch-log', `Все 'forge' в classpath: ${allForge.join(', ')}`);
      }
    }
    // Диагностика Guava на classpath
    const guavaJars = cp.filter(p => path.basename(p).toLowerCase().includes('guava'));
    if (guavaJars.length > 0) {
      sendToUI('launch-log', `Guava на classpath (${guavaJars.length}): ${guavaJars.map(p => path.basename(p)).join(', ')}`);
    }
    sendToUI('launch-log', `Java: ${javaPath}`);

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const mc = spawn(javaPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        mc.stdout.on('data', d => sendToUI('launch-log', d.toString()));
        mc.stderr.on('data', d => {
          const txt = d.toString();
          sendToUI('launch-log', txt);
          if (txt.includes('UnsupportedClassVersionError') || txt.includes('major.minor') || txt.includes('Unsupported class file major version')) lastError = txt;
        });
        sendToUI('game-status', { running: true, pid: mc.pid });
        mc.on('close', code => {
          sendToUI('launch-log', `Minecraft завершился с кодом ${code}`);
          sendToUI('game-status', { running: false });
        });
        return { pid: mc.pid };
      } catch (spawnErr) {
        if (attempt === 0 && (spawnErr.message.includes('UnsupportedClassVersionError') || spawnErr.message.includes('major') || lastError)) {
          sendToUI('launch-log', 'Ошибка Java, скачиваю подходящую версию...');
          const minJava = getMinJavaVersion(parseVersion(version));
          const javaDir = path.join(MC_DIR, 'runtime', `java${minJava}`);
          const adoptOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
          const apiUrl = `https://api.adoptium.net/v3/assets/latest/${minJava}/hotspot?architecture=x64&os=${adoptOs}&image_type=jdk`;
          const apiResp = await fetch(apiUrl);
          if (apiResp && apiResp.length > 0) {
            const pkg = apiResp[0].binary?.package;
            if (pkg?.link) {
              const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
              const archivePath = path.join(os.tmpdir(), `java${minJava}_retry.${ext}`);
              await downloadFile(pkg.link, archivePath, 120000);
              if (fs.existsSync(javaDir)) fs.rmSync(javaDir, { recursive: true, force: true });
              if (process.platform === 'win32') {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(archivePath);
                zip.extractAllTo(javaDir, true);
              } else {
                fs.mkdirSync(javaDir, { recursive: true });
                execSync(`tar -xzf "${archivePath}" -C "${javaDir}"`, { stdio: 'ignore' });
              }
              const entries = fs.readdirSync(javaDir);
              const sub = entries.find(e => fs.existsSync(path.join(javaDir, e, 'bin', getJavaBinName())));
              if (sub) {
                javaPath = path.join(javaDir, sub, 'bin', getJavaBinName());
                javaMajor = minJava;
                sendToUI('launch-log', `Java переустановлена: ${javaPath}`);
                continue;
              }
            }
          }
        }
        sendToUI('launch-error', spawnErr.message);
        throw spawnErr;
      }
    }
    sendToUI('launch-error', 'Не удалось запустить Minecraft после переустановки Java');
    throw new Error('Launch failed after Java retry');
  } catch (err) {
    sendToUI('launch-error', err.message);
    throw err;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 900, minHeight: 600,
    frame: false, backgroundColor: '#0f0f1a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => { ensureDirs(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('auth-google', async () => {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({ width: 600, height: 700, title: 'Вход через Google', webPreferences: { nodeIntegration: false, contextIsolation: true } });
    const server = require('http').createServer((req, res) => {
      if (req.url.startsWith('/auth/callback')) {
        const url = new URL(req.url, 'http://localhost:25560');
        res.end('Ok'); authWindow.close(); server.close();
        resolve({ success: true, code: url.searchParams.get('code') || '', name: 'Player' });
      }
    }).listen(25560);
    authWindow.loadURL(`https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com&redirect_uri=${encodeURIComponent('http://localhost:25560/auth/callback')}&response_type=code&scope=openid%20email%20profile`);
  });
});

ipcMain.handle('launch-game', async (e, { username, version, modloader, jvmArgs, gameArgs }) => {
  try {
    const result = await launchMinecraft(username || 'Player', version || '1.21.1', modloader || 'vanilla', jvmArgs, gameArgs);
    sendToUI('version-status-updated', version);
    return { success: true, pid: result.pid };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fetch-versions', async () => {
  try {
    const manifest = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    if (!manifest || !manifest.versions) throw new Error('Некорректный манифест');
    return manifest.versions.map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
  } catch (e) {
    throw new Error('Не удалось загрузить список версий: ' + e.message);
  }
});

ipcMain.handle('get-minecraft-status', async (e, version) => {
  const jarPath = path.join(VERSIONS_ROOT, version || '1.21.1', `${version || '1.21.1'}.jar`);
  const jsonPath = path.join(VERSIONS_ROOT, version || '1.21.1', `${version || '1.21.1'}.json`);
  return { installed: fs.existsSync(jarPath) && fs.existsSync(jsonPath), version };
});

ipcMain.handle('get-java-path', async (_, version) => await getJavaPath(version));

ipcMain.handle('open-game-folder', () => {
  const gameDir = path.join(MC_DIR, 'game');
  if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });
  const opener = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  require('child_process').exec(`"${opener}" "${gameDir}"`);
});

ipcMain.handle('check-modloader-availability', async (e, { version, type }) => {
  try {
    if (type === 'fabric') {
      const data = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}`);
      return Array.isArray(data) && data.length > 0;
    }
    if (type === 'forge') {
      const data = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const key = Object.keys(data.promos || {}).find(k => k.startsWith(version + '-') && k.endsWith('-latest'));
      return !!key;
    }
    if (type === 'neoforge') {
      const parts = version.split('.').map(Number);
      let prefix, group;
      if (parts[0] === 1) {
        if (parts[1] === 20 && parts[2] === 1) {
          prefix = version;
          group = 'net.neoforged/forge';
        } else {
          prefix = `${parts[1]}.${parts[2] || 0}`;
          group = 'net.neoforged/neoforge';
        }
      } else {
        prefix = `${parts[0]}.${parts[1]}`;
        group = 'net.neoforged/neoforge';
      }
      const xmlText = await fetch(`https://maven.neoforged.net/releases/${group}/maven-metadata.xml`, true);
      const versions = [...xmlText.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
      return versions.some(v => v.startsWith(prefix));
    }
    if (type === 'quilt') {
      const data = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${version}`);
      return Array.isArray(data) && data.length > 0;
    }
    return false;
  } catch { return false; }
});

ipcMain.handle('list-mods', async () => {
  try {
    if (!fs.existsSync(MODS_DIR)) fs.mkdirSync(MODS_DIR, { recursive: true });
    const files = fs.readdirSync(MODS_DIR).filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
    return files.sort().map(f => {
      const p = path.join(MODS_DIR, f);
      const stat = fs.statSync(p);
      return { name: f, size: stat.size, enabled: !f.endsWith('.disabled'), mtime: stat.mtimeMs };
    });
  } catch { return []; }
});

ipcMain.handle('toggle-mod', async (e, modName) => {
  try {
    const src = path.join(MODS_DIR, modName);
    const disabled = modName.endsWith('.disabled');
    const dst = disabled ? src.replace('.jar.disabled', '.jar') : src + '.disabled';
    fs.renameSync(src, dst);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('remove-mod', async (e, modName) => {
  try {
    fs.unlinkSync(path.join(MODS_DIR, modName));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('list-modpacks', async () => {
  try {
    if (!fs.existsSync(MODPACKS_DIR)) fs.mkdirSync(MODPACKS_DIR, { recursive: true });
    const packs = [];
    for (const dir of fs.readdirSync(MODPACKS_DIR)) {
      const packDir = path.join(MODPACKS_DIR, dir);
      if (!fs.statSync(packDir).isDirectory()) continue;
      const manifestPath = path.join(packDir, 'pack.json');
      const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : { name: dir, mods: [] };
      const modFiles = fs.readdirSync(packDir).filter(f => f.endsWith('.jar'));
      packs.push({ id: dir, name: manifest.name || dir, modCount: modFiles.length, description: manifest.description || '' });
    }
    return packs;
  } catch { return []; }
});

ipcMain.handle('import-modpack', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Modpack ZIP', extensions: ['zip'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    const zipPath = result.filePaths[0];
    const zipName = path.basename(zipPath, '.zip');
    const extractDir = path.join(MODPACKS_DIR, zipName);
    if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const mods = [];
    for (const entry of entries) {
      if (entry.entryName.endsWith('.jar') && !entry.isDirectory) {
        zip.extractEntryTo(entry, extractDir, false, true);
        mods.push(entry.entryName);
      }
    }
    const manifest = { name: zipName, mods, description: `Импортирован ${new Date().toLocaleDateString('ru-RU')}` };
    fs.writeFileSync(path.join(extractDir, 'pack.json'), JSON.stringify(manifest, null, 2));
    return { success: true, packId: zipName };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('apply-modpack', async (e, packId) => {
  try {
    const packDir = path.join(MODPACKS_DIR, packId);
    if (!fs.existsSync(packDir)) return { success: false, error: 'Модпак не найден' };
    if (!fs.existsSync(MODS_DIR)) fs.mkdirSync(MODS_DIR, { recursive: true });
    // Удаляем все текущие моды и .disabled моды
    const current = fs.readdirSync(MODS_DIR).filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
    for (const f of current) {
      fs.unlinkSync(path.join(MODS_DIR, f));
    }
    // Копируем моды из модпака
    const files = fs.readdirSync(packDir).filter(f => f.endsWith('.jar'));
    for (const f of files) {
      fs.copyFileSync(path.join(packDir, f), path.join(MODS_DIR, f));
    }
    return { success: true, count: files.length, removed: current.length };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('install-mod', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Minecraft Mods', extensions: ['jar'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    if (!fs.existsSync(MODS_DIR)) fs.mkdirSync(MODS_DIR, { recursive: true });
    let count = 0;
    for (const src of result.filePaths) {
      const name = path.basename(src);
      const dst = path.join(MODS_DIR, name);
      if (!fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
        count++;
      }
    }
    return { success: true, count };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('open-mod-browser', async () => {
  try {
    mainWindow.webContents.send('show-mod-browser', 'https://minecraft-inside.ru/mods/');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('download-mod', async (e, url) => {
  try {
    const filename = path.basename(url).split('?')[0];
    if (!filename.endsWith('.jar')) return { success: false, error: 'Не .jar файл' };
    if (!fs.existsSync(MODS_DIR)) fs.mkdirSync(MODS_DIR, { recursive: true });
    const savePath = path.join(MODS_DIR, filename);
    const response = await fetch(url);
    if (!response.ok) return { success: false, error: 'Ошибка загрузки' };
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(savePath, buffer);
    return { success: true, name: filename };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('clear-mods', async () => {
  try {
    if (!fs.existsSync(MODS_DIR)) return { success: true, count: 0 };
    const files = fs.readdirSync(MODS_DIR).filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
    for (const f of files) {
      fs.unlinkSync(path.join(MODS_DIR, f));
    }
    return { success: true, count: files.length };
  } catch (e) { return { success: false, error: e.message }; }
});


