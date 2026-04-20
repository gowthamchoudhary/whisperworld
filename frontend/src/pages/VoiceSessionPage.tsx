import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

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
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const state = location.state as {
      profile: CreatureProfile;
      imageUrl: string;
    } | null;

    if (!state?.profile) {
      navigate('/app');
      return;
    }

    setProfile(state.profile);
    setImageUrl(state.imageUrl);
    
    // Start ambient sounds
    startAmbientSounds(state.profile.category);
  }, [location.state, navigate]);

  const startAmbientSounds = async (category: string): Promise<void> => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiBaseUrl}/api/ambient?category=${encodeURIComponent(category)}`);
      
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
    if (!profile) return;

    setIsConnecting(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to continue.');
        return;
      }

      // Initialize audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Connect WebSocket
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const wsProtocol = apiBaseUrl.startsWith('https:') ? 'wss:' : 'ws:';
      const wsHost = apiBaseUrl.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}//${wsHost}/ws/session?profileId=${profile.id}&token=${session.access_token}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        setIsConnecting(false);
        setReconnectAttempts(0);
        
        // Start capturing microphone audio
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm',
          });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
            }
          };

          mediaRecorder.start(100); // Send chunks every 100ms
          setIsUserSpeaking(true);
        } catch (err) {
          setError('Microphone access denied. Please allow microphone access to talk to the creature.');
        }
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          // Received audio from creature
          setIsSpeaking(true);
          
          try {
            const arrayBuffer = await event.data.arrayBuffer();
            const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
            
            const source = audioContextRef.current!.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current!.destination);
            
            source.onended = () => {
              setIsSpeaking(false);
            };
            
            source.start();
          } catch (err) {
            console.error('Audio playback error:', err);
            setIsSpeaking(false);
          }
        } else {
          // Handle text messages (speaking events, etc.)
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'speaking') {
              setIsSpeaking(message.speaking);
            }
          } catch (err) {
            // Ignore non-JSON messages
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error. Please try again.');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setIsSpeaking(false);
        
        // Attempt to reconnect
        if (reconnectAttempts < 3) {
          setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, 2000 * Math.pow(2, reconnectAttempts));
        } else {
          setError('Connection lost. Please try again.');
        }
      };

    } catch (err) {
      console.error('WebSocket connection error:', err);
      setError('Failed to connect. Please try again.');
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to continue.');
        return;
      }

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiBaseUrl}/api/sing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ profileId: profile.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate song');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsSinging(false);
      };
      
      await audio.play();
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="glass-effect border-b border-emerald-500/20 p-4">
        <div className="flex items-center">
          <button
            onClick={handleBack}
            className="text-slate-400 hover:text-white transition-colors mr-4"
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
          <p className="text-slate-400 mb-4">{profile.commonName}</p>
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {profile.traits.slice(0, 3).map((trait, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-slate-700/50 rounded-full text-sm text-slate-300"
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
            <p className="text-slate-400">Connecting to {profile.name}...</p>
          </div>
        )}

        {isConnected && (
          <div className="text-center space-y-4">
            {/* Speaking Status */}
            <div className="glass-effect rounded-2xl p-6 mb-6">
              {isSpeaking ? (
                <div className="text-emerald-400">
                  <div className="text-2xl mb-2">🗣️</div>
                  <p className="font-medium">{profile.name} is speaking...</p>
                </div>
              ) : isUserSpeaking ? (
                <div className="text-blue-400">
                  <div className="text-2xl mb-2">🎤</div>
                  <p className="font-medium">You can speak now</p>
                </div>
              ) : (
                <div className="text-slate-400">
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
                className="nature-gradient-soft rounded-xl px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
                    Ask to Sing
                  </>
                )}
              </button>

              <button
                onClick={disconnect}
                className="bg-slate-700/50 rounded-xl px-6 py-3 text-slate-300 font-medium hover:bg-slate-700/70 transition-colors"
                style={{ minHeight: '44px' }}
              >
                End Chat
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-effect rounded-xl p-4 border border-red-500/30 max-w-sm">
            <p className="text-red-300 text-sm text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}