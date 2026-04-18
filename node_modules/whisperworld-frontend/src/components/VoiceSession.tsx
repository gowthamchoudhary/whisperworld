import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ambientSoundEngine } from '../services/ambientSoundEngine';

interface CreatureProfile {
  id: string;
  name: string;
  category: string;
}

interface VoiceSessionProps {
  profile: CreatureProfile;
  onSessionEnd: () => void;
}

export default function VoiceSession({ profile, onSessionEnd }: VoiceSessionProps): JSX.Element {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<'creature' | 'user' | null>(null);
  const [error, setError] = useState<string>('');
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    const connectSession = async (): Promise<void> => {
      try {
        // Get JWT token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Not authenticated');
        }

        // Start ambient sound
        await ambientSoundEngine.start(profile.category);

        // Initialize AudioContext
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        // Connect WebSocket
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/session?profileId=${profile.id}&token=${session.access_token}`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = async () => {
          setIsConnected(true);
          setReconnectAttempts(0);
          
          // Start capturing microphone audio
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm',
            });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                ws.send(event.data);
                setIsSpeaking('user');
              }
            };

            mediaRecorder.start(100); // Send chunks every 100ms
          } catch (err) {
            console.error('Microphone access error:', err);
            setError('Failed to access microphone');
          }
        };

        ws.onmessage = async (event) => {
          if (event.data instanceof Blob) {
            // Audio data from creature
            setIsSpeaking('creature');
            const arrayBuffer = await event.data.arrayBuffer();
            
            if (audioContextRef.current) {
              const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              source.start();
              
              source.onended = () => {
                setIsSpeaking(null);
              };
            }
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError('Connection error occurred');
        };

        ws.onclose = () => {
          setIsConnected(false);
          
          // Attempt reconnection (max 3 times)
          if (reconnectAttempts < 3) {
            const backoff = Math.pow(2, reconnectAttempts) * 1000;
            setTimeout(() => {
              setReconnectAttempts(prev => prev + 1);
              connectSession();
            }, backoff);
          } else {
            setError('Connection lost. Please try again.');
          }
        };
      } catch (err) {
        console.error('Session connection error:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    };

    connectSession();

    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      ambientSoundEngine.stop();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [profile.id, profile.category, reconnectAttempts]);

  const handleEndSession = (): void => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    onSessionEnd();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Creature name */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">{profile.name}</h2>
          <p className="mt-2 text-base text-gray-600">
            {isConnected ? 'Connected' : 'Connecting...'}
          </p>
        </div>

        {/* Speaking indicator */}
        <div className="flex h-32 items-center justify-center rounded-lg bg-gray-100">
          {isSpeaking === 'creature' && (
            <div className="text-center">
              <div className="mb-2 text-4xl">🗣️</div>
              <p className="text-base font-medium text-gray-900">{profile.name} is speaking</p>
            </div>
          )}
          {isSpeaking === 'user' && (
            <div className="text-center">
              <div className="mb-2 text-4xl">🎤</div>
              <p className="text-base font-medium text-gray-900">You are speaking</p>
            </div>
          )}
          {!isSpeaking && isConnected && (
            <div className="text-center">
              <div className="mb-2 text-4xl">👂</div>
              <p className="text-base text-gray-600">Listening...</p>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-100 p-4 text-base text-red-800">
            {error}
          </div>
        )}

        {/* End session button */}
        <button
          onClick={handleEndSession}
          className="w-full rounded-lg bg-red-600 px-4 py-3 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          style={{ minHeight: '44px' }}
        >
          End Conversation
        </button>
      </div>
    </div>
  );
}
