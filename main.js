const { app, BrowserWindow, ipcMain, net, Menu, screen, dialog } = require('electron');
const path = require('path');
const QRCode = require('qrcode');
const { fork, spawn } = require('child_process');
const fs = require('fs');
const iconPath = path.join(__dirname, 'renderer/assets/icon.png');

let mainWindow;
let lyricWindow = null;
const apiBaseUrl = 'http://localhost:17520';
let apiProcess = null;
let cookies = '';

Menu.setApplicationMenu(null);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function getApiDir() {
  const basePath = app.isPackaged ? process.resourcesPath : __dirname;
  return path.join(basePath, 'api-enhanced');
}

function installApiDependencies(apiDir) {
  return new Promise((resolve, reject) => {
    console.log('📦 检测到 API 依赖缺失，正在安装...');
    
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const installProcess = spawn(npmCmd, ['install'], {
      cwd: apiDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    installProcess.stdout.on('data', (data) => {
      console.log('[npm install]', data.toString().trim());
    });

    installProcess.stderr.on('data', (data) => {
      console.error('[npm install error]', data.toString().trim());
    });

    installProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ API 依赖安装完成');
        resolve();
      } else {
        reject(new Error(`npm install 失败，退出码 ${code}`));
      }
    });

    installProcess.on('error', (err) => {
      reject(err);
    });
  });
}

async function ensureApiDependencies(apiDir) {
  const nodeModulesPath = path.join(apiDir, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    try {
      await installApiDependencies(apiDir);
    } catch (err) {
      dialog.showErrorBox('依赖安装失败', `无法自动安装 API 依赖：${err.message}\n请手动进入 ${apiDir} 目录运行 npm install。`);
      throw err;
    }
  }
}

function startApiServer() {
  return new Promise(async (resolve) => {
    const realApiDir = getApiDir();

    if (!fs.existsSync(realApiDir)) {
      const msg = `❌ API 目录不存在！\n路径: ${realApiDir}\n\n请确认项目根目录有 api-enhanced 文件夹，然后重新打包`;
      dialog.showErrorBox('启动失败', msg);
      console.error(msg);
      resolve();
      return;
    }

    const appJsPath = path.join(realApiDir, 'app.js');
    if (!fs.existsSync(appJsPath)) {
      const msg = `❌ 未找到 app.js 文件！\n路径: ${appJsPath}`;
      dialog.showErrorBox('启动失败', msg);
      console.error(msg);
      resolve();
      return;
    }

    try {
      await ensureApiDependencies(realApiDir);
    } catch (err) {
      console.error('依赖检查失败，但将继续尝试启动 API（可能失败）');
      // 不 resolve，继续尝试启动
    }

    console.log('✅ API 目录存在:', realApiDir);
    console.log('🚀 正在启动本地 API 服务器...');

    apiProcess = fork('app.js', [], {
      cwd: realApiDir,
      env: { ...process.env, PORT: '17520', ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      execPath: process.execPath
    });

    apiProcess.on('error', (err) => {
      const msg = `❌ API 进程启动失败: ${err.message}\n路径: ${realApiDir}`;
      dialog.showErrorBox('API 启动错误', msg);
      console.error(msg);
      resolve();
    });

    apiProcess.stdout.on('data', (data) => console.log('[API]', data.toString().trim()));
    apiProcess.stderr.on('data', (data) => console.error('[API Error]', data.toString().trim()));

    let retries = 0;
    const MAX_RETRIES = 50;

    const checkApiReady = () => {
      const req = net.request({ url: `${apiBaseUrl}/`, method: 'GET' });
      req.on('response', () => {
        console.log('✅ 本地 API 服务器已就绪');
        resolve();
      });
      req.on('error', () => {
        retries++;
        if (retries >= MAX_RETRIES) {
          const msg = '⚠️ API 服务器启动超时（已尝试50次）\n\n主程序已打开，可继续使用（API 相关功能暂时不可用）';
          dialog.showErrorBox('API 启动超时', msg);
          resolve();
          return;
        }
        setTimeout(checkApiReady, 800);
      });
      req.end();
    };

    checkApiReady();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: iconPath,
  });
  mainWindow.setIcon(iconPath);

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    if (lyricWindow && !lyricWindow.isDestroyed()) {
      lyricWindow.close();
      lyricWindow = null;
    }
  });
}

app.whenReady().then(async () => {
  await startApiServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (apiProcess) {
    console.log('🛑 正在关闭本地 API 服务器...');
    apiProcess.kill();
  }
});

ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => {
  mainWindow.close();
});

function createLyricWindow() {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.show();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  lyricWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    movable: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: iconPath,
  });
  lyricWindow.setIcon(iconPath);

  lyricWindow.loadFile(path.join(__dirname, 'renderer/lyric/index.html'));

  lyricWindow.setIgnoreMouseEvents(true, { forward: true });

  lyricWindow.on('closed', () => {
    lyricWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lyric-window-closed');
    }
  });
}

ipcMain.on('open-lyric-window', () => {
  createLyricWindow();
});

ipcMain.on('close-lyric-window', () => {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.close();
    lyricWindow = null;
  }
});

ipcMain.on('update-lyric-time', (event, time) => {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.webContents.send('lyric-time', time);
  }
});

ipcMain.on('send-lyric-data', (event, data) => {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.webContents.send('lyric-data', data);
  }
});

ipcMain.on('request-lyric-data', () => {
  console.log("收到歌词窗口数据请求，转发给主窗口");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('request-lyric-data-from-main');
  }
});

ipcMain.on('send-current-lyric', (event, data) => {
  console.log("主窗口回复歌词数据，长度:", data ? data.length : 0);
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.webContents.send('lyric-data', data);
  }
});

ipcMain.on('send-visualization-data', (event, data) => {
  if (lyricWindow && !lyricWindow.isDestroyed()) {
    lyricWindow.webContents.send('visualization-data', data);
  }
});

function mergeCookies(setCookieArray) {
  if (!setCookieArray || !Array.isArray(setCookieArray)) return '';
  const cookies = setCookieArray.map(cookie => {
    const eqIdx = cookie.indexOf('=');
    const semiIdx = cookie.indexOf(';');
    if (eqIdx === -1) return null;
    const name = cookie.substring(0, eqIdx);
    let value = '';
    if (semiIdx === -1) {
      value = cookie.substring(eqIdx + 1);
    } else {
      value = cookie.substring(eqIdx + 1, semiIdx);
    }
    return `${name}=${value}`;
  }).filter(c => c !== null);
  return cookies.join('; ');
}

ipcMain.handle('api-request', async (event, { method, endpoint, params, body }) => {
  const url = new URL(endpoint, apiBaseUrl);
  if (!params) params = {};
  if (!params.realIP) {
    params.realIP = '116.25.146.177';
  }
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  if (cookies) headers['Cookie'] = cookies;
  if (body) headers['Content-Type'] = 'application/json';

  return new Promise((resolve, reject) => {
    const request = net.request({ url: url.toString(), method, headers });
    if (body) request.write(JSON.stringify(body));
    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (response.headers['set-cookie']) {
            const newCookies = mergeCookies(response.headers['set-cookie']);
            if (newCookies) {
              cookies = newCookies;
            }
          }
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    request.on('error', (err) => reject(err));
    request.end();
  });
});

ipcMain.handle('generate-qrcode', async (event, text) => {
  return await QRCode.toDataURL(text);
});

ipcMain.handle('get-cookie', () => cookies);
ipcMain.handle('set-cookie', (event, newCookie) => {
  cookies = newCookie;
});