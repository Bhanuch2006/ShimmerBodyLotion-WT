const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    toggleWorker: (start, serverUrl) => ipcRenderer.invoke('toggle-worker', start, serverUrl),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),
    onWorkerStatus: (callback) => ipcRenderer.on('worker-status', (_, data) => callback(data)),
    onWorkerMessage: (callback) => ipcRenderer.on('worker-message', (_, msg) => callback(msg)),
    sendWorkerReply: (msgType, data) => ipcRenderer.invoke('worker-reply', msgType, data)
});
