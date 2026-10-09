import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Icons } from '../utils/Icons';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';

const API_BASE = 'http://localhost:3001/api/process';

const AUDIO_FORMATS = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'ogg', label: 'OGG' },
  { value: 'aac', label: 'AAC' },
];

const AUDIO_BITRATES = [
  { value: '64k', label: 'Low Quality — 64 kbps' },
  { value: '128k', label: 'Standard — 128 kbps' },
  { value: '192k', label: 'High Quality — 192 kbps' },
  { value: '320k', label: 'Studio Quality — 320 kbps' },
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

export default function AudioTools() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processedFile, setProcessedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle');

  const [format, setFormat] = useState('mp3');
  const [audioBitrate, setAudioBitrate] = useState('128k');
  const [enhance, setEnhance] = useState(false);
  
  // Enhancement intensity controls
  const [voiceIntensity, setVoiceIntensity] = useState(50);
  const [instrumentsIntensity, setInstrumentsIntensity] = useState(50);
  const [beatsIntensity, setBeatsIntensity] = useState(50);
  
  // Trimming states
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);

  const resetAll = useCallback(() => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    if (processedFile?.url) window.URL.revokeObjectURL(processedFile.url);
    setFile(null);
    setPreviewUrl(null);
    setProcessedFile(null);
    setStatus('idle');
    setFormat('mp3');
    setAudioBitrate('128k');
    setEnhance(false);
    setVoiceIntensity(50);
    setInstrumentsIntensity(50);
    setBeatsIntensity(50);
    setStartTime(0);
    setEndTime(0);
    setAudioDuration(0);
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
    if (!selectedFile.type.startsWith('audio/') && !selectedFile.type.startsWith('video/')) {
        toast.error('Please upload an audio file.');
        setStatus('idle');
        return;
    }
    setFile(selectedFile);
    setPreviewUrl(window.URL.createObjectURL(selectedFile));
    setProcessedFile(null);
    setStatus('idle');
    setAudioDuration(0);
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

  const onAudioLoadedMetadata = (e) => {
    const dur = e.currentTarget.duration;
    setAudioDuration(dur);
    setEndTime(dur);
    setStartTime(0);
  };

  const handleStartTimeChange = (e) => {
    const val = parseFloat(e.target.value);
    if (val >= endTime) return;
    setStartTime(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  const handleEndTimeChange = (e) => {
    const val = parseFloat(e.target.value);
    if (val <= startTime) return;
    setEndTime(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  // Estimate file size based on bitrate and duration
  const estimatedSize = useMemo(() => {
    if (!file) return 0;
    
    // Duration in seconds
    let finalDuration = audioDuration;
    if (endTime > startTime) {
      finalDuration = endTime - startTime;
    }

    if (finalDuration <= 0) finalDuration = 1;

    // Bitrate calculation
    const kbps = parseInt(audioBitrate.replace('k', ''));
    const bitsPerSec = kbps * 1000;
    const bytesPerSec = bitsPerSec / 8;
    
    // Total audio bytes + 2% overhead
    const estimatedBytes = (finalDuration * bytesPerSec) * 1.02;
    
    return Math.max(1024, estimatedBytes); // Minimum 1KB
  }, [file, audioDuration, endTime, startTime, audioBitrate]);

  const handleProcess = async () => {
    if (!file) return;
    setStatus('processing');

    const formData = new FormData();
    formData.append('file', file);
    if (format) formData.append('format', format);
    if (audioBitrate) formData.append('audioBitrate', audioBitrate);
    
    if (enhance) {
      formData.append('enhance', 'true');
      formData.append('voiceIntensity', voiceIntensity);
      formData.append('instrumentsIntensity', instrumentsIntensity);
      formData.append('beatsIntensity', beatsIntensity);
    }
    
    if (startTime > 0) formData.append('startTime', startTime);
    if (endTime > 0 && endTime < audioDuration) {
      formData.append('duration', endTime - startTime);
    }

    try {
      const response = await fetch(`${API_BASE}/audio`, {
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
      toast.success('Audio processed successfully!');
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
        <h2 style={{color: 'var(--blue-900)', fontSize: '1.5rem', fontWeight: 900}}>Audio Compressor & Editor</h2>
        <p style={{color: 'var(--dark-muted)'}}>Upload an audio file to compress, format, trim, and enhance.</p>
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
            accept="audio/*,video/*"
          />
          <div className="dropzone-icon" style={{background: '#8b5cf6'}}><Icons.Upload /></div>
          <h2>Upload Audio</h2>
          <p>Drag and drop your audio file here, or click to browse</p>
          <div className="supported">
            <span className="badge">Max 100MB</span>
            <span className="badge" style={{background: '#8b5cf6'}}>MP3, WAV, OGG, AAC</span>
          </div>
        </div>
      )}

      {file && status !== 'success' && (
        <div className="file-config-section">
          <div className="file-bar">
            <div className="file-bar-icon" style={{background: '#ede9fe', color: '#8b5cf6'}}><Icons.Music /></div>
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
              <div className="spinner-ring" style={{borderTopColor: '#8b5cf6'}}></div>
              <div className="processing-label">Processing Audio...</div>
              <p>This may take a while depending on the file size.</p>
            </div>
          ) : (
            <div className="options-panel">
              
              <div className="section-label">Audio Preview & Review</div>
              <div className="visual-editor-container" style={{background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                {previewUrl && (
                  <>
                    <audio 
                      ref={audioRef}
                      src={previewUrl} 
                      onLoadedMetadata={onAudioLoadedMetadata}
                      controls
                      style={{ width: '100%', maxWidth: '500px', margin: '1rem 0' }}
                    />
                    <p style={{color: 'var(--dark-muted)', fontSize: '0.85rem', textAlign: 'center'}}>
                      Use the audio player to review your file and find exactly where you want to trim.
                    </p>
                  </>
                )}
              </div>

              <div className="section-label">Trim Audio</div>
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
                      max={audioDuration}
                      step="0.1"
                      value={startTime}
                      onChange={handleStartTimeChange}
                      style={{ flex: 1, accentColor: '#8b5cf6', cursor: 'pointer' }}
                      title="Start Time"
                    />
                    <input
                      type="range"
                      min="0"
                      max={audioDuration}
                      step="0.1"
                      value={endTime}
                      onChange={handleEndTimeChange}
                      style={{ flex: 1, accentColor: '#8b5cf6', cursor: 'pointer' }}
                      title="End Time"
                    />
                  </div>
                  
                  <div style={{textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--dark-muted)'}}>
                    <strong>Trimmed Duration:</strong> {formatTime(endTime - startTime)}
                  </div>
                </div>
              </div>

              <div className="section-label">Quality & Format</div>
              <div className="options-grid">
                <div className="option-group">
                  <label>Convert To</label>
                  <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
                    {AUDIO_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="option-group">
                  <label>Audio Bitrate</label>
                  <select className="select" value={audioBitrate} onChange={(e) => setAudioBitrate(e.target.value)}>
                    {AUDIO_BITRATES.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="section-label">Enhancements</div>
              <div className="options-grid">
                <div className="option-group full-width" style={{background: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--blue-100)'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', margin: 0}}>
                    <input 
                      type="checkbox" 
                      checked={enhance} 
                      onChange={(e) => setEnhance(e.target.checked)} 
                      style={{width: '20px', height: '20px', accentColor: '#8b5cf6'}}
                    />
                    <div style={{display: 'flex', flexDirection: 'column'}}>
                      <span style={{fontSize: '1rem', fontWeight: 800, color: 'var(--blue-900)'}}>Enhance Audio Quality</span>
                      <span style={{fontSize: '0.85rem', fontWeight: 500, color: 'var(--dark-muted)'}}>Normalizes volume, boosts vocals, and balances harsh peaks.</span>
                    </div>
                  </label>
                  
                  {enhance && (
                    <div style={{marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--gray-200)'}}>
                      <h4 style={{fontSize: '0.95rem', fontWeight: 700, color: 'var(--blue-900)', marginBottom: '1rem'}}>Adjust Intensity</h4>
                      
                      <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: 'var(--dark-muted)'}}>
                            <span>Voice / Vocals</span>
                            <span>{voiceIntensity}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={voiceIntensity} 
                            onChange={(e) => setVoiceIntensity(e.target.value)} 
                            style={{accentColor: '#8b5cf6', cursor: 'pointer'}} 
                          />
                        </div>

                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: 'var(--dark-muted)'}}>
                            <span>Instruments</span>
                            <span>{instrumentsIntensity}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={instrumentsIntensity} 
                            onChange={(e) => setInstrumentsIntensity(e.target.value)} 
                            style={{accentColor: '#8b5cf6', cursor: 'pointer'}} 
                          />
                        </div>

                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: 'var(--dark-muted)'}}>
                            <span>Beats / Bass</span>
                            <span>{beatsIntensity}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={beatsIntensity} 
                            onChange={(e) => setBeatsIntensity(e.target.value)} 
                            style={{accentColor: '#8b5cf6', cursor: 'pointer'}} 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="estimation-badge" style={{textAlign: 'center', marginBottom: '1rem', background: '#f5f3ff', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: '#6d28d9', fontWeight: 700}}>
                Estimated Output Size: ~{formatSize(estimatedSize)}
              </div>

              <button className="btn-process" onClick={handleProcess} style={{background: '#8b5cf6'}}>
                Process Audio
              </button>
            </div>
          )}
        </div>
      )}

      {status === 'success' && processedFile && (
        <div className="success-state">
          <div className="success-icon"><Icons.Check /></div>
          <h3>Processing Complete!</h3>
          <p>Review your optimized audio below.</p>
          
          <div style={{ margin: '1.5rem 0', display: 'flex', justifyContent: 'center' }}>
            <audio src={processedFile.url} controls style={{ width: '100%', maxWidth: '400px' }} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={processedFile.url} download={processedFile.name} className="btn-process" style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <Icons.Download /> Download Audio
            </a>
            <button className="btn-new" onClick={resetAll} style={{ marginTop: 0, borderColor: '#8b5cf6', color: '#8b5cf6' }}>Process Another File</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
