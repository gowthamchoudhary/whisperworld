import { useState, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const ACCEPTED_MIME_TYPES = ['image/jpeg','image/png','image/webp','image/heic'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function CameraPage(): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const getLocation = (): Promise<{latitude:number,longitude:number}|null> =>
    new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p => resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),
        () => resolve(null),
        {timeout:10000}
      );
    });

  const processImage = async (file: File) => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Image too large. Max 10MB.');
      return;
    }

    setError('');
    setIsLoading(true);
    const imageUrl = URL.createObjectURL(file);
    setCapturedImage(imageUrl);

    try {
      const location = await getLocation();
      const formData = new FormData();
      formData.append('file', file);
      if (location) {
        formData.append('lat', location.latitude.toString());
        formData.append('lng', location.longitude.toString());
      }

      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${BASE_URL}/api/identify`, {
        method: 'POST',
        headers: {},
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${response.status}`);
      }

      const results = await response.json();
      if (!results || results.length === 0) {
        throw new Error('No creature found. Try a clearer photo.');
      }

      navigate('/creature', {
        state: { creatures: results, imageUrl, location }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setCapturedImage(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    e.target.value = '';
  };

  if (isLoading) return (
    <div className="app-container">
      <div className="header">
        <span className="header-leaf">🌿</span>
        <span className="header-title">WhisperWorld</span>
      </div>
      <div className="loading-screen">
        {capturedImage && (
          <img src={capturedImage} className="loading-image" alt="captured" />
        )}
        <div className="loading-spinner" />
        <div className="loading-text">Discovering creature...</div>
        <div className="loading-subtext">Listening to nature</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="app-container">
      <div className="header">
        <span className="header-leaf">🌿</span>
        <span className="header-title">WhisperWorld</span>
      </div>
      <div className="error-screen">
        <div className="error-card">
          <div className="error-title">Oops!</div>
          <div className="error-message">{error}</div>
          <button className="retry-btn" onClick={() => setError('')}>
            Try Again
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <div className="header">
        <span className="header-leaf">🌿</span>
        <span className="header-title">WhisperWorld</span>
      </div>
      <div className="main-screen">
        <div className="hero-section">
          <span className="hero-emoji">🌱</span>
          <div className="hero-title">Meet Nature</div>
          <div className="hero-subtitle">
            Every plant and creature has a voice.<br/>
            Point your camera and listen.
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12,width:'100%',alignItems:'center'}}>
          <button 
            className="camera-btn" 
            onClick={() => cameraInputRef.current?.click()}
          >
            <span>📷</span> Take Photo
          </button>
          <button 
            className="gallery-btn" 
            onClick={() => fileInputRef.current?.click()}
          >
            <span>🖼️</span> Choose from Gallery
          </button>
        </div>
      </div>
      <input 
        ref={cameraInputRef} 
        type="file" 
        accept="image/*" 
        capture="environment" 
        onChange={handleFileChange} 
        className="hidden" 
      />
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*" 
        onChange={handleFileChange} 
        className="hidden" 
      />
    </div>
  );
}