import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AuthGuard from '../components/AuthGuard';
import Header from '../components/Header';

interface SessionSummary {
  id: string;
  creatureProfileId: string;
  summary: string;
  durationSeconds: number;
  keyTopics: string[];
  createdAt: string;
  creatureName?: string;
}

export default function HistoryPage(): JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadHistory = async (): Promise<void> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('session_summaries')
          .select(`
            id,
            creature_profile_id,
            summary,
            duration_seconds,
            key_topics,
            created_at,
            creature_profiles (name)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        const formattedSessions: SessionSummary[] = (data || []).map((item: any) => ({
          id: item.id,
          creatureProfileId: item.creature_profile_id,
          summary: item.summary,
          durationSeconds: item.duration_seconds,
          keyTopics: item.key_topics || [],
          createdAt: item.created_at,
          creatureName: item.creature_profiles?.name,
        }));

        setSessions(formattedSessions);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, []);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />
        
        <div className="mx-auto max-w-md p-4">
          <h2 className="mb-6 text-2xl font-bold text-gray-900">Conversation History</h2>

          {isLoading && (
            <p className="text-base text-gray-600">Loading...</p>
          )}

          {!isLoading && sessions.length === 0 && (
            <div className="text-center">
              <p className="mb-4 text-base text-gray-600">No conversations yet</p>
              <Link
                to="/app"
                className="inline-block rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-700"
                style={{ minHeight: '44px' }}
              >
                Start your first conversation
              </Link>
            </div>
          )}

          {!isLoading && sessions.length > 0 && (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {session.creatureName || 'Unknown Creature'}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <p className="mb-2 text-base text-gray-600">{session.summary}</p>
                  
                  {session.keyTopics.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {session.keyTopics.map((topic, index) => (
                        <span
                          key={index}
                          className="rounded-md bg-gray-100 px-2 py-1 text-sm text-gray-700"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
