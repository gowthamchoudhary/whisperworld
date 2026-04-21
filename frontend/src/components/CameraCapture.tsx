import { useState, useRef, ChangeEvent } from 'react';

interface IdentificationResult {
  species: string;
  commonName: string;
  habitat: string;
  confidence: number;
  category: string;
}

interface CameraCaptureProps {
  onIdentificationComplete: (results: IdentificationResult[]) => void;
  onError: (error: string) => void;
}

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function CameraCapture({ onIdentificationComplete, onError }: CameraCaptureProps): JSX.Element {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return 'Invalid file type. Please upload a JPEG, PNG, WebP, or HEIC image.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 10 MB limit.';
    }
    return null;
  };

  const getGPSCoordinates = async (): Promise<{ lat: number; lng: number } | undefined> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(undefined);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('GPS error:', error);
          resolve(undefined);
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
    });
  };

  const uploadImage = async (file: File): Promise<void> => {
    setError('');
    setIsLoading(true);

    try {
      // Get GPS coordinates
      const gps = await getGPSCoordinates();

      // Build FormData
      const formData = new FormData();
      formData.append('file', file); // Fixed: changed from 'image' to 'file'
      if (gps) {
        formData.append('lat', gps.lat.toString());
        formData.append('lng', gps.lng.toString());
      }

      // POST to backend with retry logic
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(`${BASE_URL}/api/identify`, {
            method: 'POST',
            body: formData, // No auth headers needed
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
          }

          const results: IdentificationResult[] = await response.json();
          onIdentificationComplete(results);
          return; // Success, exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          
          if (attempt < 3) {
            // Wait before retry (exponential backoff: 1s, 2s)
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      throw lastError;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to identify image';
      setError(errorMessage);
      onError(errorMessage);
      console.error('Upload error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      onError(validationError);
      return;
    }

    await uploadImage(file);
  };

  const handleCameraClick = (): void => {
    setError('');
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Camera shutter button */}
      <button
        onClick={handleCameraClick}
        disabled={isLoading}
        className="camera-button flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg disabled:opacity-50"
        aria-label="Capture photo"
        style={{ minHeight: '80px', minWidth: '80px' }}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        ) : (
          <span className="text-4xl">📷</span>
        )}
      </button>

      {/* Hidden file input with camera capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Loading state */}
      {isLoading && (
        <p className="text-base text-slate-300">Identifying creature...</p>
      )}

      {/* Error message */}
      {error && (
        <div className="w-full max-w-md rounded-xl bg-red-900/50 border border-red-500/50 p-4 text-base text-red-200">
          {error}
          <button
            onClick={() => setError('')}
            className="mt-2 text-sm text-red-300 hover:text-red-100 underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
