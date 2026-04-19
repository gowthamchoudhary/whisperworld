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
}

const CATEGORY_COLORS: Record<string, string> = {
  flower: 'bg-pink-100 text-pink-800',
  insect: 'bg-yellow-100 text-yellow-800',
  tree: 'bg-green-100 text-green-800',
  squirrel: 'bg-orange-100 text-orange-800',
  mushroom: 'bg-purple-100 text-purple-800',
  bird: 'bg-blue-100 text-blue-800',
  default: 'bg-gray-100 text-gray-800',
};

export default function CreatureCard({
  identification,
  gps,
  onProfileLoaded,
}: CreatureCardProps): JSX.Element {
  const [profile, setProfile] = useState<CreatureProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const loadProfile = async (): Promise<void> => {
      setIsLoading(true);
      setError('');

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Not authenticated');
        }

        const response = await fetch('/api/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            identification_result: identification,
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
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-center">
          <p className="text-base text-gray-600">Creating creature profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-base text-red-800">{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-base text-gray-600">No profile data available</p>
      </div>
    );
  }

  const categoryColor = CATEGORY_COLORS[profile.category] || CATEGORY_COLORS.default;

  return (
    <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-md">
      {/* Creature name and category badge */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
          <p className="text-base text-gray-600">{profile.commonName}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${categoryColor}`}
        >
          {profile.category}
        </span>
      </div>

      {/* Personality traits */}
      <div className="mb-4">
        <h3 className="mb-2 text-base font-semibold text-gray-700">Personality</h3>
        <div className="flex flex-wrap gap-2">
          {profile.traits.map((trait, index) => (
            <span
              key={index}
              className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700"
            >
              {trait}
            </span>
          ))}
        </div>
      </div>

      {/* Backstory */}
      <div className="mb-4">
        <h3 className="mb-2 text-base font-semibold text-gray-700">Backstory</h3>
        <p className="text-base leading-relaxed text-gray-600">{profile.backstory}</p>
      </div>

      {/* Speaking style */}
      <div className="mb-4">
        <h3 className="mb-2 text-base font-semibold text-gray-700">Speaking Style</h3>
        <p className="text-base italic text-gray-600">{profile.speakingStyle}</p>
      </div>

      {/* Confidence score */}
      <div className="mt-4 border-t border-gray-200 pt-4">
        <p className="text-sm text-gray-500">
          Confidence: {Math.round(identification.confidence * 100)}%
        </p>
      </div>
    </div>
  );
}
