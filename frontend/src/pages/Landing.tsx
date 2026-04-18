import { Link } from 'react-router-dom';

export default function Landing(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">WhisperWorld</h1>
        <p className="mb-8 text-lg text-gray-600">
          Talk to nature. Photograph any living thing and have a real-time voice conversation with it.
        </p>
        
        <div className="space-y-4">
          <Link
            to="/signin"
            className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            style={{ minHeight: '44px' }}
          >
            Sign In
          </Link>
          
          <Link
            to="/signup"
            className="block w-full rounded-lg border-2 border-blue-600 bg-white px-4 py-3 text-base font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            style={{ minHeight: '44px' }}
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
