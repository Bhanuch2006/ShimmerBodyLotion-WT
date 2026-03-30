import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    // Default to Render production URL - will be overridden by Electron config if available
    const [currentUrl, setCurrentUrl] = useState('https://shimmerbodylotion-wt.onrender.com');
    
    // Global state arrays updated directly by socket events
    const [workers, setWorkers] = useState([]);
    const [jobs, setJobs] = useState([]);

    useEffect(() => {
        // Try to get server URL from Electron config on mount
        if (window.electronAPI?.getServerUrl) {
            console.log('[SocketContext] Requesting server URL from Electron...');
            window.electronAPI.getServerUrl()
                .then(url => {
                    if (url) {
                        console.log(`[SocketContext] ✅ Loaded server URL from Electron config: ${url}`);
                        setCurrentUrl(url);
                    } else {
                        console.log('[SocketContext] No URL from config, using default Render: https://shimmerbodylotion-wt.onrender.com');
                    }
                })
                .catch(err => {
                    console.warn('[SocketContext] Failed to get server URL from Electron, using Render default:', err);
                });
        } else {
            console.log('[SocketContext] Not in Electron, using default Render: https://shimmerbodylotion-wt.onrender.com');
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
