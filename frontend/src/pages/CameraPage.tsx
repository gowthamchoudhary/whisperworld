import { useState, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface IdentificationResult {
  species: string;
  commonName: string;
  habitat: string;
  confidence: number;
  category: string;
}

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function CameraPage(): JSX.Element {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return 'Invalid file type. Please upload a JPEG, PNG, WebP, or HEIC image.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 10 MB limit.';
    }
    return null;
  };

  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          resolve(null);
        },
        { timeout: 10000 }
      );
    });
  };

  const processImage = async (file: File): Promise<void> => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      // Show preview
      const imageUrl = URL.createObjectURL(file);
      setCapturedImage(imageUrl);

      // Get user session (demo or real)
      const demoMode = localStorage.getItem('demoMode');
      let session;
      
      if (demoMode === 'true') {
        // Use demo session
        const demoUser = localStorage.getItem('demoUser');
        session = demoUser ? { access_token: JSON.parse(demoUser).access_token } : null;
      } else {
        // Use real Supabase session
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }

      if (!session) {
        setError('Please sign in to continue.');
        return;
      }

      // Get GPS location
      const location = await getCurrentLocation();

      // Create form data
      const formData = new FormData();
      formData.append('image', file);
      if (location) {
        formData.append('latitude', location.latitude.toString());
        formData.append('longitude', location.longitude.toString());
      }

      // Call identification API with retry logic
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(`${BASE_URL}/api/identify`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
          }

          const results: IdentificationResult[] = await response.json();
          
          if (results.length === 0) {
            setError('No creatures detected in this photo. Try taking a clearer photo of a plant or animal.');
            return;
          }

          // Navigate to creature page with results
          navigate('/creature', { 
            state: { 
              creatures: results, 
              imageUrl,
              location 
            } 
          });
          return; // Success, exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          
          if (attempt < 3) {
            // Wait before retry (exponential backoff: 1s, 2s)
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`Identify attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      throw lastError;
    } catch (err) {
      console.error('Image processing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCameraCapture = (): void => {
    cameraInputRef.current?.click();
  };

  const handleFileUpload = (): void => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    const demoMode = localStorage.getItem('demoMode');
    
    if (demoMode === 'true') {
      // Clear demo mode
      localStorage.removeItem('demoMode');
      localStorage.removeItem('demoUser');
    } else {
      // Sign out from Supabase
      await supabase.auth.signOut();
    }
    
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0f0a' }}>
      {/* Header */}
      <div className="glass-effect border-b border-green-500/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-2xl mr-2">🌿</span>
            <h1 className="text-xl font-bold text-white">WhisperWorld</h1>
          </div>
          <button
            onClick={handleSignOut}
            className="text-gray-400 hover:text-white transition-colors text-sm"
            style={{ minHeight: '44px' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {!isLoading && !capturedImage && (
          <>
            <div className="text-center mb-8">
              <div className="text-8xl mb-4">📸</div>
              <h2 className="text-2xl font-bold text-white mb-2">Discover Nature</h2>
              <p className="text-gray-400 max-w-sm">
                Point at any living thing in nature
              </p>
            </div>

            {/* Camera Button */}
            <div className="space-y-4 w-full max-w-sm">
              <button
                onClick={handleCameraCapture}
                className="camera-button w-full rounded-2xl px-8 py-6 text-white font-semibold text-lg flex items-center justify-center"
                style={{ minHeight: '80px' }}
              >
                <span className="text-3xl mr-3">📷</span>
                Take Photo
              </button>

              <button
                onClick={handleFileUpload}
                className="w-full rounded-2xl px-8 py-4 text-green-400 font-medium border-2 border-green-500/30 hover:border-green-500/50 hover:bg-green-500/10 transition-all duration-200 flex items-center justify-center"
                style={{ minHeight: '60px' }}
              >
                <span className="text-xl mr-3">🖼️</span>
                Choose from Gallery
              </button>
            </div>

            {/* Recent Creatures Section */}
            <div className="mt-8 w-full max-w-sm">
              <h3 className="text-lg font-semibold text-white mb-4 text-center">Recent Creatures</h3>
              <div className="glass-effect rounded-2xl p-4 text-center">
                <p className="text-gray-400 text-sm">
                  Your discovered creatures will appear here
                </p>
              </div>
            </div>
          </>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center">
            {capturedImage && (
              <div className="mb-6">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-64 h-64 object-cover rounded-2xl mx-auto border-2 border-green-500/30"
                />
              </div>
            )}
            <div className="flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Identifying Creature...</h3>
            <p className="text-gray-400">Using AI to discover what you found</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center max-w-sm">
            <div className="text-6xl mb-4">⚠️</div>
            <div className="glass-effect rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Oops!</h3>
              <p className="text-red-300 text-sm mb-4">{error}</p>
              <button
                onClick={() => {
                  setError('');
                  setCapturedImage(null);
                }}
                className="nature-gradient rounded-lg px-6 py-2 text-white font-medium hover:opacity-90 transition-opacity"
                style={{ minHeight: '44px' }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
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