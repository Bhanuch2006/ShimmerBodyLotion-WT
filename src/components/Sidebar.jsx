import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

const Sidebar = () => {
    const { connected } = useSocket();
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'coquette');
    const [workerOn, setWorkerOn] = useState(false);
    const [sysInfo, setSysInfo] = useState({ cpu: '—', cores: '—', mem: '—', plat: '—' });

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.getSystemInfo().then(i => {
                setSysInfo({
                    cpu: (i.cpuModel || '').split('@')[0].trim().substring(0, 18),
                    cores: i.cpuCores,
                    mem: i.totalMemory + ' GB',
                    plat: i.platform
                });
            });
            window.electronAPI.onWorkerStatus(r => setWorkerOn(r));
        }
    }, []);

    const handleThemeChange = (newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        document.body.setAttribute('data-theme', newTheme);
        // Dispatch custom event if App.jsx needs to know, but we bound it to document earlier so we're fine
    };

    const toggleWorker = async (e) => {
        const checked = e.target.checked;
        if (window.electronAPI) {
            await window.electronAPI.toggleWorker(checked, 'http://localhost:3000');
            setWorkerOn(checked);
        }
    };

    return (
        <aside className="side">
            <div className="logo-wrap">
                <div className="logo-icon">
                    <span className="default-logo">🎀</span>
                    <img src="/assets/dino.png" alt="Dino" className="dino-logo" style={{ display: theme === 'pink' ? 'block' : 'none' }} />
                </div>
                <div className="dino-ground"></div>
                <h2>Cloud Archive</h2>
                <p>Lace & Ribbon Network</p>
            </div>

            <nav className="nav">
                <NavLink to="/" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>🎀</span>The Archive</NavLink>
                <NavLink to="/submit" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>💌</span>Exchange Letters</NavLink>
                <NavLink to="/workers" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>🦢</span>Companions</NavLink>
                <NavLink to="/jobs" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>📜</span>The Ledger</NavLink>
                <NavLink to="/connect" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>🗝️</span>Extend Horizon</NavLink>
            </nav>

            <div className="theme-box">
                <h3>Theme</h3>
                <div className="theme-row">
                    <button className={`theme-btn t-dark ${theme === 'dark' ? 'active' : ''}`} title="Dark" onClick={() => handleThemeChange('dark')}></button>
                    <button className={`theme-btn t-light ${theme === 'light' ? 'active' : ''}`} title="Light" onClick={() => handleThemeChange('light')}></button>
                    <button className={`theme-btn t-pink ${theme === 'pink' ? 'active' : ''}`} title="Pink" onClick={() => handleThemeChange('pink')}></button>
                    <button className={`theme-btn t-coquette ${theme === 'coquette' ? 'active' : ''}`} title="Coquette" onClick={() => handleThemeChange('coquette')}></button>
                </div>
            </div>

            <div className="wbox" id="wbox">
                <h3>Share Compute</h3>
                <div className="trow">
                    <span>Worker</span>
                    <label className="sw">
                        <input type="checkbox" checked={workerOn} onChange={toggleWorker} />
                        <span className="sl"></span>
                    </label>
                </div>
                <div className="wstat">
                    <div className={`dot ${workerOn ? 'on' : ''}`}></div>
                    <span>{workerOn ? 'Online — Sharing compute' : 'Offline'}</span>
                </div>
            </div>

            <div className="sysbox" id="sysbox">
                <h4>System</h4>
                <div className="sr"><span>CPU</span><span>{sysInfo.cpu}</span></div>
                <div className="sr"><span>Cores</span><span>{sysInfo.cores}</span></div>
                <div className="sr"><span>Memory</span><span>{sysInfo.mem}</span></div>
                <div className="sr"><span>Platform</span><span>{sysInfo.plat}</span></div>
            </div>
        </aside>
    );
};

export default Sidebar;
