const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getAppMode: () => ipcRenderer.invoke('get-app-mode'),
    selectMode: (mode, ip) => ipcRenderer.invoke('select-mode', mode, ip),
    toggleWorker: (start) => ipcRenderer.invoke('toggle-worker', start),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    onWorkerStatus: (callback) => ipcRenderer.on('worker-status', (_, data) => callback(data))
});
