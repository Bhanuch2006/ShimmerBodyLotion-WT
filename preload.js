const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    toggleWorker: (start) => ipcRenderer.invoke('toggle-worker', start),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    onWorkerStatus: (callback) => ipcRenderer.on('worker-status', (_, data) => callback(data))
});
