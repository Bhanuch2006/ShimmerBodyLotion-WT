const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
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
        ipcRenderer.send('worker-message-listener-ready');
        ipcRenderer.on('worker-message', handler);
        return () => ipcRenderer.removeListener('worker-message', handler);
    },
    sendWorkerReply: (msgType, data) => ipcRenderer.invoke('worker-reply', msgType, data),
    markSubmittedJob: (jobId) => ipcRenderer.invoke('mark-submitted-job', jobId)
});
