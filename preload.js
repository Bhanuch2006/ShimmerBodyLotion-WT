const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getSavedConfig: () => ipcRenderer.invoke('get-saved-config'),
    connectToServer: (url) => ipcRenderer.invoke('connect-to-server', url),
    resetConfig: () => ipcRenderer.invoke('reset-config'),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});
