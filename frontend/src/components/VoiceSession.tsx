import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

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
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<'creature' | 'user' | null>(null);
  const [error, setError] = useState<string>('');
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const [transcript, setTranscript] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const connectSession = async (): Promise<void> => {
    if (isConnecting || isConnected) return;
    
    setIsConnecting(true);
    setError('');

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

      // Initialize AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Connect WebSocket with retry logic
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const wsUrl = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
      const fullWsUrl = `${wsUrl}/ws/session?profileId=${profile.id}&token=${session.access_token}`;
      
      const ws = new WebSocket(fullWsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        setIsConnecting(false);
        setReconnectAttempts(0);
        
        // Start capturing microphone audio
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 16000
            } 
          });
          streamRef.current = stream;
          
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
          });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
              setIsSpeaking('user');
            }
          };

          mediaRecorder.onstop = () => {
            setIsSpeaking(null);
          };

          mediaRecorder.start(100); // Send chunks every 100ms
        } catch (err) {
          console.error('Microphone access error:', err);
          setError('Microphone access denied. Please allow microphone access to talk.');
        }
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          // Audio data from creature
          setIsSpeaking('creature');
          
          try {
            const arrayBuffer = await event.data.arrayBuffer();
            
            if (audioContextRef.current) {
              const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              
              source.onended = () => {
                setIsSpeaking(null);
              };
              
              source.start();
            }
          } catch (err) {
            console.error('Audio playback error:', err);
            setIsSpeaking(null);
          }
        } else {
          // Text message (transcript, status, etc.)
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'transcript') {
              setTranscript(prev => [...prev, `${message.speaker}: ${message.text}`]);
            } else if (message.type === 'speaking') {
              setIsSpeaking(message.speaking ? 'creature' : null);
            }
          } catch (err) {
            // Handle plain text messages
            if (typeof event.data === 'string') {
              setTranscript(prev => [...prev, `${profile.name}: ${event.data}`]);
            }
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error occurred');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setIsSpeaking(null);
        
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
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    // Start ambient sound for the category
    const startAmbientSound = async (): Promise<void> => {
      try {
        const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
        const response = await fetch(`${BASE_URL}/api/ambient`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category: profile.category }),
        });
        
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.loop = true;
          audio.volume = 0.2;
          audio.play().catch(() => {
            // Ambient sounds are optional, fail silently
          });
        }
      } catch (err) {
        // Ambient sounds are optional, fail silently
        console.log('Ambient sounds not available');
      }
    };

    startAmbientSound();

    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [profile.category]);

  const handleEndSession = (): void => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    onSessionEnd();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Creature name */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
          <p className="mt-2 text-base text-slate-400">
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
          </p>
        </div>

        {/* Speaking indicator */}
        <div className={`flex h-32 items-center justify-center rounded-2xl glass-effect ${isSpeaking === 'creature' ? 'speaking-animation' : ''}`}>
          {isSpeaking === 'creature' && (
            <div className="text-center">
              <div className="mb-2 text-4xl animate-pulse">🗣️</div>
              <p className="text-base font-medium text-emerald-400">{profile.name} is speaking</p>
            </div>
          )}
          {isSpeaking === 'user' && (
            <div className="text-center">
              <div className="mb-2 text-4xl animate-pulse">🎤</div>
              <p className="text-base font-medium text-blue-400">You are speaking</p>
            </div>
          )}
          {!isSpeaking && isConnected && (
            <div className="text-center">
              <div className="mb-2 text-4xl">👂</div>
              <p className="text-base text-slate-400">Listening...</p>
            </div>
          )}
          {!isConnected && !isConnecting && (
            <div className="text-center">
              <button
                onClick={connectSession}
                className="nature-gradient rounded-xl px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity"
                style={{ minHeight: '44px' }}
              >
                Start Conversation
              </button>
            </div>
          )}
          {isConnecting && (
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
              </div>
              <p className="text-base text-slate-400">Connecting...</p>
            </div>
          )}
        </div>

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="glass-effect rounded-2xl p-4 max-h-32 overflow-y-auto">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Conversation</h3>
            <div className="space-y-1">
              {transcript.slice(-5).map((line, index) => (
                <p key={index} className="text-xs text-slate-400">{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="rounded-xl bg-red-900/50 border border-red-500/50 p-4 text-base text-red-200">
            {error}
            <button
              onClick={() => {
                setError('');
                connectSession();
              }}
              className="mt-2 text-sm text-red-300 hover:text-red-100 underline block"
            >
              Try again
            </button>
          </div>
        )}

        {/* End session button */}
        <button
          onClick={handleEndSession}
          className="w-full rounded-xl bg-slate-700/50 px-4 py-3 text-base font-medium text-slate-300 hover:bg-slate-700/70 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors"
          style={{ minHeight: '44px' }}
        >
          End Conversation
        </button>
      </div>
    </div>
  );
}
