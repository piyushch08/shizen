import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Icons } from '../utils/Icons';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { PDFDocument } from 'pdf-lib';

const API_BASE = 'http://localhost:3001/api/process';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function PdfTools() {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle');
  const [processedFile, setProcessedFile] = useState(null);

  // PDF specific states
  const [pageOrder, setPageOrder] = useState('');
  const [totalPages, setTotalPages] = useState(0);

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
    setPageOrder('');
    setTotalPages(0);
    setDraggedIndex(null);
  }, [processedFile]);

  useEffect(() => {
    return () => {
      if (processedFile?.url) window.URL.revokeObjectURL(processedFile.url);
    };
  }, [processedFile]);

  const handleFiles = useCallback(async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const validFiles = Array.from(selectedFiles).filter(f =>
      f.type === 'application/pdf' ||
      f.name.toLowerCase().endsWith('.ppt') ||
      f.name.toLowerCase().endsWith('.pptx')
    );
    if (validFiles.length !== selectedFiles.length) {
      toast.error('Only PDF and PPT/PPTX files are allowed.');
    }

    const oversized = validFiles.some(f => f.size > 100 * 1024 * 1024);
    if (oversized) {
      toast.error('One or more files exceed the 100MB limit.');
      return;
    }

    if (validFiles.length === 0) return;

    setFiles(prev => [...prev, ...validFiles]);
    setProcessedFile(null);
    setStatus('idle');
  }, []);

  // Calculate total pages whenever files change
  useEffect(() => {
    const calcPages = async () => {
      let count = 0;
      for (const file of files) {
        if (file.type === 'application/pdf') {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            count += pdfDoc.getPageCount();
          } catch (e) {
            console.error("Error reading PDF page count:", e);
          }
        }
      }
      setTotalPages(count);
    };
    calcPages();
  }, [files]);

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

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Drag-to-reorder handler
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

  const totalOriginalSize = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);

  const estimatedSize = useMemo(() => {
    if (files.length === 0 || totalPages === 0) return 0;

    let requestedPages = totalPages;

    if (pageOrder.trim()) {
      const seqStr = pageOrder.split(',').map(s => s.trim()).filter(s => s);
      let count = 0;
      for (const s of seqStr) {
        if (s.includes('-')) {
          const [startStr, endStr] = s.split('-');
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (!isNaN(start) && !isNaN(end)) {
            count += Math.abs(end - start) + 1;
          }
        } else {
          const p = parseInt(s, 10);
          if (!isNaN(p)) {
            count += 1;
          }
        }
      }
      requestedPages = count;
    }

    // Estimate: (Total Size / Total Pages) * Requested Pages * 0.95 (metadata strip savings)
    const avgSizePerPage = totalOriginalSize / totalPages;
    return Math.max(1024, avgSizePerPage * requestedPages * 0.95);
  }, [files, totalPages, pageOrder, totalOriginalSize]);

  const handleProcess = async () => {
    if (files.length === 0) return;
    setStatus('processing');

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    if (pageOrder) formData.append('pageOrder', pageOrder);

    try {
      const response = await fetch(`${API_BASE}/document`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const baseName = files[0].name.substring(0, files[0].name.lastIndexOf('.')) || files[0].name;
      const finalName = `${baseName}_optimized.pdf`;

      setProcessedFile({ url: downloadUrl, name: finalName });
      setStatus('success');
      toast.success('PDF processed successfully!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast.error(err.message || 'An error occurred during processing.');
    }
  };

  const handleConvert = async (targetFormat) => {
    if (files.length !== 1) {
      toast.error('Conversion requires exactly 1 file.');
      return;
    }
    setStatus('processing');

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('targetFormat', targetFormat);

    try {
      const response = await fetch(`${API_BASE}/convert`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const baseName = files[0].name.substring(0, files[0].name.lastIndexOf('.')) || files[0].name;
      const finalName = `${baseName}_converted.${targetFormat}`;

      setProcessedFile({ url: downloadUrl, name: finalName });
      setStatus('success');
      toast.success('File converted successfully!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast.error(err.message || 'An error occurred during conversion.');
    }
  };

  const handleConvertToJpg = async () => {
    if (files.length !== 1 || files[0].type !== 'application/pdf') {
      toast.error('Please upload exactly 1 PDF file to convert to JPG.');
      return;
    }
    setStatus('processing');

    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('targetFormat', 'jpg');

    try {
      const response = await fetch(`${API_BASE}/convert`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const baseName = files[0].name.substring(0, files[0].name.lastIndexOf('.')) || files[0].name;

      // Check if it's a ZIP (multi-page) or single JPG
      const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;
      const finalName = isZip ? `${baseName}_images.zip` : `${baseName}_converted.jpg`;

      setProcessedFile({ url: downloadUrl, name: finalName });
      setStatus('success');
      toast.success('PDF converted to JPG successfully!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast.error(err.message || 'An error occurred during conversion.');
    }
  };

  // Check what types of files are uploaded
  const allPdfs = files.length > 0 && files.every(f => f.type === 'application/pdf');
  const singlePpt = files.length === 1 && (files[0].name.toLowerCase().endsWith('.ppt') || files[0].name.toLowerCase().endsWith('.pptx'));
  const singlePdf = files.length === 1 && files[0].type === 'application/pdf';

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
        <h2 style={{ color: 'var(--blue-900)', fontSize: '1.5rem', fontWeight: 900 }}>PDF & Presentation Tools</h2>
        <p style={{ color: 'var(--dark-muted)' }}>Merge, compress, rearrange PDFs, or convert between PDF, PPTX & JPG.</p>
      </div>

      <div
        className={`dropzone ${isDragging ? 'active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{ marginBottom: files.length > 0 ? '1.5rem' : '0' }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
          accept=".pdf,.ppt,.pptx"
          multiple
        />
        <div className="dropzone-icon" style={{ background: '#059669' }}><Icons.Upload /></div>
        <h2>{files.length > 0 ? 'Add more files' : 'Upload PDF or PPT'}</h2>
        <p>Drag and drop PDF or PPT files here, or click to browse</p>
        <div className="supported">
          <span className="badge">Max 100MB</span>
          <span className="badge green">PDF</span>
          <span className="badge purple">PPT / PPTX</span>
        </div>
      </div>

      {files.length > 0 && status !== 'success' && (
        <div className="file-config-section">

          <div className="section-label">Selected Files — Drag ⠿ to Reorder</div>
          {files.map((f, idx) => (
            <div
              className={`file-bar${draggedIndex === idx ? ' dragging' : ''}`}
              key={`${f.name}-${f.size}-${idx}`}
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
                marginBottom: '0.5rem',
                padding: '0.75rem 1rem',
                cursor: 'grab',
                opacity: draggedIndex === idx ? 0.4 : 1,
                transition: 'opacity 0.2s, transform 0.15s',
                border: draggedIndex === idx ? '2px dashed #059669' : undefined,
              }}
            >
              <div style={{ marginRight: '10px', color: '#059669', display: 'flex', alignItems: 'center', cursor: 'grab', fontSize: '1.3rem', userSelect: 'none' }} title="Drag to reorder">
                ⠿
              </div>
              <div className="file-bar-icon document" style={{ width: '36px', height: '36px' }}><Icons.Document /></div>
              <div className="file-bar-info">
                <div className="file-bar-name">{f.name}</div>
                <div className="file-bar-meta">{formatSize(f.size)}</div>
              </div>
              <button className="file-bar-remove" onClick={(e) => { e.stopPropagation(); removeFile(idx); }} title="Remove file">
                <Icons.Trash2 />
              </button>
            </div>
          ))}

          {status === 'processing' ? (
            <div className="processing-state" style={{ marginTop: '2rem' }}>
              <div className="spinner-ring" style={{ borderTopColor: '#059669' }}></div>
              <div className="processing-label">Processing file...</div>
              <p>Please wait while we process your document.</p>
            </div>
          ) : (
            <div className="options-panel" style={{ marginTop: '1.5rem' }}>
              {allPdfs ? (
                <>
                  <div className="section-label">Page Sequence (Rearrange & Remove)</div>
                  <div className="options-grid">
                    <div className="option-group full-width">
                      <label>Page Order (Total Pages: {totalPages > 0 ? totalPages : 'Loading...'})</label>
                      <input
                        type="text"
                        className="input"
                        placeholder={`e.g. 1, 4-5, 2`}
                        value={pageOrder}
                        onChange={(e) => setPageOrder(e.target.value)}
                      />
                      <small style={{ color: 'var(--dark-muted)', marginTop: '0.35rem', display: 'block', lineHeight: '1.5' }}>
                        <strong>Tip:</strong> Leave empty to keep all {totalPages} pages in order. <br />
                        Type <code>1, 3, 2</code> to rearrange. Type <code>1-5</code> for a range. Type <code>5-1</code> to reverse!
                      </small>
                    </div>
                  </div>

                  <div className="section-label">Optimization & Output</div>
                  <div className="options-grid">
                    <div className="option-group full-width">
                      <p style={{ color: 'var(--dark-muted)', fontSize: '0.9rem', lineHeight: '1.6', fontWeight: '500' }}>
                        We automatically strip unnecessary metadata to reduce file size.
                      </p>
                    </div>
                  </div>

                  <div className="estimation-badge" style={{ textAlign: 'center', marginBottom: '1.5rem', background: 'var(--blue-50)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: '#059669', fontWeight: 700 }}>
                    Estimated Compressed Size: ~{formatSize(estimatedSize)}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <button className="btn-process" onClick={handleProcess} style={{ background: '#059669', flex: 1 }}>
                      Optimize PDF
                    </button>
                    {singlePdf && (
                      <>
                        <button className="btn-process" onClick={() => handleConvert('pptx')} style={{ background: '#8b5cf6', flex: 1 }}>
                          Convert to PPTX
                        </button>
                        <button className="btn-process" onClick={handleConvertToJpg} style={{ background: '#f59e0b', flex: 1 }}>
                          Convert to JPG
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : singlePpt ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                  <button className="btn-process" onClick={() => handleConvert('pdf')} style={{ background: '#ef4444', maxWidth: '300px' }}>
                    Convert to PDF
                  </button>
                </div>
              ) : (
                <div style={{ color: 'var(--red-600)', textAlign: 'center', marginTop: '1rem' }}>
                  Please select only PDFs for merging/compressing, or a single PPT/PPTX file for conversion.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {status === 'success' && processedFile && (
        <div className="success-state">
          <div className="success-icon"><Icons.Check /></div>
          <h3>Processing Complete!</h3>
          <p>Review your file below.</p>

          <div style={{ margin: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
            {processedFile.name.endsWith('.pdf') ? (
              <iframe src={`${processedFile.url}#view=FitH`} style={{ width: '100%', height: '500px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }} title="PDF Preview" />
            ) : processedFile.name.endsWith('.jpg') || processedFile.name.endsWith('.jpeg') ? (
              <img src={processedFile.url} alt="Converted" style={{ maxWidth: '100%', maxHeight: '500px', borderRadius: 'var(--radius-md)' }} />
            ) : (
              <div style={{ padding: '3rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', color: '#8b5cf6', marginBottom: '1rem' }}><Icons.Document /></div>
                <h3 style={{ marginBottom: '0.5rem' }}>{processedFile.name}</h3>
                <p style={{ color: 'var(--dark-muted)' }}>Ready for download</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={processedFile.url} download={processedFile.name} className="btn-process" style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <Icons.Download /> Download File
            </a>
            <button className="btn-new" onClick={resetAll} style={{ marginTop: 0 }}>Process Another File</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
