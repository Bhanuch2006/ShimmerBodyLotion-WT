import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';

const ConnectDevice = () => {
    const { connectToNetwork, currentUrl } = useSocket();
    const [joinIp, setJoinIp] = useState('');
    const [networkInfo, setNetworkInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        if (!currentUrl) {
            setLoading(false);
            return undefined;
        }

        axios.get(`${currentUrl}/api/network-info`)
            .then((response) => {
                if (!isMounted) {
                    return;
                }

                setNetworkInfo(response.data);
                setLoading(false);
            })
            .catch(() => {
                if (isMounted) {
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [currentUrl]);

    const handleJoin = () => {
        if (!joinIp.trim()) {
            return;
        }

        connectToNetwork(joinIp.trim());
    };

    const copyText = (text) => {
        navigator.clipboard.writeText(text);
    };

    const primaryAddress = networkInfo?.addresses?.[0];
    const workerCommand = primaryAddress
        ? `set SERVER_URL=http://${primaryAddress.address}:${networkInfo.port} && node worker.js`
        : '';

    return (
        <section className="sec connect-page" id="sec-connect">
            <div className="page-hero">
                <div>
                    <p className="eyebrow">connect</p>
                    <h1 className="stitle">Connect guide</h1>
                    <p className="hero-copy">
                        Cleaner instructions for joining another server or adding more devices to this one.
                    </p>
                </div>
            </div>

            <div className="connect-grid">
                <article className="conn-card join-card">
                    <p className="eyebrow">join a network</p>
                    <h2 className="card-title">Point this app at another server</h2>
                    <p className="connect-copy">
                        Paste a server address and this board will switch over to that cluster.
                    </p>
                    <div className="join-row">
                        <input
                            type="text"
                            value={joinIp}
                            onChange={(event) => setJoinIp(event.target.value)}
                            placeholder="http://192.168.1.X:3000"
                        />
                        <button className="btn btn-p" onClick={handleJoin}>Join room</button>
                    </div>
                </article>

                <article className="conn-card server-card">
                    <p className="eyebrow">your server</p>
                    <h2 className="card-title">Share this address with others</h2>
                    {loading ? (
                        <div className="loading-card">
                            <span className="spark-loader" aria-hidden="true">
                                <span></span>
                                <span></span>
                                <span></span>
                            </span>
                            <span>Looking for network addresses...</span>
                        </div>
                    ) : !networkInfo || networkInfo.addresses.length === 0 ? (
                        <p className="empty">No network interfaces found.</p>
                    ) : (
                        <div className="address-list" id="ipList">
                            {networkInfo.addresses.map((address) => (
                                <div className="address-row" key={`${address.name}-${address.address}`}>
                                    <span>{address.name}</span>
                                    <strong>{address.address}:{networkInfo.port}</strong>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="conn-card steps-card">
                    <p className="eyebrow">remote worker setup</p>
                    <h2 className="card-title">Bring another computer into the cloud</h2>
                    <div className="step-list">
                        <div className="conn-step">
                            <div className="conn-num">1</div>
                            <div className="conn-text">
                                Install <strong>Node.js</strong> on the remote machine from <a href="https://nodejs.org">nodejs.org</a>.
                            </div>
                        </div>
                        <div className="conn-step">
                            <div className="conn-num">2</div>
                            <div className="conn-text">
                                Copy <code>worker.js</code> and <code>package.json</code>, then run <code>npm install</code>.
                            </div>
                        </div>
                        <div className="conn-step">
                            <div className="conn-num">3</div>
                            <div className="conn-text">
                                Start the worker with your server address.
                            </div>
                        </div>
                    </div>

                    {workerCommand && (
                        <div className="cmd-box">
                            <span>{workerCommand}</span>
                            <button className="copy" onClick={() => copyText(workerCommand)}>copy</button>
                        </div>
                    )}

                    <div className="conn-step">
                        <div className="conn-num">4</div>
                        <div className="conn-text">
                            Allow Node.js through your firewall so task offers can reach the device.
                        </div>
                    </div>
                </article>

                <article className="conn-card internet-card">
                    <p className="eyebrow">internet option</p>
                    <h2 className="card-title">Share outside your local network</h2>
                    <p className="connect-copy">
                        Use port forwarding for port 3000 or tunnel the app with a tool like this:
                    </p>
                    <div className="cmd-box">
                        <span>npx localtunnel --port 3000</span>
                        <button className="copy" onClick={() => copyText('npx localtunnel --port 3000')}>copy</button>
                    </div>
                </article>
            </div>
        </section>
    );
};

export default ConnectDevice;
