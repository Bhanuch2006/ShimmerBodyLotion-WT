import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const Sidebar = () => {
    const { connected } = useSocket();
    const theme = useTheme();
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
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        document.body.setAttribute('data-theme', newTheme);
        window.dispatchEvent(new Event('themechange'));
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
                <div className="logo-icon" style={{ background: theme === 'coquette' ? '' : 'transparent', border: theme === 'coquette' ? '' : '1px solid rgba(255,255,255,0.1)' }}>
                    <span className="default-logo">{theme === 'coquette' ? '🎀' : '🌌'}</span>
                    <img src="/assets/dino.png" alt="Dino" className="dino-logo" style={{ display: theme === 'pink' ? 'block' : 'none' }} />
                </div>
                <div className="dino-ground"></div>
                <h2>{theme === 'coquette' ? 'Cloud Archive' : 'Compute Core'}</h2>
                <p>{theme === 'coquette' ? 'Lace & Ribbon Network' : 'Distributed Processing'}</p>
            </div>

            <nav className="nav">
                <NavLink to="/" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>{theme === 'coquette' ? '🎀' : '🌌'}</span>{theme === 'coquette' ? 'The Archive' : 'Dashboard'}</NavLink>
                <NavLink to="/submit" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>{theme === 'coquette' ? '💌' : '🛰️'}</span>{theme === 'coquette' ? 'Exchange Letters' : 'Submit Tasks'}</NavLink>
                <NavLink to="/workers" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>{theme === 'coquette' ? '🦢' : '🛸'}</span>{theme === 'coquette' ? 'Companions' : 'Connected Devices'}</NavLink>
                <NavLink to="/jobs" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>{theme === 'coquette' ? '📜' : '📡'}</span>{theme === 'coquette' ? 'The Ledger' : 'Submitted Jobs'}</NavLink>
                <NavLink to="/connect" className={({ isActive }) => (isActive ? "on" : "")}><span className="ni" style={{ fontFamily: 'sans-serif' }}>{theme === 'coquette' ? '🗝️' : '🪐'}</span>{theme === 'coquette' ? 'Extend Horizon' : 'How to'}</NavLink>
            </nav>

            <div className="theme-box">
                <button 
                    className={`modern-theme-switch ${theme === 'black' ? 'black-mode' : 'girly-mode'}`}
                    onClick={() => handleThemeChange(theme === 'coquette' ? 'black' : 'coquette')}
                >
                    <span className="sw-icon">{theme === 'coquette' ? '🎀' : '🌙'}</span>
                    <span className="sw-text">{theme === 'coquette' ? 'Girly Pop' : 'Dark Mode'}</span>
                </button>
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
