import { useEffect, useState, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps): JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async (): Promise<void> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(session !== null);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(session !== null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-base">Loading...</div>
      </div>
    );
  }

  // Not authenticated - redirect to landing/sign-in
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Authenticated - render children
  return <>{children}</>;
}
