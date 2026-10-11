import { useState, useRef, useCallback, useEffect } from 'react';
import { Icons } from '../utils/Icons';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { apiProcess } from '../utils/apiService';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function MergeTools() {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle');
  const [processedFile, setProcessedFile] = useState(null);

  const fileInputRef = useRef(null);

  // Drag-to-reorder refs
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [draggedIndex, setDraggedIndex] = useState(null);

  const resetAll = useCallback(() => {
    if (processedFile?.url) window.URL.revokeObjectURL(processedFile.url);
    setFiles([]);
    setStatus('idle');
    setProcessedFile(null);
    setDraggedIndex(null);
  }, [processedFile]);

  useEffect(() => {
    return () => {
      if (processedFile?.url) window.URL.revokeObjectURL(processedFile.url);
    };
  }, [processedFile]);

  const handleFiles = useCallback((selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    let totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const newFiles = Array.from(selectedFiles);

    const validFiles = [];
    for (const f of newFiles) {
      if (totalSize + f.size > 100 * 1024 * 1024) {
        toast.error('Total file size exceeds 100MB limit.');
        setStatus('idle');
        break;
      }
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
        toast.error('Only Images and PDFs are supported for merging.');
        setStatus('idle');
        break;
      }
      validFiles.push(f);
      totalSize += f.size;
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
      setProcessedFile(null);
      setStatus('idle');
    }
  }, [files]);

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) {
      setDraggedIndex(null);
      return;
    }
    const _files = [...files];
    const draggedItemContent = _files.splice(dragItem.current, 1)[0];
    _files.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggedIndex(null);
    setFiles(_files);
  };

  const handleProcess = async () => {
    if (files.length < 2) {
      toast.error('Please upload at least 2 files to merge.');
      setStatus('idle');
      return;
    }

    setStatus('processing');

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      const response = await apiProcess('/merge', formData);

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const finalName = `merged_document.pdf`;

      setProcessedFile({ url: downloadUrl, name: finalName });
      setStatus('success');
      toast.success('Files merged successfully!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast.error(err.message || 'An error occurred during processing.');
    }
  };

  return (
    <motion.div
      className="main-card"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Link to="/" className="btn-back">
        <Icons.ArrowLeft /> Back to Dashboard
      </Link>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--blue-900)', fontSize: '1.5rem', fontWeight: 900 }}>Merge Images & PDFs</h2>
        <p style={{ color: 'var(--dark-muted)' }}>Combine multiple images or PDFs into a single PDF document.</p>
      </div>

      <div
        className={`dropzone ${isDragging ? 'active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{ padding: '2rem 1rem', marginBottom: '1.5rem' }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
          accept="image/*,application/pdf"
          multiple
        />
        <div className="dropzone-icon" style={{ background: '#8b5cf6', width: '48px', height: '48px' }}><Icons.Upload /></div>
        <h2 style={{ fontSize: '1.1rem' }}>Add Files</h2>
        <div className="supported">
          <span className="badge">Max 100MB Total</span>
          <span className="badge" style={{ background: '#8b5cf6' }}>Images & PDFs</span>
        </div>
      </div>

      {files.length > 0 && status !== 'success' && (
        <div className="file-config-section">
          <div className="section-label">Selected Files — Drag ⠿ to Reorder ({files.length})</div>
          <div className="files-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {files.map((file, idx) => (
              <div 
                key={`${file.name}-${idx}`} 
                className={`file-bar${draggedIndex === idx ? ' dragging' : ''}`}
                draggable
                onDragStart={(e) => {
                  dragItem.current = idx;
                  setDraggedIndex(idx);
                  if (e.dataTransfer) e.dataTransfer.setData('text/plain', '');
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  dragOverItem.current = idx;
                }}
                onDragEnd={handleSort}
                onDragOver={(e) => e.preventDefault()}
                style={{ 
                  marginBottom: 0, 
                  padding: '0.5rem 1rem',
                  cursor: 'grab',
                  opacity: draggedIndex === idx ? 0.4 : 1,
                  transition: 'opacity 0.2s, transform 0.15s',
                  border: draggedIndex === idx ? '2px dashed #8b5cf6' : undefined,
                }}
              >
                <div style={{ marginRight: '10px', color: '#8b5cf6', display: 'flex', alignItems: 'center', cursor: 'grab', fontSize: '1.3rem', userSelect: 'none' }} title="Drag to reorder">
                  ⠿
                </div>
                <div className={`file-bar-icon ${file.type.startsWith('image') ? 'image' : 'document'}`} style={{ width: '32px', height: '32px' }}>
                  {file.type.startsWith('image') ? <Icons.Image /> : <Icons.Document />}
                </div>
                <div className="file-bar-info">
                  <div className="file-bar-name" style={{ fontSize: '0.9rem' }}>{file.name}</div>
                  <div className="file-bar-meta">{formatSize(file.size)}</div>
                </div>
                <button className="file-bar-remove" onClick={(e) => { e.stopPropagation(); removeFile(idx); }} title="Remove file">
                  <Icons.Trash2 />
                </button>
              </div>
            ))}
          </div>

          {status === 'processing' ? (
            <div className="processing-state">
              <div className="spinner-ring" style={{ borderTopColor: '#8b5cf6' }}></div>
              <div className="processing-label">Merging Files...</div>
              <p>Please wait while we combine your files.</p>
            </div>
          ) : (
            <button className="btn-process" onClick={handleProcess} style={{ background: '#8b5cf6' }}>
              Merge into PDF
            </button>
          )}
        </div>
      )}

      {status === 'success' && processedFile && (
        <div className="success-state">
          <div className="success-icon"><Icons.Check /></div>
          <h3>Merging Complete!</h3>
          <p>Review your merged PDF below.</p>

          <div style={{ margin: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
            <iframe src={`${processedFile.url}#view=FitH`} style={{ width: '100%', height: '500px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }} title="PDF Preview" />
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={processedFile.url} download={processedFile.name} className="btn-process" style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <Icons.Download /> Download PDF
            </a>
            <button className="btn-new" onClick={resetAll} style={{ marginTop: 0, borderColor: '#8b5cf6', color: '#8b5cf6' }}>Merge More Files</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
