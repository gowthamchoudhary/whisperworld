import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface CreatureProfile {
  id: string;
  species: string;
  commonName: string;
  category: string;
  name: string;
  traits: string[];
  backstory: string;
  speakingStyle: string;
  voiceId: string;
}

const getCategoryEmoji = (category: string): string => {
  const emojiMap: Record<string, string> = {
    flower: '🌸',
    insect: '🐛',
    tree: '🌳',
    squirrel: '🐿️',
    mushroom: '🍄',
    bird: '🐦',
    default: '🌿',
  };
  return emojiMap[category] || emojiMap.default;
};

const getCategoryColor = (category: string): string => {
  const colorMap: Record<string, string> = {
    flower: 'from-pink-500 to-rose-500',
    insect: 'from-amber-500 to-orange-500',
    tree: 'from-green-600 to-emerald-600',
    squirrel: 'from-amber-600 to-yellow-600',
    mushroom: 'from-purple-500 to-violet-500',
    bird: 'from-blue-500 to-cyan-500',
    default: 'from-emerald-500 to-green-500',
  };
  return colorMap[category] || colorMap.default;
};

export default function VoiceSessionPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CreatureProfile | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const [isSinging, setIsSinging] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const state = location.state as {
      profile: CreatureProfile;
      imageUrl: string;
      requestSong?: boolean;
    } | null;

    if (!state?.profile) {
      navigate('/');
      return;
    }

    setProfile(state.profile);
    setImageUrl(state.imageUrl);
    
    // Start ambient sounds
    startAmbientSounds(state.profile.category);
  }, [location.state, navigate]);

  const startAmbientSounds = async (category: string): Promise<void> => {
    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${BASE_URL}/api/ambient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category }),
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

  const connectWebSocket = async (): Promise<void> => {
    if (!profile || isConnecting || isConnected) return;

    setIsConnecting(true);
    setError('');

    try {
      // Initialize audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Connect WebSocket with retry logic (no auth needed)
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const wsUrl = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
      const fullWsUrl = `${wsUrl}/ws/session?profileId=${profile.id}`;
      
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
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
                }
              };

              mediaRecorder.onstop = () => {
                setIsUserSpeaking(false);
              };

              mediaRecorder.start(100); // Send chunks every 100ms
              setIsUserSpeaking(true);
            } catch (err) {
              console.error('Microphone access error:', err);
              setError('Microphone access denied. Please allow microphone access to talk.');
            }
          };

          ws.onmessage = async (event) => {
            if (event.data instanceof Blob) {
              // Audio data from creature
              setIsSpeaking(true);
              
              try {
                const arrayBuffer = await event.data.arrayBuffer();
                
                if (audioContextRef.current) {
                  const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                  const source = audioContextRef.current.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(audioContextRef.current.destination);
                  
                  source.onended = () => {
                    setIsSpeaking(false);
                  };
                  
                  source.start();
                }
              } catch (err) {
                console.error('Audio playback error:', err);
                setIsSpeaking(false);
              }
            } else {
              // Text message (transcript, status, etc.)
              try {
                const message = JSON.parse(event.data);
                if (message.type === 'transcript') {
                  setTranscript(prev => [...prev, `${message.speaker}: ${message.text}`]);
                } else if (message.type === 'speaking') {
                  setIsSpeaking(message.speaking);
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
            throw new Error('Connection error occurred');
          };

          ws.onclose = () => {
            setIsConnected(false);
            setIsConnecting(false);
            setIsSpeaking(false);
            
            // Attempt reconnection (max 3 times)
            if (reconnectAttempts < 3) {
              const backoff = Math.pow(2, reconnectAttempts) * 1000;
              setTimeout(() => {
                setReconnectAttempts(prev => prev + 1);
                connectWebSocket();
              }, backoff);
            } else {
              setError('Connection lost. Please try again.');
            }
          };
          
          return; // Success, exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          
          if (attempt < 3) {
            // Wait before retry (exponential backoff: 1s, 2s)
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`WebSocket attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      throw lastError;
    } catch (err) {
      console.error('WebSocket connection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  };

  const disconnect = (): void => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsConnected(false);
    setIsUserSpeaking(false);
    setIsSpeaking(false);
  };

  const handleSing = async (): Promise<void> => {
    if (!profile || isSinging) return;

    setIsSinging(true);
    
    try {
      // Call sing API with retry logic (no auth needed)
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(`${BASE_URL}/api/sing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ profileId: profile.id }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to generate song');
          }

          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          audio.onended = () => {
            setIsSinging(false);
            URL.revokeObjectURL(audioUrl);
          };
          
          await audio.play();
          return; // Success, exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          
          if (attempt < 3) {
            // Wait before retry (exponential backoff: 1s, 2s)
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`Sing attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      throw lastError;
    } catch (err) {
      console.error('Singing error:', err);
      setError('Failed to generate song. Please try again.');
      setIsSinging(false);
    }
  };

  const handleBack = (): void => {
    disconnect();
    navigate(-1);
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0f0a' }}>
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0f0a' }}>
      {/* Header */}
      <div className="glass-effect border-b border-green-500/20 p-4">
        <div className="flex items-center">
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-white transition-colors mr-4"
            style={{ minHeight: '44px' }}
          >
            ← Back
          </button>
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getCategoryColor(profile.category)} flex items-center justify-center text-sm mr-3`}>
              {getCategoryEmoji(profile.category)}
            </div>
            <h1 className="text-xl font-bold text-white">{profile.name}</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Creature Avatar */}
        <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${getCategoryColor(profile.category)} flex items-center justify-center text-6xl mb-6 ${isSpeaking ? 'speaking-animation' : ''}`}>
          {getCategoryEmoji(profile.category)}
        </div>

        {/* Creature Info */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">{profile.name}</h2>
          <p className="text-gray-400 mb-4">{profile.commonName}</p>
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {profile.traits.slice(0, 3).map((trait, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-gray-700/50 rounded-full text-sm text-gray-300"
              >
                {trait}
              </span>
            ))}
          </div>
        </div>

        {/* Connection Status */}
        {!isConnected && !isConnecting && (
          <div className="text-center mb-6">
            <button
              onClick={connectWebSocket}
              className="nature-gradient rounded-2xl px-8 py-4 text-white font-semibold text-lg hover:opacity-90 transition-opacity"
              style={{ minHeight: '60px' }}
            >
              <span className="text-2xl mr-3">🎤</span>
              Start Conversation
            </button>
          </div>
        )}

        {isConnecting && (
          <div className="text-center mb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
            <p className="text-gray-400">Connecting to {profile.name}...</p>
          </div>
        )}

        {isConnected && (
          <div className="text-center space-y-4 w-full max-w-sm">
            {/* Speaking Status */}
            <div className="glass-effect rounded-2xl p-6 mb-6">
              {isSpeaking ? (
                <div className="text-green-400">
                  <div className="text-2xl mb-2 animate-pulse">🗣️</div>
                  <p className="font-medium">{profile.name} is speaking...</p>
                </div>
              ) : isUserSpeaking ? (
                <div className="text-blue-400">
                  <div className="text-2xl mb-2 animate-pulse">🎤</div>
                  <p className="font-medium">You can speak now</p>
                </div>
              ) : (
                <div className="text-gray-400">
                  <div className="text-2xl mb-2">👂</div>
                  <p className="font-medium">Listening...</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={handleSing}
                disabled={isSinging}
                className="flex-1 nature-gradient-soft rounded-xl px-4 py-3 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ minHeight: '44px' }}
              >
                {isSinging ? (
                  <>
                    <span className="text-lg mr-2">🎵</span>
                    Singing...
                  </>
                ) : (
                  <>
                    <span className="text-lg mr-2">🎵</span>
                    Sing
                  </>
                )}
              </button>

              <button
                onClick={disconnect}
                className="flex-1 bg-gray-700/50 rounded-xl px-4 py-3 text-gray-300 font-medium hover:bg-gray-700/70 transition-colors"
                style={{ minHeight: '44px' }}
              >
                End Chat
              </button>
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="glass-effect rounded-2xl p-4 max-h-32 overflow-y-auto w-full max-w-sm mt-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Conversation</h3>
            <div className="space-y-1">
              {transcript.slice(-5).map((line, index) => (
                <p key={index} className="text-xs text-gray-400">{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-effect rounded-xl p-4 border border-red-500/30 max-w-sm mt-4">
            <p className="text-red-300 text-sm text-center">{error}</p>
            <button
              onClick={() => {
                setError('');
                connectWebSocket();
              }}
              className="mt-2 text-sm text-red-300 hover:text-red-100 underline block mx-auto"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}