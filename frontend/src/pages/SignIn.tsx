import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function SignIn(): JSX.Element {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      navigate('/app');
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (): Promise<void> => {
    setError('');
    setLoading(true);

    try {
      // Try to sign in with demo account, create if doesn't exist
      const demoEmail = 'demo@whisperworld.app';
      const demoPassword = 'demo123456';

      let { error: signInError } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });

      if (signInError && signInError.message.includes('Invalid login credentials')) {
        // Demo account doesn't exist, create it
        const { error: signUpError } = await supabase.auth.signUp({
          email: demoEmail,
          password: demoPassword,
        });

        if (signUpError) {
          setError('Failed to create demo account. Please try manual sign up.');
          return;
        }

        // Try signing in again
        const { error: retrySignInError } = await supabase.auth.signInWithPassword({
          email: demoEmail,
          password: demoPassword,
        });

        if (retrySignInError) {
          setError('Demo account created! Please try the demo button again.');
          return;
        }
      } else if (signInError) {
        setError(signInError.message);
        return;
      }

      navigate('/app');
    } catch (err) {
      setError('Demo login failed. Please try manual sign up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🌿</div>
          <h1 className="text-3xl font-bold text-white mb-2">WhisperWorld</h1>
          <p className="text-slate-400">Talk to nature's creatures</p>
        </div>
        
        <div className="glass-effect rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">Welcome Back</h2>
          
          {/* Demo Button */}
          <div className="mb-6">
            <button
              onClick={handleDemoLogin}
              disabled={loading}
              className="w-full nature-gradient rounded-lg px-4 py-3 text-white font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 transition-all duration-200 mb-4"
              style={{ minHeight: '44px' }}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Loading demo...
                </div>
              ) : (
                <>
                  <span className="text-lg mr-2">🚀</span>
                  Try Demo (No signup needed!)
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-500">
              Instant access • No email required • Full features
            </p>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-900 text-slate-400">or sign in with your account</span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-900/50 border border-red-500/50 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-800/50 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Enter your email"
                style={{ minHeight: '44px' }}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-800/50 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Enter your password"
                style={{ minHeight: '44px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-700/50 rounded-lg px-4 py-3 text-slate-300 font-medium hover:bg-slate-700/70 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 transition-all duration-200"
              style={{ minHeight: '44px' }}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-300 mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <Link
              to="/signup"
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}