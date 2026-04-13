const { contextBridge, ipcRenderer } = require("electron");

// Expose a minimal, safe API to the renderer process.
// contextIsolation is enabled, so this is the only way to communicate with main.
contextBridge.exposeInMainWorld("electronAPI", {
    saveMidi: (base64Data, filename) =>
        ipcRenderer.invoke("save-midi", base64Data, filename)
});
