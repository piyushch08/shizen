import { useState, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { Icons } from './utils/Icons';
import { checkServerHealth } from './utils/apiService';

import confetti from 'canvas-confetti';

const Home = lazy(() => import('./pages/Home'));
const ImageTools = lazy(() => import('./pages/ImageTools'));
const VideoTools = lazy(() => import('./pages/VideoTools'));
const AudioTools = lazy(() => import('./pages/AudioTools'));
const PdfTools = lazy(() => import('./pages/PdfTools'));
const MergeTools = lazy(() => import('./pages/MergeTools'));

const PageLoader = () => (
  <div className="page-loader" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
    <div className="spinner-ring"></div>
    <p style={{ color: 'var(--white-70)', fontWeight: 600 }}>Loading awesome tools...</p>
  </div>
);

function App() {
  const location = useLocation();
  // Server health state
  const [serverOnline, setServerOnline] = useState(true);
  const [checkingServer, setCheckingServer] = useState(false);

  const verifyBackend = async () => {
    setCheckingServer(true);
    const isUp = await checkServerHealth();
    setServerOnline(isUp);
    setCheckingServer(false);
  };

  useEffect(() => {
    verifyBackend();
    const interval = setInterval(verifyBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  // Bug report state
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugName, setBugName] = useState('');
  const [bugEmail, setBugEmail] = useState('');
  const [bugMessage, setBugMessage] = useState('');
  const [bugStatus, setBugStatus] = useState('idle'); // idle | sending | sent | error

  return (
    <>
      <Toaster position="bottom-center" toastOptions={{ style: { borderRadius: '14px', background: '#ffffff', color: '#0f172a', fontWeight: '600' } }} />
      <header className="app-header">
        <div className="app-logo">
          <img src="/favicon.svg" alt="SHIZEN Logo" style={{ width: '64px', height: '64px' }} />
        </div>
        <h1 className="app-title">SHIZEN - Compress & Convert</h1>
        <p className="app-subtitle">Premium file compression, conversion, and editing</p>
      </header>

      {!serverOnline && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '14px',
          padding: '0.85rem 1.25rem',
          margin: '0 auto 1.5rem',
          maxWidth: '700px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#991b1b',
          fontSize: '0.9rem',
          fontWeight: 600,
          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.15)',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#ef4444' }}>
              <Icons.AlertCircle />
            </span>
            <span>
              <strong>Backend Disconnected:</strong> Processing server is offline on port 3001.
            </span>
          </div>
          <button 
            type="button"
            onClick={verifyBackend} 
            disabled={checkingServer}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              padding: '0.4rem 0.9rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.8rem',
              marginLeft: 'auto'
            }}
          >
            {checkingServer ? 'Checking...' : 'Retry Connection'}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        <Suspense fallback={<PageLoader />}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Home />} />
            <Route path="/image" element={<ImageTools />} />
            <Route path="/video" element={<VideoTools />} />
            <Route path="/audio" element={<AudioTools />} />
            <Route path="/pdf" element={<PdfTools />} />
            <Route path="/merge" element={<MergeTools />} />
          </Routes>
        </Suspense>
      </AnimatePresence>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-socials">
          <a href="https://www.linkedin.com/in/piyush-chauhan-353822385/" target="_blank" rel="noopener noreferrer" className="social-link" title="LinkedIn">
            <Icons.LinkedIn />
          </a>
          <a href="https://www.instagram.com/piyu5h.08?igsh=MXJvcnlnb2hwZHliMQ%3D%3D" target="_blank" rel="noopener noreferrer" className="social-link" title="Instagram">
            <Icons.Instagram />
          </a>
          <a href="https://github.com/piyushch08" target="_blank" rel="noopener noreferrer" className="social-link" title="GitHub">
            <Icons.GitHub />
          </a>
        </div>
        <div className="footer-copyright">
          © {new Date().getFullYear()} <a href="https://github.com/piyushch08" target="_blank" rel="noopener noreferrer">Piyush Chauhan</a>. All rights reserved.
        </div>
      </footer>

      {/* Floating Action Button (Quick Help / Bug) */}
      <button className="floating-help-btn" onClick={() => { setShowBugModal(true); setBugStatus('idle'); }} title="Report a Bug / Feedback">
        <Icons.Bug />
      </button>

      {/* Bug Report Modal */}
      {showBugModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowBugModal(false); }}>
          <div className="modal-panel">
            <div className="modal-header">
              <h2><Icons.Bug /> Report a Bug</h2>
              <button className="modal-close" onClick={() => setShowBugModal(false)}><Icons.X /></button>
            </div>

            {bugStatus === 'sent' ? (
              <div className="bug-success-msg">
                <div className="success-icon"><Icons.Check /></div>
                <h3>Thanks for your report!</h3>
                <p>We'll look into it and get back to you if needed.</p>
                <button className="btn-new" onClick={() => { setShowBugModal(false); setBugName(''); setBugEmail(''); setBugMessage(''); setBugStatus('idle'); }}>
                  Close
                </button>
              </div>
            ) : (
              <form
                className="modal-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBugStatus('sending');
                  try {
                    const res = await fetch('https://formsubmit.co/ajax/piyush.ch407@gmail.com', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                      body: JSON.stringify({
                        name: bugName,
                        email: bugEmail,
                        message: bugMessage,
                        _subject: 'Bug Report — Forma Tools',
                      }),
                    });
                    if (res.ok) {
                      setBugStatus('sent');
                      confetti({
                        particleCount: 100,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#3b82f6', '#10b981', '#ec4899']
                      });
                    } else {
                      throw new Error('Failed');
                    }
                  } catch {
                    setBugStatus('error');
                  }
                }}
              >
                <div className="option-group">
                  <label>Your Name</label>
                  <input className="input" type="text" placeholder="John Doe" value={bugName} onChange={(e) => setBugName(e.target.value)} required />
                </div>
                <div className="option-group">
                  <label>Your Email</label>
                  <input className="input" type="email" placeholder="you@example.com" value={bugEmail} onChange={(e) => setBugEmail(e.target.value)} required />
                </div>
                <div className="option-group">
                  <label>Describe the Bug</label>
                  <textarea className="textarea" placeholder="What happened? What did you expect to happen?" value={bugMessage} onChange={(e) => setBugMessage(e.target.value)} required />
                </div>
                {bugStatus === 'error' && (
                  <div className="error-banner">
                    <Icons.AlertCircle />
                    <span>Failed to send. Please try again.</span>
                  </div>
                )}
                <button className="btn-submit-bug" type="submit" disabled={bugStatus === 'sending'}>
                  {bugStatus === 'sending' ? 'Sending...' : 'Submit Bug Report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
