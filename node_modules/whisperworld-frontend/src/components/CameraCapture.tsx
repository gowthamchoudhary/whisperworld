import { useState, useRef, ChangeEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

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

      // Get JWT token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Build FormData
      const formData = new FormData();
      formData.append('file', file);
      if (gps) {
        formData.append('lat', gps.lat.toString());
        formData.append('lng', gps.lng.toString());
      }

      // POST to backend
      const response = await fetch('/api/identify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const results: IdentificationResult[] = await response.json();
      onIdentificationComplete(results);
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
        className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg disabled:bg-gray-400"
        aria-label="Capture photo"
      >
        {isLoading ? (
          <span className="text-2xl">⏳</span>
        ) : (
          <span className="text-3xl">📷</span>
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
        <p className="text-base text-gray-600">Identifying creature...</p>
      )}

      {/* Error message */}
      {error && (
        <div className="w-full max-w-md rounded-md bg-red-100 p-4 text-base text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
