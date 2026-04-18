import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Header(): JSX.Element {
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  const handleSignOut = async (): Promise<void> => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      // Clear any local state if needed
      // Navigate to landing page
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <h1 className="text-xl font-bold">WhisperWorld</h1>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="rounded bg-gray-600 px-4 py-2 text-base font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          {loading ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </header>
  );
}
