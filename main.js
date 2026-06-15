const { app, BrowserWindow, session, shell, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

// Gather läuft in einem eigenen, persistenten Kontext (eigenes Profil/Session),
// getrennt vom System-Browser.
const START_URL = 'https://app.gather.town';

// Eine moderne Chrome-User-Agent verwenden, damit Gather die App nicht als
// "veralteter Browser" abweist.
const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Gather',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#1c1c28',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Eigene, persistente Session, damit Login & Einstellungen erhalten bleiben.
      partition: 'persist:gather'
    }
  });

  const ses = mainWindow.webContents.session;

  // Kamera, Mikrofon und Bildschirmfreigabe für Gather erlauben.
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'videoCapture', 'display-capture', 'notifications'];
    callback(allowed.includes(permission));
  });
  ses.setPermissionCheckHandler(() => true);

  // Bildschirm teilen: Electron hat seit v17 keinen eingebauten Quellen-Auswähler.
  // Wenn die Web-App getDisplayMedia() aufruft, müssen wir hier eine Quelle liefern,
  // sonst schlägt das Teilen fehl. Wir zeigen einen eigenen Auswahl-Dialog.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 }
      });
      const chosenId = await pickSource(sources);
      const chosen = sources.find((s) => s.id === chosenId);
      if (chosen) {
        callback({ video: chosen });
      } else {
        // Abgebrochen: Anfrage ablehnen.
        callback();
      }
    } catch (err) {
      console.error('Bildschirmfreigabe fehlgeschlagen:', err);
      callback();
    }
  });

  ses.setUserAgent(CHROME_UA);

  mainWindow.loadURL(START_URL, { userAgent: CHROME_UA });

  // Externe Links (nicht-Gather) im Standard-Browser öffnen.
  const isGather = (url) => /(^https?:\/\/)([a-z0-9-]+\.)*gather\.town/i.test(url);

  // Login-Anbieter (Google, Microsoft, Apple ...) müssen INNERHALB der App
  // (in der eigenen Session) laufen, damit das Login-Cookie in der App landet.
  const isAuth = (url) =>
    /(accounts\.google\.com|accounts\.youtube\.com|login\.microsoftonline\.com|login\.live\.com|login\.microsoft\.com|appleid\.apple\.com|github\.com\/login|auth0\.com|okta\.com)/i.test(url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isGather(url) || isAuth(url)) {
      // Popup im App-Kontext öffnen (teilt sich die persistente Session).
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: { partition: 'persist:gather' }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Nur das Hauptfenster: echte externe Navigationen in den Browser auslagern,
  // Gather- und Login-Seiten aber in der App belassen.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isGather(url) && !isAuth(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Zeigt einen Auswahl-Dialog mit allen teilbaren Bildschirmen/Fenstern und
// liefert die ID der gewählten Quelle (oder null bei Abbruch).
function pickSource(sources) {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      width: 760,
      height: 560,
      title: 'Zum Teilen auswählen',
      parent: mainWindow,
      modal: true,
      autoHideMenuBar: true,
      backgroundColor: '#1c1c28',
      webPreferences: {
        // Lokale, vertrauenswürdige Seite ohne Remote-Inhalte – einfache IPC ok.
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    let settled = false;
    const finish = (id) => {
      if (settled) return;
      settled = true;
      ipcMain.removeHandler('get-sources');
      ipcMain.removeListener('picker-choose', onChoose);
      if (!picker.isDestroyed()) picker.close();
      resolve(id);
    };

    const onChoose = (_event, id) => finish(id);

    ipcMain.handle('get-sources', () =>
      sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL()
      }))
    );
    ipcMain.on('picker-choose', onChoose);

    picker.on('closed', () => finish(null));
    picker.loadFile(path.join(__dirname, 'picker.html'));
  });
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});