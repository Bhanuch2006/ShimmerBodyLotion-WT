import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useSocket } from '../context/SocketContext';

const SubmitJob = () => {
    const theme = useTheme();
    const { currentUrl } = useSocket();
    const [files, setFiles] = useState([]);
    const [description, setDescription] = useState('');
    const [resources, setResources] = useState({ cpu: 1, ram: 0.5, gpu: false });
    const [isOver, setIsOver] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const fileInputRef = useRef(null);
    const navigate = useNavigate();

    const getSubmitterIdentity = async () => {
        if (window.electronAPI?.getSystemInfo) {
            try {
                const info = await window.electronAPI.getSystemInfo();
                if (info?.hostname) {
                    return {
                        clientId: `host:${info.hostname}`,
                        hostname: info.hostname
                    };
                }
            } catch {}
        }

        const key = 'submitter_client_id';
        const existing = localStorage.getItem(key);
        if (existing) {
            return { clientId: existing, hostname: null };
        }
        const generated = `web:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(key, generated);
        return { clientId: generated, hostname: null };
    };

    // Resource Estimation Effect
    useEffect(() => {
        const calculateResources = async () => {
            let totalMB = 0;
            let needsGpu = false;

            for (const f of files) {
                totalMB += f.size / (1024 * 1024);
                if (f.name.endsWith('.py')) {
                    const text = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = () => resolve('');
                        reader.readAsText(f);
                    });
                    if (text.includes('import torch') || text.includes('import tensorflow') ||
                        text.includes('from torch') || text.includes('from tensorflow')) {
                        needsGpu = true;
                    }
                }
            }

            // Calculation based on numerical strategy
            let newCpu = 1 + Math.floor(totalMB / 50);
            let newRam = 0.5 + (totalMB * 3) / 1024; // MB to GB
            if (needsGpu) newRam = Math.max(newRam, 4.0); // bump base RAM if GPU task

            setResources({
                cpu: newCpu,
                ram: newRam.toFixed(2),
                gpu: needsGpu
            });
        };

        calculateResources();
    }, [files]);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsOver(false);
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.py') || f.name.endsWith('.csv'));
        addFiles(droppedFiles);
    };

    const handleFileInput = (e) => {
        const selectedFiles = Array.from(e.target.files);
        addFiles(selectedFiles);
        e.target.value = null; // reset
    };

    const addFiles = (newFiles) => {
        setFiles(prev => {
            const temp = [...prev];
            newFiles.forEach(nf => {
                if (!temp.some(existing => existing.name === nf.name)) {
                    temp.push(nf);
                }
            });
            return temp;
        });
    };

    const removeFile = (idx) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const submitJob = async () => {
        if (!files.length || !description.trim()) return;
        
        if (!currentUrl) {
            alert('Server URL not configured. Please check your connection.');
            return;
        }

        setSubmitting(true);
        try {
            // First, check if server is reachable
            console.log(`[SubmitJob] Testing connection to ${currentUrl}/api/health...`);
            try {
                const healthCheck = await axios.get(`${currentUrl}/api/health`, { timeout: 5000 });
                console.log('[SubmitJob] ✅ Server is healthy:', healthCheck.data);
            } catch (healthErr) {
                console.warn('[SubmitJob] ⚠️ Server health check failed:', healthErr.message);
                console.warn('[SubmitJob] Continuing anyway...');
            }

            const fd = new FormData();
            files.forEach(f => fd.append('files', f));

            console.log(`[SubmitJob] Uploading ${files.length} files to ${currentUrl}/upload`);
            const uploadRes = await axios.post(`${currentUrl}/upload`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000
            });
            console.log('[SubmitJob] ✅ Files uploaded:', uploadRes.data.files);

            // Submit the job
            console.log(`[SubmitJob] Submitting job to ${currentUrl}/submit-job`);
            const { clientId: submitterClientId, hostname: submitterHostname } = await getSubmitterIdentity();
            const submitRes = await axios.post(`${currentUrl}/submit-job`, {
                description: description.trim(),
                files: uploadRes.data.files,
                resources_required: { ...resources },
                submitterClientId,
                submitterHostname
            }, { timeout: 10000 });

            if (window.electronAPI?.markSubmittedJob && submitRes?.data?.jobId) {
                await window.electronAPI.markSubmittedJob(submitRes.data.jobId);
            }

            console.log('[SubmitJob] ✅ Job submitted successfully!');
            setFiles([]);
            setDescription('');
            navigate('/');
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            const statusCode = error.response?.status;
            
            let detailedError = errorMsg;
            if (error.code === 'ECONNABORTED') {
                detailedError = 'Request timeout - server is not responding';
            } else if (error.code === 'ENOTFOUND') {
                detailedError = 'Server domain not found - check the URL';
            } else if (error.message === 'Network Error') {
                detailedError = 'Network error - check your internet connection and firewall settings';
            }
            
            console.error('[SubmitJob] ❌ Error:', {
                message: errorMsg,
                status: statusCode,
                url: currentUrl,
                code: error.code,
                error: error
            });
            
            alert(`Error submitting job (${statusCode || 'network error'})\n\nServer: ${currentUrl}\nError: ${detailedError}\n\nCheck the browser console (F12) for more details.`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="sec on" id="sec-submit">
            <h1 className="stitle">Exchange Letters</h1>
            <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Task Description *</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Explain what this task is doing (e.g., Training a CNN on Medical Data)..."
                        style={{ width: '100%', height: '80px', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-0)', color: 'var(--text)', fontFamily: 'inherit' }}
                        required
                    />
                </div>

                <h1 className="stitle"><span className="t-ico" data-type="submit"></span> {theme === 'coquette' ? 'Exchange Letters' : 'Submit Tasks'}</h1>
                <div className="card">
                    <div
                        className={`dz ${isOver ? 'over' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{ marginBottom: '20px' }}
                    >
                        <div className="dz-i">📁</div>
                        <p>Drag & drop files or click to browse</p>
                        <p className="h">Python scripts (.py) and datasets (.csv)</p>
                        <input
                            type="file"
                            ref={fileInputRef}
                            multiple
                            accept=".py,.csv"
                            hidden
                            onChange={handleFileInput}
                        />
                    </div>

                    <div className="dgrid">
                        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', background: 'var(--bg-0)' }}>
                            <h4 style={{ marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>Attached Files</h4>
                            {files.length === 0 ? (
                                <p style={{ color: 'var(--text-m)', fontSize: '12px' }}>No files added yet.</p>
                            ) : (
                                files.map((file, idx) => (
                                    <div className="fi" key={idx} style={{ padding: '6px 10px', margin: '4px 0' }}>
                                        <span>{file.name.endsWith('.py') ? '🐍' : '📄'} {file.name} ({(file.size / 1024).toFixed(1)}KB)</span>
                                        <button className="fr" onClick={(e) => { e.stopPropagation(); removeFile(idx); }}>✕</button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', background: 'var(--bg-0)' }}>
                            <h4 style={{ marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>Estimated Resources</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-m)' }}>CPU Cores:</span>
                                    <strong>{resources.cpu}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-m)' }}>RAM Requirement:</span>
                                    <strong>{resources.ram} GB</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-m)' }}>GPU Accelerated:</span>
                                    <strong style={{ color: resources.gpu ? 'var(--ok)' : 'var(--text)' }}>
                                        {resources.gpu ? 'Yes (Detected ML Framework)' : 'No'}
                                    </strong>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button
                            className="btn btn-p"
                            onClick={submitJob}
                            disabled={!files.length || submitting || !description.trim()}
                        >
                            {submitting ? '⏳ Dispatching...' : '💌 Submit Tasks'}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default SubmitJob;
