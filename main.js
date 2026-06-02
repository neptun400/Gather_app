const { app, BrowserWindow, session, shell } = require('electron');
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

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});