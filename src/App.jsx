import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SocketProvider, useSocket } from './context/SocketContext';
import './index.css';

import Dashboard from './pages/Dashboard';
import SubmitJob from './pages/SubmitJob';
import Workers from './pages/Workers';
import Jobs from './pages/Jobs';
import ConnectDevice from './pages/ConnectDevice';
import Sidebar from './components/Sidebar';
import GlitterTrail from './components/GlitterTrail';
import NetworkCanvas from './components/NetworkCanvas';
import CustomCursor from './components/CustomCursor';
import JobOfferModal from './components/JobOfferModal';
import { useTheme } from './hooks/useTheme';

const WindowControls = () => {
    const handleWindowAction = (action) => {
        if (window.electronAPI) {
            window.electronAPI[action]();
            return;
        }

        if (action === 'close') {
            window.close();
        }
    };

    return (
        <div className="tbar">
            <div className="tbar-brand">
                <div className="ico" aria-hidden="true">
                    <span className="ico-core"></span>
                    <span className="ico-spark ico-spark-a"></span>
                    <span className="ico-spark ico-spark-b"></span>
                </div>
                <div className="tbar-copy">
                    <strong>Shimmer Dispatch</strong>
                    <span>cloud letters for shared compute</span>
                </div>
            </div>
            <div className="tbar-btns">
                <button className="tb" aria-label="Minimize" onClick={() => handleWindowAction('minimize')}>
                    <span className="tb-icon tb-min"></span>
                </button>
                <button className="tb" aria-label="Maximize" onClick={() => handleWindowAction('maximize')}>
                    <span className="tb-icon tb-max"></span>
                </button>
                <button className="tb x" aria-label="Close" onClick={() => handleWindowAction('close')}>
                    <span className="tb-icon tb-close"></span>
                </button>
            </div>
        </div>
    );
};

const AppLayout = () => {
    const { connected, currentUrl } = useSocket();
    const mainRef = useRef(null);
    const [navHidden, setNavHidden] = useState(false);

    useEffect(() => {
        const mainElement = mainRef.current;
        if (!mainElement) {
            return undefined;
        }

        let lastScrollTop = 0;

        const handleScroll = () => {
            const nextScrollTop = mainElement.scrollTop;
            const scrollingDown = nextScrollTop > lastScrollTop;
            const farEnoughToHide = nextScrollTop > 90;

            if (scrollingDown && farEnoughToHide) {
                setNavHidden(true);
            } else if (!scrollingDown || nextScrollTop <= 24) {
                setNavHidden(false);
            }

            lastScrollTop = nextScrollTop;
        };

        mainElement.addEventListener('scroll', handleScroll, { passive: true });
        return () => mainElement.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="app">
            <Sidebar isHidden={navHidden} />

            <main className="main" ref={mainRef}>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/submit" element={<SubmitJob />} />
                    <Route path="/workers" element={<Workers />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/connect" element={<ConnectDevice />} />
                </Routes>
            </main>

            <div className={`cst ${connected ? '' : 'off'}`} id="cst">
                <span className="cst-dot"></span>
                {connected ? `Connected to ${currentUrl}` : 'Disconnected from cluster'}
            </div>
            <div className="toast-box" id="toasts"></div>
        </div>
    );
};

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Boundary error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-shell">
                    <h2>Something slipped off the board.</h2>
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
            <JobOfferModal />
            <SocketProvider>
                <Router>
                    <div className="app-root" data-theme={theme}>
                        <WindowControls />
                        <AppLayout />
                    </div>
                </Router>
            </SocketProvider>
        </ErrorBoundary>
    );
}

export default App;
