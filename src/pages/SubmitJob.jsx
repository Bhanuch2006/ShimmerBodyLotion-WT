import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';

const SubmitJob = () => {
    const theme = useTheme();
    const [files, setFiles] = useState([]);
    const [isOver, setIsOver] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const fileInputRef = useRef(null);
    const navigate = useNavigate();

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
        if (!files.length) return;
        setSubmitting(true);
        try {
            const fd = new FormData();
            files.forEach(f => fd.append('files', f));
            
            // Assuming Express server proxies /upload or we call localhost:3000 directly
            const uploadRes = await axios.post('http://localhost:3000/upload', fd);
            await axios.post('http://localhost:3000/submit-job', { files: uploadRes.data.files });
            
            setFiles([]);
            navigate('/');
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className="sec on" id="sec-submit">
            <h1 className="stitle"><span className="t-ico" data-type="submit"></span> {theme === 'coquette' ? 'Exchange Letters' : 'Submit Tasks'}</h1>
            <div className="card">
                <div 
                    className={`dz ${isOver ? 'over' : ''}`} 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
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
                
                <div className="fl">
                    {files.map((file, idx) => (
                        <div className="fi" key={idx}>
                            <span>{file.name.endsWith('.py') ? '🐍' : '📄'} {file.name} ({(file.size/1024).toFixed(1)}KB)</span>
                            <button className="fr" onClick={() => removeFile(idx)}>✕</button>
                        </div>
                    ))}
                </div>
                
                <button 
                    className="btn btn-p" 
                    onClick={submitJob} 
                    disabled={!files.length || submitting}
                >
                    {submitting ? '⏳ Dispatching...' : '💌 Send Letters'}
                </button>
            </div>
        </section>
    );
};

export default SubmitJob;
