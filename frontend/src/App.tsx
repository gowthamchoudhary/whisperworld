import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import CameraPage from './pages/CameraPage';
import CreaturePage from './pages/CreaturePage';
import VoiceSessionPage from './pages/VoiceSessionPage';
import AuthGuard from './components/AuthGuard';
import OrientationGuard from './components/OrientationGuard';

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
          <Route 
            path="/app" 
            element={
              <AuthGuard>
                <CameraPage />
              </AuthGuard>
            } 
          />
          <Route 
            path="/creature" 
            element={
              <AuthGuard>
                <CreaturePage />
              </AuthGuard>
            } 
          />
          <Route 
            path="/voice-session" 
            element={
              <AuthGuard>
                <VoiceSessionPage />
              </AuthGuard>
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;