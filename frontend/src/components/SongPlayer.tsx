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
  const [lyrics, setLyrics] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleRequestSong = async (): Promise<void> => {
    setIsLoading(true);
    setError('');
    setLyrics('');

    try {
      // Get session (demo or real)
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
        throw new Error('Not authenticated');
      }

      // Request song from backend with retry logic
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(`${BASE_URL}/api/sing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ 
              profileId: profileId,
              theme: 'nature' // Default theme
            }),
          });

          if (!response.ok) {
            if (response.status === 504) {
              throw new Error(`${creatureName} is unable to sing right now. Please try again.`);
            }
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(errorData.detail || `Server error: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.audio_url) {
            // Play audio from URL
            const audio = new Audio(result.audio_url);
            audioRef.current = audio;
            
            audio.onloadstart = () => setIsPlaying(true);
            audio.onended = () => {
              setIsPlaying(false);
              audioRef.current = null;
            };
            audio.onerror = () => {
              setIsPlaying(false);
              setError('Failed to play song');
              audioRef.current = null;
            };
            
            if (result.lyrics) {
              setLyrics(result.lyrics);
            }
            
            await audio.play();
            return; // Success, exit retry loop
          } else {
            // Handle audio blob response
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            
            audio.onloadstart = () => setIsPlaying(true);
            audio.onended = () => {
              setIsPlaying(false);
              URL.revokeObjectURL(audioUrl);
              audioRef.current = null;
            };
            audio.onerror = () => {
              setIsPlaying(false);
              setError('Failed to play song');
              URL.revokeObjectURL(audioUrl);
              audioRef.current = null;
            };
            
            await audio.play();
            return; // Success, exit retry loop
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          
          if (attempt < 3) {
            // Wait before retry (exponential backoff: 1s, 2s)
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`Song attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      throw lastError;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate song';
      setError(errorMessage);
      console.error('Song generation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSong = (): void => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setIsPlaying(false);
      setLyrics('');
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Request song button */}
      {!isPlaying && (
        <button
          onClick={handleRequestSong}
          disabled={isLoading}
          className="w-full nature-gradient-soft rounded-xl px-4 py-3 text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 transition-all duration-200"
          style={{ minHeight: '44px' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Creating song...
            </div>
          ) : (
            <>
              <span className="text-lg mr-2">🎵</span>
              Ask {creatureName} to sing
            </>
          )}
        </button>
      )}

      {/* Now playing */}
      {isPlaying && (
        <div className="glass-effect rounded-2xl p-6 text-center">
          <div className="text-4xl mb-4 animate-pulse">🎵</div>
          <h3 className="text-lg font-semibold text-white mb-2">{creatureName} is singing</h3>
          
          {/* Music visualizer animation */}
          <div className="flex justify-center items-end space-x-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-emerald-500 rounded-full animate-pulse"
                style={{
                  width: '4px',
                  height: `${Math.random() * 20 + 10}px`,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '0.8s'
                }}
              />
            ))}
          </div>
          
          {/* Lyrics */}
          {lyrics && (
            <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
              <p className="text-sm text-slate-300 italic">{lyrics}</p>
            </div>
          )}
          
          <button
            onClick={handleStopSong}
            className="bg-slate-700/50 rounded-lg px-6 py-2 text-slate-300 font-medium hover:bg-slate-700/70 transition-colors"
            style={{ minHeight: '40px' }}
          >
            Stop
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-xl bg-yellow-900/50 border border-yellow-500/50 p-4 text-base text-yellow-200">
          {error}
          <button
            onClick={() => setError('')}
            className="mt-2 text-sm text-yellow-300 hover:text-yellow-100 underline block"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
