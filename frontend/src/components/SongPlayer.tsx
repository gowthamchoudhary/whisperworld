import { useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

interface SongPlayerProps {
  profileId: string;
  creatureName: string;
}

export default function SongPlayer({ profileId, creatureName }: SongPlayerProps): JSX.Element {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const handleRequestSong = async (): Promise<void> => {
    setIsLoading(true);
    setError('');

    try {
      // Get JWT token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Request song from backend
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiBaseUrl}/api/sing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ profile_id: profileId }),
      });

      if (!response.ok) {
        if (response.status === 504) {
          throw new Error(`${creatureName} is unable to sing right now. Please try again.`);
        }
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      // Get audio data
      const audioBlob = await response.blob();
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Initialize AudioContext if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Decode and play audio
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      sourceNodeRef.current = source;
      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      };

      source.start();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate song';
      setError(errorMessage);
      console.error('Song generation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSong = (): void => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
      setIsPlaying(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Request song button */}
      {!isPlaying && (
        <button
          onClick={handleRequestSong}
          disabled={isLoading}
          className="w-full rounded-lg bg-purple-600 px-4 py-3 text-base font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50"
          style={{ minHeight: '44px' }}
        >
          {isLoading ? 'Creating song...' : `Ask ${creatureName} to sing 🎵`}
        </button>
      )}

      {/* Stop song button */}
      {isPlaying && (
        <button
          onClick={handleStopSong}
          className="w-full rounded-lg bg-gray-600 px-4 py-3 text-base font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          style={{ minHeight: '44px' }}
        >
          Stop song
        </button>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-yellow-100 p-4 text-base text-yellow-800">
          {error}
        </div>
      )}
    </div>
  );
}
