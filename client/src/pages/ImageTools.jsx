import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Icons } from '../utils/Icons';
import { Link } from 'react-router-dom';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';

const API_BASE = 'http://localhost:3001/api/process';

const ASPECT_RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', w: 1, h: 1 },
  { label: '4:3', w: 4, h: 3 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '3:2', w: 3, h: 2 },
];

const IMAGE_FORMATS = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function ImageTools() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processedFile, setProcessedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle');

  // Editing state
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [format, setFormat] = useState('');
  const [quality, setQuality] = useState(80);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);

  // Crop state
  const imgRef = useRef(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [imageMeta, setImageMeta] = useState({ width: 0, height: 0, renderedWidth: 0, renderedHeight: 0, scaleX: 1, scaleY: 1 });

  const fileInputRef = useRef(null);

  const resetAll = useCallback(() => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    if (processedFile?.url) window.URL.revokeObjectURL(processedFile.url);
    setFile(null);
    setPreviewUrl(null);
    setProcessedFile(null);
    setStatus('idle');
    setWidth('');
    setHeight('');
    setFormat('');
    setQuality(80);
    setAspectRatio(null);
    setMaintainAspectRatio(true);
    setCrop(undefined);
    setCompletedCrop(null);
  }, [previewUrl]);

  // Clean up object URL when component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
      if (processedFile?.url) window.URL.revokeObjectURL(processedFile.url);
    };
  }, [previewUrl, processedFile]);

  const handleFile = useCallback((selectedFile) => {
    if (!selectedFile) return;
    if (selectedFile.size > 100 * 1024 * 1024) {
        toast.error('File exceeds 100MB limit.');
        setStatus('idle');
        return;
    }
    if (!selectedFile.type.startsWith('image/') && selectedFile.type !== 'application/pdf') {
        toast.error('Please upload an image or PDF file.');
        setStatus('idle');
        return;
    }
    setFile(selectedFile);
    setPreviewUrl(window.URL.createObjectURL(selectedFile));
    setProcessedFile(null);
    setStatus('idle');
    setCrop(undefined);
    setCompletedCrop(null);
  }, []);

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
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const onImageLoad = (e) => {
    const { naturalWidth, naturalHeight, width, height } = e.currentTarget;
    setImageMeta({
      width: naturalWidth,
      height: naturalHeight,
      renderedWidth: width,
      renderedHeight: height,
      scaleX: naturalWidth / width,
      scaleY: naturalHeight / height
    });
  };

  // Estimate file size
  const estimatedSize = useMemo(() => {
    if (!file) return 0;
    
    // Heuristic estimation
    let factor = (quality / 100);
    
    // Crop reduction factor
    let cropFactor = 1;
    if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      // ratio of crop area to full visual area
      const cropArea = completedCrop.width * completedCrop.height;
      const fullArea = (imageMeta.renderedWidth || 1) * (imageMeta.renderedHeight || 1);
      cropFactor = Math.min(1, cropArea / fullArea);
    }
    
    // Resize reduction factor
    let resizeFactor = 1;
    if (width && imageMeta.width > 0) {
      resizeFactor = Math.min(1, Math.pow(parseInt(width) / imageMeta.width, 2));
    } else if (height && imageMeta.height > 0) {
      resizeFactor = Math.min(1, Math.pow(parseInt(height) / imageMeta.height, 2));
    }

    const estimatedBytes = file.size * factor * cropFactor * resizeFactor;
    return Math.max(1024, estimatedBytes); // Don't show less than 1KB
  }, [file, quality, completedCrop, width, height, imageMeta]);

  const handleProcess = async () => {
    if (!file) return;
    setStatus('processing');

    const formData = new FormData();
    formData.append('file', file);
    if (width) formData.append('width', width);
    if (height) formData.append('height', height);
    if (format) formData.append('format', format);
    formData.append('quality', quality);
    formData.append('maintainAspectRatio', maintainAspectRatio ? 'true' : 'false');

    // Add actual image crop coordinates
    if (completedCrop && imgRef.current && completedCrop.width > 0 && completedCrop.height > 0) {
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
      
      formData.append('cropX', Math.round(completedCrop.x * scaleX));
      formData.append('cropY', Math.round(completedCrop.y * scaleY));
      formData.append('cropWidth', Math.round(completedCrop.width * scaleX));
      formData.append('cropHeight', Math.round(completedCrop.height * scaleY));
    }

    try {
      const response = await fetch(`${API_BASE}/image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      
      const outExt = format || file.name.split('.').pop();
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const finalName = `${baseName}_optimized.${outExt}`;
      
      setProcessedFile({ url: downloadUrl, name: finalName });
      setStatus('success');
      toast.success('Image processed successfully!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast.error(err.message || 'An error occurred during processing.');
    }
  };

  const handleConvertPdfToJpg = async () => {
    if (!file) return;
    setStatus('processing');
    const formData = new FormData();
    formData.append('file', file);
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
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const isZip = blob.type.includes('zip');
      const finalName = `${baseName}_images.${isZip ? 'zip' : 'jpg'}`;
      
      setProcessedFile({ url: downloadUrl, name: finalName });
      setStatus('success');
      toast.success('Converted to JPG successfully!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast.error(err.message || 'An error occurred during conversion.');
    }
  };

  const handleImageToPdf = async () => {
    if (!file) return;
    setStatus('processing');
    const formData = new FormData();
    formData.append('files', file);

    try {
      const response = await fetch(`${API_BASE}/merge`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      
      setProcessedFile({ url: downloadUrl, name: `${baseName}_converted.pdf` });
      setStatus('success');
      toast.success('Converted to PDF successfully!');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
      setStatus('idle');
      toast.error(err.message || 'An error occurred during conversion.');
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
      
      <div style={{textAlign: 'center', marginBottom: '2rem'}}>
        <h2 style={{color: 'var(--blue-900)', fontSize: '1.5rem', fontWeight: 900}}>Image Compressor & Resizer</h2>
        <p style={{color: 'var(--dark-muted)'}}>Upload an image to visually crop, resize, or change its format.</p>
      </div>

      {!file && (
        <div
          className={`dropzone ${isDragging ? 'active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFile(e.target.files[0])}
            style={{ display: 'none' }}
            accept="image/*,.pdf"
          />
          <div className="dropzone-icon"><Icons.Upload /></div>
          <h2>Upload Image or PDF</h2>
          <p>Drag and drop your file here, or click to browse</p>
          <div className="supported">
            <span className="badge">Max 100MB</span>
            <span className="badge accent">JPG, PNG, WebP, AVIF</span>
            <span className="badge green">PDF</span>
          </div>
        </div>
      )}

      {file && status !== 'success' && (
        <div className="file-config-section">
          
          <div className="file-bar">
            <div className="file-bar-icon image"><Icons.Image /></div>
            <div className="file-bar-info">
              <div className="file-bar-name">{file.name}</div>
              <div className="file-bar-meta">Original: {formatSize(file.size)}</div>
            </div>
            <button className="file-bar-remove" onClick={resetAll} title="Remove file">
              <Icons.Trash2 />
            </button>
          </div>

          {status === 'processing' ? (
            <div className="processing-state">
              <div className="spinner-ring"></div>
              <div className="processing-label">Processing Image...</div>
              <p>Please wait while we compress and resize your image.</p>
            </div>
          ) : (
            <div className="options-panel">
              {file.type === 'application/pdf' ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                  <button className="btn-process" onClick={handleConvertPdfToJpg} style={{background: '#f59e0b', maxWidth: '300px'}}>
                    Convert PDF to JPG
                  </button>
                </div>
              ) : (
                <>
                  <div className="section-label">Visual Cropping</div>
                  <div className="visual-editor-container" style={{background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'center', overflow: 'hidden'}}>
                    {previewUrl && (() => {
                      const currentRatio = ASPECT_RATIOS.find(r => r.label === aspectRatio);
                      const aspectValue = currentRatio && currentRatio.w ? currentRatio.w / currentRatio.h : undefined;
                      
                      return (
                      <ReactCrop 
                        crop={crop} 
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={aspectValue}
                      >
                          <img 
                            ref={imgRef}
                            src={previewUrl} 
                            onLoad={onImageLoad}
                            alt="Upload preview" 
                            style={{ width: '100%', height: 'auto', maxHeight: '400px', display: 'block' }}
                          />
                      </ReactCrop>
                      );
                    })()}
                  </div>
                  
                  {completedCrop && completedCrop.width > 0 && completedCrop.height > 0 && (
                    <div style={{width: '100%', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1rem'}}>
                      <span style={{fontSize: '0.85rem', color: 'var(--dark-muted)', fontWeight: 600}}>
                        Crop Size: {Math.round(completedCrop.width)} x {Math.round(completedCrop.height)} px
                      </span>
                      <button 
                        onClick={() => { setCrop(undefined); setCompletedCrop(null); }}
                        style={{background: 'none', border: 'none', color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem'}}
                      >
                        <Icons.Trash2 /> Clear Crop
                      </button>
                    </div>
                  )}

                  <div className="section-label">Dimensions & Resizing</div>
                  <div className="options-grid">
                    <div className="option-group">
                      <label>Final Width (px)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="Auto"
                        value={width}
                        onChange={(e) => setWidth(e.target.value)}
                      />
                    </div>
                    <div className="option-group">
                      <label>Final Height (px)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="Auto"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                      />
                    </div>

                    <div className="option-group full-width">
                      <label style={{ marginBottom: '0.5rem', display: 'block' }}>Crop Aspect Ratio</label>
                      <div className="aspect-chips">
                        {ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio.label}
                            className={`chip ${aspectRatio === ratio.label ? 'active' : ''}`}
                            onClick={() => setAspectRatio(ratio.label)}
                          >
                            {ratio.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="option-group full-width" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="maintainAspectImg"
                        checked={maintainAspectRatio}
                        onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                        style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: '#2563eb' }}
                      />
                      <label htmlFor="maintainAspectImg" style={{ marginBottom: 0, cursor: 'pointer', fontWeight: 500 }}>
                        Maintain original aspect ratio when resizing
                      </label>
                    </div>
                  </div>

                  <div className="section-label">Compression & Format</div>
                  <div className="options-grid">
                    <div className="option-group">
                      <label>Convert To</label>
                      <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
                        <option value="">Keep Original</option>
                        {IMAGE_FORMATS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="range-group">
                      <div className="range-header">
                        <label>Quality (Compression)</label>
                        <span className="range-value">{quality}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="estimation-badge" style={{textAlign: 'center', marginBottom: '1rem', background: 'var(--blue-50)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'var(--blue-900)', fontWeight: 700}}>
                    Estimated Output Size: ~{formatSize(estimatedSize)}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-process" onClick={handleProcess} style={{flex: 1}}>
                      Compress Image
                    </button>
                    <button className="btn-process" onClick={handleImageToPdf} style={{background: '#ef4444', flex: 1}}>
                      Convert to PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {status === 'success' && processedFile && (
        <div className="success-state">
          <div className="success-icon"><Icons.Check /></div>
          <h3>Processing Complete!</h3>
          <p>Review your optimized image below.</p>
          
          <div style={{ margin: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
            {processedFile.name.endsWith('.pdf') ? (
              <iframe src={`${processedFile.url}#view=FitH`} style={{ width: '100%', height: '500px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)' }} title="PDF Preview" />
            ) : processedFile.name.endsWith('.zip') ? (
              <div style={{ padding: '3rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', color: '#f59e0b', marginBottom: '1rem' }}><Icons.Document /></div>
                <h3 style={{ marginBottom: '0.5rem' }}>{processedFile.name}</h3>
                <p style={{ color: 'var(--dark-muted)' }}>ZIP file containing JPG images ready for download</p>
              </div>
            ) : (
              <img src={processedFile.url} alt="Processed" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: 'var(--radius-md)' }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={processedFile.url} download={processedFile.name} className="btn-process" style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <Icons.Download /> Download Image
            </a>
            <button className="btn-new" onClick={resetAll} style={{ marginTop: 0 }}>Process Another Image</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
