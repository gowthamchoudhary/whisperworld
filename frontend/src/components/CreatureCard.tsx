import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface IdentificationResult {
  species: string;
  commonName: string;
  habitat: string;
  confidence: number;
  category: string;
}

interface CreatureProfile {
  id: string;
  userId: string;
  species: string;
  commonName: string;
  category: string;
  name: string;
  traits: string[];
  backstory: string;
  speakingStyle: string;
  voiceId: string;
  location?: { lat: number; lng: number };
  createdAt: string;
  lastSeenAt: string;
}

interface CreatureCardProps {
  identification: IdentificationResult;
  gps?: { lat: number; lng: number };
  onProfileLoaded: (profile: CreatureProfile) => void;
  onTalkClick?: (profile: CreatureProfile) => void;
  onSingClick?: (profile: CreatureProfile) => void;
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

export default function CreatureCard({
  identification,
  gps,
  onProfileLoaded,
  onTalkClick,
  onSingClick,
}: CreatureCardProps): JSX.Element {
  const [profile, setProfile] = useState<CreatureProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const loadProfile = async (): Promise<void> => {
      setIsLoading(true);
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

        // Call profile API with retry logic
        const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const response = await fetch(`${BASE_URL}/api/profile`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                identificationResult: identification,
                gps: gps || null,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
              throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const loadedProfile: CreatureProfile = await response.json();
            setProfile(loadedProfile);
            onProfileLoaded(loadedProfile);
            return; // Success, exit retry loop
          } catch (err) {
            lastError = err instanceof Error ? err : new Error('Unknown error');
            
            if (attempt < 3) {
              // Wait before retry (exponential backoff: 1s, 2s)
              const delay = Math.pow(2, attempt - 1) * 1000;
              console.log(`Profile attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
        
        // All retries failed
        throw lastError;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load profile';
        setError(errorMessage);
        console.error('Profile load error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [identification, gps, onProfileLoaded]);

  if (isLoading) {
    return (
      <div className="creature-card rounded-2xl p-6 text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
        <p className="text-slate-300">Creating creature profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="creature-card rounded-2xl p-6 border-red-500/50">
        <div className="text-center">
          <div className="text-4xl mb-2">😔</div>
          <p className="text-red-300 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="nature-gradient rounded-lg px-4 py-2 text-white font-medium hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="creature-card rounded-2xl p-6">
        <p className="text-slate-400 text-center">No profile data available</p>
      </div>
    );
  }

  return (
    <div className="creature-card rounded-2xl p-6">
      <div className="flex items-start space-x-4 mb-6">
        {/* Creature Avatar */}
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getCategoryColor(profile.category)} flex items-center justify-center text-2xl flex-shrink-0`}>
          {getCategoryEmoji(profile.category)}
        </div>

        {/* Creature Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <h2 className="text-xl font-bold text-white">{profile.name}</h2>
            <span className={`px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getCategoryColor(profile.category)} text-white`}>
              {profile.category}
            </span>
          </div>
          
          <p className="text-slate-300 text-sm mb-2">{profile.commonName}</p>
          
          {/* Personality Traits */}
          <div className="flex flex-wrap gap-1 mb-3">
            {profile.traits.slice(0, 3).map((trait, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-slate-700/50 rounded-full text-xs text-slate-300"
              >
                {trait}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Backstory */}
      <div className="mb-6">
        <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">{profile.backstory}</p>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={() => onTalkClick?.(profile)}
          className="w-full nature-gradient rounded-xl px-6 py-4 text-white font-semibold text-lg hover:opacity-90 transition-all duration-200 flex items-center justify-center"
          style={{ minHeight: '56px' }}
        >
          <span className="text-2xl mr-3">🗣️</span>
          TALK
        </button>

        <button
          onClick={() => onSingClick?.(profile)}
          className="w-full nature-gradient-soft rounded-xl px-6 py-3 text-white font-medium hover:opacity-90 transition-all duration-200 flex items-center justify-center"
          style={{ minHeight: '48px' }}
        >
          <span className="text-xl mr-2">🎵</span>
          SING
        </button>
      </div>

      {/* Confidence Score */}
      <div className="mt-4 pt-4 border-t border-slate-600/50">
        <p className="text-xs text-slate-500 text-center">
          Confidence: {Math.round(identification.confidence * 100)}%
        </p>
      </div>
    </div>
  );
}
