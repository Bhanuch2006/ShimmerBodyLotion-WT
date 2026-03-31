import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const cuteNotes = [
    'Pin your Python and CSV goodies at the top first.',
    'Leave a clear note so the workers know what the job should do.',
    'Bigger files add more RAM automatically.',
    'Torch or TensorFlow files nudge the board toward GPU help.'
];

const formatFileSize = (file) => {
    const sizeInKb = file.size / 1024;
    if (sizeInKb < 1024) {
        return `${sizeInKb.toFixed(1)} KB`;
    }

    return `${(sizeInKb / 1024).toFixed(2)} MB`;
};

const SubmitJob = () => {
    const { currentUrl } = useSocket();
    const theme = useTheme();
    const [files, setFiles] = useState([]);
    const [description, setDescription] = useState('');
    const [resources, setResources] = useState({ cpu: 1, ram: 0.5, gpu: false });
    const [isOver, setIsOver] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const getSubmitterIdentity = async () => {
        if (window.electronAPI?.getSystemInfo) {
            try {
                const info = await window.electronAPI.getSystemInfo();
                if (info?.hostname) {
                    return { clientId: `host:${info.hostname}`, hostname: info.hostname };
                }
            } catch {}
        }
        const key = 'submitter_client_id';
        const existing = localStorage.getItem(key);
        if (existing) return { clientId: existing, hostname: null };
        const generated = `web:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(key, generated);
        return { clientId: generated, hostname: null };
    };

    const fileInputRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const calculateResources = async () => {
            let totalMB = 0;
            let needsGpu = false;

            for (const file of files) {
                totalMB += file.size / (1024 * 1024);

                if (file.name.endsWith('.py')) {
                    const text = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (event) => resolve(event.target.result);
                        reader.onerror = () => resolve('');
                        reader.readAsText(file);
                    });

                    if (
                        text.includes('import torch') ||
                        text.includes('import tensorflow') ||
                        text.includes('from torch') ||
                        text.includes('from tensorflow')
                    ) {
                        needsGpu = true;
                    }
                }
            }

            let cpu = 1 + Math.floor(totalMB / 50);
            let ram = 0.5 + (totalMB * 3) / 1024;

            if (needsGpu) {
                ram = Math.max(ram, 4.0);
            }

            setResources({
                cpu,
                ram: ram.toFixed(2),
                gpu: needsGpu
            });
        };

        calculateResources();
    }, [files]);

    const addFiles = (newFiles) => {
        const acceptedFiles = newFiles.filter((file) => file.name.endsWith('.py') || file.name.endsWith('.csv'));

        setFiles((previousFiles) => {
            const nextFiles = [...previousFiles];

            acceptedFiles.forEach((newFile) => {
                if (!nextFiles.some((existingFile) => existingFile.name === newFile.name)) {
                    nextFiles.push(newFile);
                }
            });

            return nextFiles;
        });
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        setIsOver(true);
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        setIsOver(false);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsOver(false);
        addFiles(Array.from(event.dataTransfer.files));
    };

    const handleFileInput = (event) => {
        addFiles(Array.from(event.target.files));
        event.target.value = null;
    };

    const removeFile = (indexToRemove) => {
        setFiles((previousFiles) => previousFiles.filter((_, index) => index !== indexToRemove));
    };

    const submitJob = async () => {
        if (!files.length || !description.trim()) {
            return;
        }

        if (!currentUrl) {
            alert('Server URL not configured. Please check your connection.');
            return;
        }

        setSubmitting(true);

        try {
            try {
                await axios.get(`${currentUrl}/api/health`, { timeout: 5000 });
            } catch (healthError) {
                console.warn('[SubmitJob] Health check warning:', healthError.message);
            }

            const formData = new FormData();
            files.forEach((file) => formData.append('files', file));

            const uploadResponse = await axios.post(`${currentUrl}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000
            });

            const { clientId: submitterClientId, hostname: submitterHostname } = await getSubmitterIdentity();
            const submitRes = await axios.post(
                `${currentUrl}/submit-job`,
                {
                    description: description.trim(),
                    files: uploadResponse.data.files,
                    resources_required: { ...resources },
                    submitterClientId,
                    submitterHostname
                },
                { timeout: 60000 }
            );

            if (window.electronAPI?.markSubmittedJob && submitRes?.data?.jobId) {
                await window.electronAPI.markSubmittedJob(submitRes.data.jobId);
            }

            setFiles([]);
            setDescription('');
            navigate('/');
        } catch (error) {
            const errorMessage = error.response?.data?.error || error.message;
            const statusCode = error.response?.status;

            let detailedError = errorMessage;
            if (error.code === 'ECONNABORTED') {
                detailedError = 'Request timeout - server is not responding.';
            } else if (error.code === 'ENOTFOUND') {
                detailedError = 'Server domain not found - check the URL.';
            } else if (error.message === 'Network Error') {
                detailedError = 'Network error - check your internet and firewall settings.';
            }

            alert(
                `Error submitting job (${statusCode || 'network error'})\n\nServer: ${currentUrl}\nError: ${detailedError}`
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="sec submit-page" id="sec-submit">
            <div className="page-hero">
                <div>
                    <p className="eyebrow">submit task</p>
                    <h1 className="stitle">{theme === 'coquette' ? 'Compose cloud note' : 'Compose task'}</h1>
                    <p className="hero-copy">
                        {theme === 'coquette'
                            ? 'Files stay pinned at the top, your task note sits below, and the whole page reads more like a cute compose window.'
                            : 'A cleaner compose layout with attachments on top and the task brief below, arranged more like an email draft.'}
                    </p>
                </div>
            </div>

            <div className="submit-layout">
                <article className="card chat-window mail-window">
                    <div className="chat-window-grid">
                        <div className="chat-stage">
                            <div className="compose-window-bar">
                                <div className="compose-window-dots" aria-hidden="true">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                                <div className="compose-window-title">
                                    <strong>{theme === 'coquette' ? 'Cloud note draft' : 'Task draft'}</strong>
                                    <span>{theme === 'coquette' ? 'attachments above, note below' : 'attachments first, brief below'}</span>
                                </div>
                                <div className="compose-window-tag">
                                    {theme === 'coquette' ? 'draft' : 'compose'}
                                </div>
                            </div>

                            <div className="compose-section-head">
                                <p className="eyebrow">attachments</p>
                                <span className="sl2">{theme === 'coquette' ? 'Pin files first' : 'Stage files first'}</span>
                            </div>

                            <div
                                className={`upload-box top-file-shelf ${isOver ? 'over' : ''}`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="upload-box-copy">
                                    <p className="eyebrow">file shelf</p>
                                    <h2 className="card-title">Drop files into the upper tray</h2>
                                    <p className="upload-copy">
                                        Click or drag files here. The shelf accepts `.py` and `.csv` files and keeps them pinned above your message.
                                    </p>
                                </div>
                                <button className="btn btn-secondary" type="button">
                                    Browse files
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    multiple
                                    accept=".py,.csv"
                                    hidden
                                    onChange={handleFileInput}
                                />
                            </div>

                            <div className="file-clouds">
                                {files.length === 0 ? (
                                    <div className="file-placeholder">
                                        <strong>{theme === 'coquette' ? 'No files pinned yet.' : 'No files staged yet.'}</strong>
                                        <span>{theme === 'coquette' ? 'Your upload shelf will fill with little cloud cards.' : 'Your upload tray will list the files queued for this task.'}</span>
                                    </div>
                                ) : (
                                    files.map((file, index) => (
                                        <div className="file-pill" key={`${file.name}-${index}`}>
                                            <div>
                                                <strong>{file.name}</strong>
                                                <span>{formatFileSize(file)}</span>
                                            </div>
                                            <button
                                                className="fr"
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    removeFile(index);
                                                }}
                                            >
                                                remove
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="composer-shell message-shell">
                                <div className="compose-section-head">
                                    <div>
                                        <label className="composer-label" htmlFor="job-message">description box</label>
                                        <span className="sl2">{theme === 'coquette' ? 'Write the task note below' : 'Write the task description below'}</span>
                                    </div>
                                </div>
                                <textarea
                                    id="job-message"
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    placeholder="Tell the workers what this task does, what success looks like, and any little details they should not miss..."
                                />

                                <div className="composer-footer">
                                    <button
                                        className={`btn btn-p ${submitting ? 'is-loading' : ''}`}
                                        onClick={submitJob}
                                        disabled={!files.length || submitting || !description.trim()}
                                    >
                                        {submitting && (
                                            <span className="spark-loader" aria-hidden="true">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </span>
                                        )}
                                        {submitting ? (theme === 'coquette' ? 'Sending cloud note' : 'Dispatching task') : (theme === 'coquette' ? 'Send to the clouds' : 'Dispatch task')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>

                <aside className="submit-side">
                    <article className="card sticky-card">
                        <p className="eyebrow">{theme === 'coquette' ? 'cute notes' : 'field notes'}</p>
                        <h2 className="card-title">{theme === 'coquette' ? 'Little reminders on the side' : 'Quick reminders on the side'}</h2>
                        <div className="sticky-list">
                            {cuteNotes.map((note) => (
                                <div className="sticky-note" key={note}>
                                    {note}
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="card resource-card">
                        <p className="eyebrow">resource sketch</p>
                        <h2 className="card-title">Estimated fit</h2>
                        <div className="resource-list">
                            <div className="resource-row"><span>CPU cores</span><strong>{resources.cpu}</strong></div>
                            <div className="resource-row"><span>RAM</span><strong>{resources.ram} GB</strong></div>
                            <div className="resource-row"><span>GPU</span><strong>{resources.gpu ? 'Suggested' : 'Not needed'}</strong></div>
                            <div className="resource-row"><span>Files pinned</span><strong>{files.length}</strong></div>
                        </div>
                    </article>
                </aside>
            </div>
        </section>
    );
};

export default SubmitJob;
