import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const DEFAULT_URL = "https://shimmerbodylotion-wt.onrender.com";

    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);

    // Global state
    const [workers, setWorkers] = useState([]);
    const [jobs, setJobs] = useState([]);
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

    // 🔥 SAFE Electron override (won't break if invalid)
    useEffect(() => {
        const initUrl = async () => {
            try {
                if (window.electronAPI?.getServerUrl) {
                    const url = await window.electronAPI.getServerUrl();

                    if (url && url.startsWith("http")) {
                        console.log("[Socket] Using Electron-provided URL:", url);
                        setCurrentUrl(url);
                    } else {
                        console.log("[Socket] Invalid Electron URL, using default:", DEFAULT_URL);
                        setCurrentUrl(DEFAULT_URL);
                    }
                } else {
                    console.log("[Socket] No Electron API, using default:", DEFAULT_URL);
                }
            } catch (err) {
                console.log("[Socket] Error fetching Electron URL, fallback to default:", DEFAULT_URL);
                setCurrentUrl(DEFAULT_URL);
            }
        };

        initUrl();
    }, []);

    // 🔌 Socket connection
    useEffect(() => {
        if (!currentUrl) return;

        console.log("[Socket] Connecting to:", currentUrl);

        const newSocket = io(currentUrl, {
            transports: ["websocket"], // more stable
            reconnection: true
        });

        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log("[Socket] Connected");
            setConnected(true);
        });

        newSocket.on('disconnect', () => {
            console.log("[Socket] Disconnected");
            setConnected(false);
        });

        newSocket.on('update', (data) => {
            if (data.workers) setWorkers(data.workers);
            if (data.jobs) setJobs(data.jobs);
            if (data.stats) setStats(data.stats);
        });

        return () => {
            console.log("[Socket] Cleaning up socket");
            newSocket.disconnect();
        };
    }, [currentUrl]);

    // 🔍 Debug current URL
    useEffect(() => {
        console.log("🌐 FINAL currentUrl:", currentUrl);
    }, [currentUrl]);

    const connectToNetwork = (url) => {
        if (url && url.startsWith("http")) {
            console.log("[Socket] Manually switching to:", url);
            setCurrentUrl(url);
        } else {
            console.warn("[Socket] Invalid URL ignored:", url);
        }
    };

    return (
        <SocketContext.Provider
            value={{
                socket,
                connected,
                currentUrl,
                workers,
                jobs,
                stats,
                connectToNetwork
            }}
        >
            {children}
        </SocketContext.Provider>
    );
};