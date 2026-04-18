import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AuthGuard from '../components/AuthGuard';
import VoiceSession from '../components/VoiceSession';
import GroupSession from '../components/GroupSession';
import SongPlayer from '../components/SongPlayer';

interface CreatureProfile {
  id: string;
  name: string;
  category: string;
  traits: string[];
}

export default function SessionPage(): JSX.Element {
  const { profileIds } = useParams<{ profileIds: string }>();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<CreatureProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const loadProfiles = async (): Promise<void> => {
      if (!profileIds) {
        setError('No profile IDs provided');
        setIsLoading(false);
        return;
      }

      try {
        const ids = profileIds.split(',');
        const loadedProfiles: CreatureProfile[] = [];

        for (const id of ids) {
          const { data, error: fetchError } = await supabase
            .from('creature_profiles')
            .select('id, name, category, traits')
            .eq('id', id)
            .single();

          if (fetchError) throw fetchError;
          if (data) loadedProfiles.push(data);
        }

        setProfiles(loadedProfiles);
      } catch (err) {
        console.error('Failed to load profiles:', err);
        setError('Failed to load creature profiles');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfiles();
  }, [profileIds]);

  const handleSessionEnd = (): void => {
    navigate('/app');
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-base text-gray-600">Loading...</p>
        </div>
      </AuthGuard>
    );
  }

  if (error || profiles.length === 0) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md text-center">
            <p className="mb-4 text-base text-red-600">{error || 'No profiles found'}</p>
            <button
              onClick={() => navigate('/app')}
              className="rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-700"
              style={{ minHeight: '44px' }}
            >
              Back to App
            </button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  const isGroupSession = profiles.length > 1;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        {isGroupSession ? (
          <GroupSession profiles={profiles} onSessionEnd={handleSessionEnd} />
        ) : (
          <>
            <VoiceSession profile={profiles[0]} onSessionEnd={handleSessionEnd} />
            <div className="fixed bottom-0 left-0 right-0 bg-white p-4 shadow-lg">
              <div className="mx-auto max-w-md">
                <SongPlayer profileId={profiles[0].id} creatureName={profiles[0].name} />
              </div>
            </div>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
