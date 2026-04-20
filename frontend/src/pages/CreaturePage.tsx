import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

export default function CreaturePage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [creatures, setCreatures] = useState<IdentificationResult[]>([]);
  const [profiles, setProfiles] = useState<CreatureProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    const state = location.state as {
      creatures: IdentificationResult[];
      imageUrl: string;
      location: { latitude: number; longitude: number } | null;
    } | null;

    if (!state?.creatures) {
      navigate('/app');
      return;
    }

    setCreatures(state.creatures);
    setImageUrl(state.imageUrl);
    setGpsLocation(state.location);
    generateProfiles(state.creatures, state.location);
  }, [location.state, navigate]);

  const generateProfiles = async (
    identifiedCreatures: IdentificationResult[],
    gps: { latitude: number; longitude: number } | null
  ): Promise<void> => {
    setLoading(true);
    setError('');

    try {
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
        setError('Please sign in to continue.');
        return;
      }

      const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const generatedProfiles: CreatureProfile[] = [];

      for (const creature of identifiedCreatures) {
        try {
          const requestBody: any = {
            identificationResult: creature,
          };

          if (gps) {
            requestBody.gps = gps;
          }

          // Retry logic for profile generation
          let lastError: Error | null = null;
          
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const response = await fetch(`${BASE_URL}/api/profile`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Server error: ${response.status}`);
              }

              const profile: CreatureProfile = await response.json();
              generatedProfiles.push(profile);
              break; // Success, exit retry loop
            } catch (err) {
              lastError = err instanceof Error ? err : new Error('Unknown error');
              
              if (attempt < 3) {
                // Wait before retry (exponential backoff: 1s, 2s)
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Profile attempt ${attempt} failed for ${creature.species}, retrying in ${delay}ms:`, lastError.message);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          
          if (lastError && generatedProfiles.length === 0) {
            throw lastError;
          }
        } catch (err) {
          console.error(`Failed to generate profile for ${creature.species}:`, err);
          // Continue with other creatures even if one fails
        }
      }

      if (generatedProfiles.length === 0) {
        setError('Failed to generate creature profiles. Please try again.');
        return;
      }

      setProfiles(generatedProfiles);
    } catch (err) {
      console.error('Profile generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate profiles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTalkToCreature = (profile: CreatureProfile): void => {
    navigate('/voice-session', { 
      state: { 
        profile,
        imageUrl 
      } 
    });
  };

  const handleSingWithCreature = (profile: CreatureProfile): void => {
    // For now, navigate to voice session and let user ask for singing
    navigate('/voice-session', { 
      state: { 
        profile,
        imageUrl,
        requestSong: true
      } 
    });
  };

  const handleBackToCamera = (): void => {
    navigate('/app');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0a0f0a' }}>
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Creating Creature Personality...</h2>
          <p className="text-gray-400">Generating unique voice and character</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0a0f0a' }}>
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">😔</div>
          <div className="glass-effect rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Something went wrong</h3>
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <button
              onClick={handleBackToCamera}
              className="nature-gradient rounded-lg px-6 py-2 text-white font-medium hover:opacity-90 transition-opacity"
              style={{ minHeight: '44px' }}
            >
              Try Another Photo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0f0a' }}>
      {/* Header */}
      <div className="glass-effect border-b border-green-500/20 p-4">
        <div className="flex items-center">
          <button
            onClick={handleBackToCamera}
            className="text-gray-400 hover:text-white transition-colors mr-4"
            style={{ minHeight: '44px' }}
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-white">Discovered Creatures</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Photo */}
        {imageUrl && (
          <div className="text-center">
            <img
              src={imageUrl}
              alt="Your photo"
              className="w-full max-w-sm mx-auto rounded-2xl border-2 border-green-500/30"
            />
          </div>
        )}

        {/* Creatures */}
        <div className="space-y-4">
          {profiles.map((profile, index) => (
            <div key={profile.id} className="creature-card rounded-2xl p-6">
              <div className="flex items-start space-x-4">
                {/* Avatar */}
                <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getCategoryColor(profile.category)} flex items-center justify-center text-2xl flex-shrink-0`}>
                  {getCategoryEmoji(profile.category)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-xl font-bold text-white">{profile.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getCategoryColor(profile.category)} text-white`}>
                      {profile.category}
                    </span>
                  </div>
                  
                  <p className="text-gray-300 text-sm mb-2">{profile.commonName}</p>
                  
                  <div className="flex flex-wrap gap-1 mb-3">
                    {profile.traits.slice(0, 3).map((trait, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-gray-700/50 rounded-full text-xs text-gray-300"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>
                  
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {profile.backstory}
                  </p>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => handleTalkToCreature(profile)}
                      className="w-full nature-gradient rounded-xl px-6 py-3 text-white font-semibold hover:opacity-90 transition-all duration-200 flex items-center justify-center"
                      style={{ minHeight: '48px' }}
                    >
                      <span className="text-lg mr-2">🗣️</span>
                      TALK
                    </button>

                    <button
                      onClick={() => handleSingWithCreature(profile)}
                      className="w-full nature-gradient-soft rounded-xl px-6 py-2 text-white font-medium hover:opacity-90 transition-all duration-200 flex items-center justify-center"
                      style={{ minHeight: '44px' }}
                    >
                      <span className="text-lg mr-2">🎵</span>
                      SING
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Multiple creatures note */}
        {profiles.length > 1 && (
          <div className="glass-effect rounded-xl p-4 text-center">
            <p className="text-gray-300 text-sm">
              🎉 You found {profiles.length} creatures! Talk to each one for a unique conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}