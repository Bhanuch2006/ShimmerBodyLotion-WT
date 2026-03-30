import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const navItems = [
    { to: '/', label: 'Dashboard', tag: '01' },
    { to: '/submit', label: 'Submit Task', tag: '02' },
    { to: '/workers', label: 'Connected Devices', tag: '03' },
    { to: '/jobs', label: 'Submitted Tasks', tag: '04' }
];

const shortHost = (url) => {
    try {
        return new URL(url).host;
    } catch (error) {
        return url?.replace(/^https?:\/\//, '') || 'not set';
    }
};

const Sidebar = ({ isHidden = false }) => {
    const { connected, currentUrl } = useSocket();
    const theme = useTheme();
    const [workerOn, setWorkerOn] = useState(false);
    const [sysInfo, setSysInfo] = useState({ cpu: '--', cores: '--', mem: '--', plat: '--' });

    useEffect(() => {
        if (!window.electronAPI) {
            return;
        }

        window.electronAPI.getSystemInfo().then((info) => {
            setSysInfo({
                cpu: (info.cpuModel || '').split('@')[0].trim().substring(0, 22) || '--',
                cores: info.cpuCores || '--',
                mem: info.totalMemory ? `${info.totalMemory} GB` : '--',
                plat: info.platform || '--'
            });
        });

        window.electronAPI.onWorkerStatus((running) => setWorkerOn(running));
    }, []);

    const handleThemeChange = () => {
        const nextTheme = theme === 'coquette' ? 'black' : 'coquette';
        localStorage.setItem('theme', nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
        document.body.setAttribute('data-theme', nextTheme);
        window.dispatchEvent(new Event('themechange'));
    };

    const toggleWorker = async (event) => {
        const checked = event.target.checked;

        if (!window.electronAPI) {
            return;
        }

        await window.electronAPI.toggleWorker(checked, currentUrl);
        setWorkerOn(checked);
    };

    return (
        <header className={`floating-nav-wrap${isHidden ? ' is-hidden' : ''}`}>
            <div className="floating-nav">
                <div className="floating-brand">
                    <div className="logo-icon nav-logo" aria-hidden="true">
                        <span className="default-logo">wand</span>
                        <span className="logo-spark logo-spark-a"></span>
                        <span className="logo-spark logo-spark-b"></span>
                    </div>
                </div>

                <nav className="nav floating-nav-list">
                    {navItems.map((item) => (
                        <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'on nav-pill' : 'nav-pill')}>
                            <span className="ni" aria-hidden="true">{item.tag}</span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="floating-actions">
                    <button
                        className={`nav-pill nav-theme-pill ${theme === 'black' ? 'black-mode' : 'girly-mode'}`}
                        onClick={handleThemeChange}
                    >
                        <span className="ni" aria-hidden="true">05</span>
                        <span>{theme === 'coquette' ? 'Girly Pop' : 'Dark Theme'}</span>
                    </button>
                </div>
            </div>

            <div className="nav-meta-row">
                <div className="nav-meta-pill">
                    <span className={`dot ${connected ? 'on' : ''}`}></span>
                    <span>{connected ? shortHost(currentUrl) : 'offline'}</span>
                </div>
                <div className="nav-meta-pill">
                    <span>{workerOn ? 'worker on' : 'worker off'}</span>
                    <label className="sw">
                        <input type="checkbox" checked={workerOn} onChange={toggleWorker} />
                        <span className="sl"></span>
                    </label>
                </div>
                <div className="nav-meta-pill nav-system-pill">
                    <span>{sysInfo.cores} cores</span>
                    <span>{sysInfo.mem}</span>
                    <span>{sysInfo.plat}</span>
                </div>
            </div>
        </header>
    );
};

export default Sidebar;
