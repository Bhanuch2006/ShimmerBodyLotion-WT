import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const ConnectDevice = () => {
    const { connectToNetwork, currentUrl } = useSocket();
    const theme = useTheme();
    const [joinIp, setJoinIp] = useState('');
    const [networkInfo, setNetworkInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${currentUrl}/api/network-info`)
            .then(res => {
                setNetworkInfo(res.data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [currentUrl]);

    const handleJoin = () => {
        if (!joinIp) return;
        connectToNetwork(joinIp);
        // Toast logic could go here
    };

    const copyText = (text) => {
        navigator.clipboard.writeText(text);
        // Toast logic could go here
    };

    return (
        <section className="sec on" id="sec-connect">
            <h1 className="stitle"><span className="t-ico" data-type="howto"></span> How to</h1>
            
            <div className="conn-card">
                <h3>🔗 Join a Network</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-m)', marginBottom: '12px' }}>
                    Enter the IP address of an existing server to join its cluster:
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                        type="text" 
                        value={joinIp}
                        onChange={(e) => setJoinIp(e.target.value)}
                        placeholder="http://192.168.1.X:3000" 
                        style={{
                            flex: 1, padding: '10px 14px', borderRadius: '8px', 
                            background: 'var(--bg-0)', border: '1px solid var(--border)', 
                            color: 'var(--text)', fontFamily: 'Inter', fontSize: '13px'
                        }} 
                    />
                    <button className="btn btn-p" onClick={handleJoin} style={{ padding: '10px 20px' }}>Join</button>
                </div>
            </div>

            <div className="conn-card">
                <h3>🖥️ Your Server</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-m)', marginBottom: '12px' }}>
                    Your server is accessible at:
                </p>
                <div id="ipList">
                    {loading ? (
                        <p className="empty">Loading network info...</p>
                    ) : !networkInfo || networkInfo.addresses.length === 0 ? (
                        <p className="empty">No network interfaces found</p>
                    ) : (
                        networkInfo.addresses.map((a, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ color: 'var(--text-m)', fontSize: '12px' }}>{a.name}</span>
                                <span className="ip-val">{a.address}:{networkInfo.port}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="conn-card">
                <h3>📡 Connect Another Computer</h3>
                <div className="conn-step">
                    <div className="conn-num">1</div>
                    <div className="conn-text"><strong>Install Node.js</strong> on the remote machine from <a href="https://nodejs.org" style={{ color: 'var(--accent)' }}>nodejs.org</a></div>
                </div>
                <div className="conn-step">
                    <div className="conn-num">2</div>
                    <div className="conn-text"><strong>Copy these files</strong> to the remote machine: <code style={{ color: 'var(--accent)' }}>worker.js</code> and <code style={{ color: 'var(--accent)' }}>package.json</code>, then run <code style={{ color: 'var(--accent)' }}>npm install</code></div>
                </div>
                <div className="conn-step">
                    <div className="conn-num">3</div>
                    <div className="conn-text"><strong>Run the worker</strong> with your server's IP address:</div>
                </div>
                {networkInfo?.addresses?.[0] && (
                    <div className="cmd-box">
                        <span>set SERVER_URL=http://{networkInfo.addresses[0].address}:{networkInfo.port} && node worker.js</span>
                        <button className="copy" onClick={() => copyText(`set SERVER_URL=http://${networkInfo.addresses[0].address}:${networkInfo.port} && node worker.js`)}>📋</button>
                    </div>
                )}
                <div className="conn-step" style={{ marginTop: '16px' }}>
                    <div className="conn-num">4</div>
                    <div className="conn-text"><strong>Allow through firewall:</strong> On Windows, allow Node.js in Windows Defender Firewall for private networks</div>
                </div>
            </div>

            <div className="conn-card">
                <h3>🌍 Over the Internet</h3>
                <div className="conn-text" style={{ fontSize: '13px' }}>
                    For internet access, use <strong>port forwarding</strong> on your router (forward port 3000) or use a tunnel like:<br />
                    <div className="cmd-box" style={{ marginTop: '8px' }}>
                        <span>npx localtunnel --port 3000</span>
                        <button className="copy" onClick={() => copyText('npx localtunnel --port 3000')}>📋</button>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ConnectDevice;
