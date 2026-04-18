import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import AuthGuard from './components/AuthGuard';
import Header from './components/Header';
import OrientationGuard from './components/OrientationGuard';

// Protected app page placeholder
function AppPage(): JSX.Element {
  return (
    <AuthGuard>
      <Header />
      <div className="px-4 py-6">
        <div className="mx-auto max-w-md">
          <h2 className="text-xl font-bold">Welcome to WhisperWorld</h2>
          <p className="mt-4 text-base">Protected app content goes here.</p>
        </div>
      </div>
    </AuthGuard>
  );
}

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <OrientationGuard />
      {/* Mobile-first single-column layout: max-width 480px, centered */}
      <div
        style={{
          minHeight: '100dvh',
          fontSize: '16px',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '480px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <Routes>
          <Route path="/" element={<SignIn />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/app" element={<AppPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
