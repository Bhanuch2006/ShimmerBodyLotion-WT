const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    getWorkerStatus: () => ipcRenderer.invoke('get-worker-status'),
    toggleWorker: (start, serverUrl) => ipcRenderer.invoke('toggle-worker', start, serverUrl),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),
    onWorkerStatus: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('worker-status', handler);
        return () => ipcRenderer.removeListener('worker-status', handler);
    },
    onWorkerMessage: (callback) => {
        const handler = (_, msg) => callback(msg);
        ipcRenderer.on('worker-message', handler);
        ipcRenderer.send('worker-message-listener-ready');
        return () => ipcRenderer.removeListener('worker-message', handler);
    },
    sendWorkerReply: (msgType, data) => ipcRenderer.invoke('worker-reply', msgType, data),
    markSubmittedJob: (jobId) => ipcRenderer.invoke('mark-submitted-job', jobId)
});
