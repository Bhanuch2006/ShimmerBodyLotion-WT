import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { SocketProvider, useSocket } from './context/SocketContext';
import './index.css';

// Pages
import Dashboard from './pages/Dashboard';
import SubmitJob from './pages/SubmitJob';
import Workers from './pages/Workers';
import Jobs from './pages/Jobs';
import ConnectDevice from './pages/ConnectDevice';
import Sidebar from './components/Sidebar';
import GlitterTrail from './components/GlitterTrail';
import NetworkCanvas from './components/NetworkCanvas';
import CustomCursor from './components/CustomCursor';
import { useTheme } from './hooks/useTheme';

// Window Controls Component (Electron)
const WindowControls = () => {
    const wctl = (action) => {
        if (window.electronAPI) window.electronAPI[action]();
        else if (action === 'close') window.close();
    };

    return (
        <div className="tbar">
            <div className="tbar-brand">
                <div className="ico">⚡</div>
                <span>SharingIsCaring</span>
            </div>
            <div className="tbar-btns">
                <button className="tb" onClick={() => wctl('minimize')}>─</button>
                <button className="tb" onClick={() => wctl('maximize')}>□</button>
                <button className="tb x" onClick={() => wctl('close')}>✕</button>
            </div>
        </div>
    );
};

// Layout component to use Socket context
const AppLayout = () => {
    const { connected, currentUrl } = useSocket();
    
    // Toasts placeholder structure (a robust app would use a toast library like react-hot-toast)
    // Here we'll just keep the existing connection status pill
    return (
        <div className="app">
            <Sidebar />
            
            <main className="main">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/submit" element={<SubmitJob />} />
                    <Route path="/workers" element={<Workers />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/connect" element={<ConnectDevice />} />
                </Routes>
            </main>

            <div className={`cst ${connected ? '' : 'off'}`} id="cst">
                ● {connected ? `Connected: ${currentUrl}` : 'Disconnected'}
            </div>
            <div className="toast-box" id="toasts"></div>
        </div>
    );
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, errorInfo) { console.error("Boundary Error:", error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', background: '#1c1c1c', color: '#ff8da1', fontFamily: 'monospace' }}>
                    <h2>Something went wrong in the Dashboard...</h2>
                    <pre>{this.state.error?.toString()}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

function App() {
    const theme = useTheme();

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <ErrorBoundary>
            <CustomCursor theme={theme} />
            <GlitterTrail theme={theme} />
            <NetworkCanvas theme={theme} />
            <SocketProvider>
                <Router>
                    <div data-theme={theme} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                        <WindowControls />
                        <AppLayout />
                    </div>
                </Router>
            </SocketProvider>
        </ErrorBoundary>
    );
}

export default App;
