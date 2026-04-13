const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js")
        }
    });

    // Load the built React app (production build output).
    // This avoids CRA dev-server + Tone.js module interop issues.
    win.loadFile(path.join(__dirname, "../build/index.html"));
}

// IPC handler: save a MIDI data URI directly to Documents/Molecular Music Generator/
// so the user isn't prompted for a save location in the desktop app.
ipcMain.handle("save-midi", async (_event, base64Data, filename) => {
    const dir = path.join(os.homedir(), "Documents", "Molecular Music Generator");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    // base64Data is a data URI such as "data:audio/midi;base64,..."
    const base64 = base64Data.replace(/^data:[^;]+;base64,/, "");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return filePath;
});

app.whenReady().then(() => {
    createWindow();

    // On macOS, recreate a window if the app is re-activated
    // and there are no windows open.
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit the app when all windows are closed.
// On macOS apps conventionally stay open until the user quits explicitly.
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
