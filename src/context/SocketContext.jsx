import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    // Start with localhost - this is the default for dev/Electron
    const [currentUrl, setCurrentUrl] = useState('http://localhost:3000');
    
    // Global state arrays updated directly by socket events
    const [workers, setWorkers] = useState([]);
    const [jobs, setJobs] = useState([]);

    useEffect(() => {
        // Try to get server URL from Electron config on mount
        if (window.electronAPI?.getServerUrl) {
            console.log('[SocketContext] Getting server URL from Electron...');
            window.electronAPI.getServerUrl()
                .then(url => {
                    if (url) {
                        console.log(`[SocketContext] Loaded server URL: ${url}`);
                        setCurrentUrl(url);
                    } else {
                        console.log('[SocketContext] No URL from Electron, using default: http://localhost:3000');
                    }
                })
                .catch(err => {
                    console.warn('[SocketContext] Failed to get server URL, using default:', err);
                });
        } else {
            console.log('[SocketContext] Not in Electron, using default: http://localhost:3000');
        }
    }, []);
    const [stats, setStats] = useState({
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        runningJobs: 0,
        queuedJobs: 0,
        activeWorkers: 0,
        totalWorkers: 0,
        totalCreditsEarned: 0,
        avgTrustScore: 0,
        successRate: 0
    });

    useEffect(() => {
        const newSocket = io(currentUrl);
        setSocket(newSocket);

        newSocket.on('connect', () => setConnected(true));
        newSocket.on('disconnect', () => setConnected(false));
        
        newSocket.on('update', (data) => {
            if (data.workers) setWorkers(data.workers);
            if (data.jobs) setJobs(data.jobs);
            if (data.stats) setStats(data.stats);
        });

        return () => newSocket.disconnect();
    }, [currentUrl]);

    const connectToNetwork = (url) => {
        setCurrentUrl(url);
    };

    return (
        <SocketContext.Provider value={{ socket, connected, currentUrl, workers, jobs, stats, connectToNetwork }}>
            {children}
        </SocketContext.Provider>
    );
};
