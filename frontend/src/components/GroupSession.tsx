import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ambientSoundEngine } from '../services/ambientSoundEngine';

interface CreatureProfile {
  id: string;
  name: string;
  category: string;
  traits: string[];
}

interface GroupSessionProps {
  profiles: CreatureProfile[];
  onSessionEnd: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  flower: 'bg-pink-200',
  insect: 'bg-yellow-200',
  tree: 'bg-green-200',
  squirrel: 'bg-orange-200',
  mushroom: 'bg-purple-200',
  bird: 'bg-blue-200',
  default: 'bg-gray-200',
};

export default function GroupSession({ profiles, onSessionEnd }: GroupSessionProps): JSX.Element {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [speakingProfileId, setSpeakingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  
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

        // Start ambient sound (use first creature's category)
        if (profiles.length > 0) {
          await ambientSoundEngine.start(profiles[0].category);
        }

        // Initialize AudioContext
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        // Connect WebSocket with multiple profile IDs
        const profileIds = profiles.map(p => p.id).join(',');
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
        const wsProtocol = apiBaseUrl.startsWith('https:') ? 'wss:' : 'ws:';
        const wsHost = apiBaseUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${wsHost}/ws/session?profileIds=${profileIds}&token=${session.access_token}`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = async () => {
          setIsConnected(true);
          
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
              }
            };

            mediaRecorder.start(100);
          } catch (err) {
            console.error('Microphone access error:', err);
            setError('Failed to access microphone');
          }
        };

        ws.onmessage = async (event) => {
          if (typeof event.data === 'string') {
            // JSON message (speaking event or error)
            try {
              const message = JSON.parse(event.data);
              if (message.type === 'speaking') {
                setSpeakingProfileId(message.profileId);
              } else if (message.type === 'error') {
                console.error('Session error:', message.detail);
              }
            } catch (err) {
              console.error('Failed to parse message:', err);
            }
          } else if (event.data instanceof Blob) {
            // Audio data from creature
            const arrayBuffer = await event.data.arrayBuffer();
            
            if (audioContextRef.current) {
              const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              source.start();
              
              source.onended = () => {
                setSpeakingProfileId(null);
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
          setError('Connection closed');
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
  }, [profiles]);

  const handleEndSession = (): void => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    onSessionEnd();
  };

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Group Conversation</h2>
          <p className="mt-2 text-base text-gray-600">
            {isConnected ? `${profiles.length} creatures connected` : 'Connecting...'}
          </p>
        </div>

        {/* Creature avatars */}
        <div className="grid grid-cols-2 gap-4">
          {profiles.map((profile) => {
            const isSpeaking = speakingProfileId === profile.id;
            const categoryColor = CATEGORY_COLORS[profile.category] || CATEGORY_COLORS.default;
            
            return (
              <div
                key={profile.id}
                className={`rounded-lg border-2 p-4 transition-all ${
                  isSpeaking
                    ? 'border-blue-500 bg-blue-50 shadow-lg'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Avatar circle */}
                <div
                  className={`mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full ${categoryColor}`}
                >
                  <span className="text-2xl">
                    {profile.category === 'flower' && '🌸'}
                    {profile.category === 'insect' && '🐛'}
                    {profile.category === 'tree' && '🌳'}
                    {profile.category === 'squirrel' && '🐿️'}
                    {profile.category === 'mushroom' && '🍄'}
                    {profile.category === 'bird' && '🐦'}
                    {profile.category === 'default' && '🌿'}
                  </span>
                </div>
                
                {/* Name */}
                <p className="text-center text-base font-medium text-gray-900">
                  {profile.name}
                </p>
                
                {/* Speaking indicator */}
                {isSpeaking && (
                  <p className="mt-1 text-center text-sm text-blue-600">Speaking...</p>
                )}
              </div>
            );
          })}
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
          End Group Conversation
        </button>
      </div>
    </div>
  );
}
