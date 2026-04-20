import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function SignUp(): JSX.Element {
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
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      navigate('/app');
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = (): void => {
    // Set demo mode in localStorage and navigate directly
    localStorage.setItem('demoMode', 'true');
    localStorage.setItem('demoUser', JSON.stringify({
      id: 'demo-user-123',
      email: 'demo@whisperworld.app',
      access_token: 'demo-token-123'
    }));
    navigate('/app');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: '#0a0f0a' }}>
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🌿</div>
          <h1 className="text-3xl font-bold text-white mb-2">WhisperWorld</h1>
          <p className="text-gray-400">Talk to nature's creatures</p>
        </div>
        
        <div className="glass-effect rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">Join WhisperWorld</h2>
          
          {/* Demo Button */}
          <div className="mb-6">
            <button
              onClick={handleDemoMode}
              disabled={loading}
              className="w-full nature-gradient rounded-lg px-4 py-3 text-white font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 transition-all duration-200 mb-4"
              style={{ minHeight: '44px' }}
            >
              <span className="text-lg mr-2">🚀</span>
              Try Demo (No signup needed!)
            </button>
            <p className="text-center text-xs text-gray-500">
              Instant access • No email required • Full features
            </p>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-900 text-gray-400">or create your own account</span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-900/50 border border-red-500/50 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg bg-gray-800/50 border border-gray-600 px-4 py-3 text-white placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                placeholder="Enter your email"
                style={{ minHeight: '44px' }}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg bg-gray-800/50 border border-gray-600 px-4 py-3 text-white placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                placeholder="Create a password"
                style={{ minHeight: '44px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-700/50 rounded-lg px-4 py-3 text-gray-300 font-medium hover:bg-gray-700/70 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 transition-all duration-200"
              style={{ minHeight: '44px' }}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-300 mr-2"></div>
                  Creating account...
                </div>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            Already have an account?{' '}
            <Link
              to="/signin"
              className="text-green-400 hover:text-green-300 font-medium transition-colors"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}