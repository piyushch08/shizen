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
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '4:3', w: 4, h: 3 },
  { label: '1:1', w: 1, h: 1 },
];

const VIDEO_FORMATS = [
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'avi', label: 'AVI' },
  { value: 'mkv', label: 'MKV' },
];

const VIDEO_BITRATES = [
  { value: '300k', label: 'Very Low — 300 kbps' },
  { value: '500k', label: 'Low — 500 kbps' },
  { value: '1000k', label: 'Medium — 1 Mbps' },
  { value: '2500k', label: 'High — 2.5 Mbps' },
  { value: '5000k', label: 'Very High — 5 Mbps' },
];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatTime(seconds) {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function VideoTools() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processedFile, setProcessedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle');

  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [format, setFormat] = useState('');
  const [videoBitrate, setVideoBitrate] = useState('1000k');
  const [aspectRatio, setAspectRatio] = useState(null);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  
  // Trimming states
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  // Crop & Video state
  const videoRef = useRef(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);

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
    setVideoBitrate('1000k');
    setAspectRatio(null);
    setMaintainAspectRatio(true);
    setStartTime(0);
    setEndTime(0);
    setCrop(undefined);
    setCompletedCrop(null);
    setVideoDuration(0);
  }, [previewUrl]);

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
    if (!selectedFile.type.startsWith('video/')) {
        toast.error('Please upload a video file.');
        setStatus('idle');
        return;
    }
    setFile(selectedFile);
    setPreviewUrl(window.URL.createObjectURL(selectedFile));
    setProcessedFile(null);
    setStatus('idle');
    setCrop(undefined);
    setCompletedCrop(null);
    setVideoDuration(0);
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

  const onVideoLoadedMetadata = (e) => {
    const dur = e.currentTarget.duration;
    setVideoDuration(dur);
    setEndTime(dur);
    setStartTime(0);
  };

  const handleStartTimeChange = (e) => {
    const val = parseFloat(e.target.value);
    if (val >= endTime) return;
    setStartTime(val);
    if (videoRef.current) videoRef.current.currentTime = val;
  };

  const handleEndTimeChange = (e) => {
    const val = parseFloat(e.target.value);
    if (val <= startTime) return;
    setEndTime(val);
    if (videoRef.current) videoRef.current.currentTime = val;
  };

  // Estimate file size based on bitrate and duration
  const estimatedSize = useMemo(() => {
    if (!file) return 0;
    
    // Duration in seconds
    let finalDuration = videoDuration;
    if (endTime > startTime) {
      finalDuration = endTime - startTime;
    }

    if (finalDuration <= 0) finalDuration = 1;

    // Bitrate calculation
    const kbps = parseInt(videoBitrate.replace('k', ''));
    const bitsPerSec = kbps * 1000;
    const bytesPerSec = bitsPerSec / 8;
    
    // Total video bytes + 10% overhead for audio/container
    const estimatedBytes = (finalDuration * bytesPerSec) * 1.10;
    
    return Math.max(1024, estimatedBytes); // Minimum 1KB
  }, [file, videoDuration, endTime, startTime, videoBitrate]);

  const handleProcess = async () => {
    if (!file) return;
    setStatus('processing');

    const formData = new FormData();
    formData.append('file', file);
    if (width) formData.append('width', width);
    if (height) formData.append('height', height);
    if (format) formData.append('format', format);
    formData.append('videoBitrate', videoBitrate);
    formData.append('maintainAspectRatio', maintainAspectRatio ? 'true' : 'false');
    
    if (startTime > 0) formData.append('startTime', startTime);
    if (endTime > 0 && endTime < videoDuration) {
      formData.append('duration', endTime - startTime);
    }

    // Add actual video crop coordinates
    if (completedCrop && videoRef.current && completedCrop.width > 0 && completedCrop.height > 0) {
      const scaleX = videoRef.current.videoWidth / videoRef.current.clientWidth;
      const scaleY = videoRef.current.videoHeight / videoRef.current.clientHeight;
      
      formData.append('cropX', Math.round(completedCrop.x * scaleX));
      formData.append('cropY', Math.round(completedCrop.y * scaleY));
      formData.append('cropWidth', Math.round(completedCrop.width * scaleX));
      formData.append('cropHeight', Math.round(completedCrop.height * scaleY));
    }

    try {
      const response = await fetch(`${API_BASE}/video`, {
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
      const finalName = `${baseName}_compressed.${outExt}`;
      
      setProcessedFile({ url: downloadUrl, name: finalName });
      setStatus('success');
      toast.success('Video processed successfully!');
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
      
      <div style={{textAlign: 'center', marginBottom: '2rem'}}>
        <h2 style={{color: 'var(--blue-900)', fontSize: '1.5rem', fontWeight: 900}}>Video Compressor & Trimmer</h2>
        <p style={{color: 'var(--dark-muted)'}}>Upload a video to visually crop, trim duration, and compress.</p>
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
            accept="video/*"
          />
          <div className="dropzone-icon"><Icons.Upload /></div>
          <h2>Upload Video</h2>
          <p>Drag and drop your video file here, or click to browse</p>
          <div className="supported">
            <span className="badge">Max 100MB</span>
            <span className="badge accent">MP4, WebM, AVI, MKV</span>
          </div>
        </div>
      )}

      {file && status !== 'success' && (
        <div className="file-config-section">
          <div className="file-bar">
            <div className="file-bar-icon video"><Icons.Video /></div>
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
              <div className="processing-label">Processing Video...</div>
              <p>This may take a while depending on the video size.</p>
            </div>
          ) : (
            <div className="options-panel">
              
              <div className="section-label">Visual Review & Cropping</div>
              <div className="visual-editor-container" style={{background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden'}}>
                {previewUrl && (() => {
                  const currentRatio = ASPECT_RATIOS.find(r => r.label === aspectRatio);
                  const aspectValue = currentRatio && currentRatio.w ? currentRatio.w / currentRatio.h : undefined;
                  
                  return (
                  <>
                    <ReactCrop 
                      crop={crop} 
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={aspectValue}
                      style={{ marginBottom: '1rem' }}
                    >
                      <video 
                        ref={videoRef}
                        src={previewUrl} 
                        onLoadedMetadata={onVideoLoadedMetadata}
                        controls
                        style={{ width: '100%', height: 'auto', maxHeight: '400px' }}
                      />
                    </ReactCrop>
                    
                    {completedCrop && completedCrop.width > 0 && completedCrop.height > 0 && (
                      <div style={{width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
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

                    <p style={{color: 'var(--dark-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem'}}>
                      Drag the edges to crop the video frame. Use the video controls to review content and find trim times.
                    </p>
                  </>
                  );
                })()}
              </div>

              <div className="section-label">Trim Video</div>
              <div className="options-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="option-group full-width" style={{background: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--blue-100)'}}>
                  
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem'}}>
                    <span style={{fontSize: '0.9rem', fontWeight: 600, color: 'var(--dark-muted)'}}>Start: {formatTime(startTime)}</span>
                    <span style={{fontSize: '0.9rem', fontWeight: 600, color: 'var(--dark-muted)'}}>End: {formatTime(endTime)}</span>
                  </div>

                  <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
                    <input
                      type="range"
                      min="0"
                      max={videoDuration}
                      step="0.1"
                      value={startTime}
                      onChange={handleStartTimeChange}
                      style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                      title="Start Time"
                    />
                    <input
                      type="range"
                      min="0"
                      max={videoDuration}
                      step="0.1"
                      value={endTime}
                      onChange={handleEndTimeChange}
                      style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                      title="End Time"
                    />
                  </div>
                  
                  <div style={{textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--dark-muted)'}}>
                    <strong>Trimmed Duration:</strong> {formatTime(endTime - startTime)}
                  </div>
                </div>
              </div>

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
                    id="maintainAspectVid"
                    checked={maintainAspectRatio}
                    onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                    style={{ cursor: 'pointer', width: '1rem', height: '1rem', accentColor: '#2563eb' }}
                  />
                  <label htmlFor="maintainAspectVid" style={{ marginBottom: 0, cursor: 'pointer', fontWeight: 500 }}>
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
                    {VIDEO_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="option-group">
                  <label>Video Bitrate</label>
                  <select className="select" value={videoBitrate} onChange={(e) => setVideoBitrate(e.target.value)}>
                    {VIDEO_BITRATES.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="estimation-badge" style={{textAlign: 'center', marginBottom: '1rem', background: 'var(--blue-50)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'var(--blue-900)', fontWeight: 700}}>
                Estimated Output Size: ~{formatSize(estimatedSize)}
              </div>

              <button className="btn-process" onClick={handleProcess}>
                Process Video
              </button>
            </div>
          )}
        </div>
      )}

      {status === 'success' && processedFile && (
        <div className="success-state">
          <div className="success-icon"><Icons.Check /></div>
          <h3>Processing Complete!</h3>
          <p>Review your compressed video below.</p>
          
          <div style={{ margin: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
            <video src={processedFile.url} controls style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: 'var(--radius-md)', background: '#000' }} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={processedFile.url} download={processedFile.name} className="btn-process" style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <Icons.Download /> Download Video
            </a>
            <button className="btn-new" onClick={resetAll} style={{ marginTop: 0 }}>Process Another Video</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
