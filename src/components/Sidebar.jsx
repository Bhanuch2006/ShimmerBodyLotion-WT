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


const Sidebar = ({ isHidden = false }) => {
    const { currentUrl } = useSocket();

    const theme = useTheme();
    const [workerOn, setWorkerOn] = useState(false);
    const [isTogglingWorker, setIsTogglingWorker] = useState(false);
    const [sysInfo, setSysInfo] = useState({ cpu: '--', cores: '--', mem: '--', plat: '--' });

    useEffect(() => {
        if (!window.electronAPI) {
            return;
        }

        let mounted = true;

        window.electronAPI.getSystemInfo().then((info) => {
            if (!mounted) {
                return;
            }
            setSysInfo({
                cpu: (info.cpuModel || '').split('@')[0].trim().substring(0, 22) || '--',
                cores: info.cpuCores || '--',
                mem: info.totalMemory ? `${info.totalMemory} GB` : '--',
                plat: info.platform || '--'
            });
        });

        window.electronAPI.getWorkerStatus().then((running) => {
            if (mounted) {
                setWorkerOn(Boolean(running));
            }
        });

        const cleanupWorkerStatus = window.electronAPI.onWorkerStatus((running) => {
            if (mounted) {
                setWorkerOn(running);
                setIsTogglingWorker(false);
            }
        });

        return () => {
            mounted = false;
            if (typeof cleanupWorkerStatus === 'function') {
                cleanupWorkerStatus();
            }
        };
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

        setIsTogglingWorker(true);

        try {
            const result = await window.electronAPI.toggleWorker(checked, currentUrl);
            if (result?.status === 'already-running') {
                setWorkerOn(true);
            } else if (result?.status === 'already-stopped') {
                setWorkerOn(false);
            } else if (result?.status !== 'started' && result?.status !== 'stopped') {
                setWorkerOn(false);
            }
        } finally {
            setIsTogglingWorker(false);
        }
    };

    return (
        <header className={`floating-nav-wrap${isHidden ? ' is-hidden' : ''}`}>
            <div className="floating-nav">
                <div className="floating-brand">
                    <img src="/src/assets/logo.png" alt="Core&Graphics" className="nav-logo" />
                    <span className="brand-name">Core&Graphics</span>
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
                    <span>{workerOn ? 'worker on' : 'worker off'}</span>
                    <label className="sw">
                        <input type="checkbox" checked={workerOn} onChange={toggleWorker} disabled={isTogglingWorker} />
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
