import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import CameraPage from './pages/CameraPage';
import CreaturePage from './pages/CreaturePage';
import VoiceSessionPage from './pages/VoiceSessionPage';

function App(): JSX.Element {
  return (
    <BrowserRouter>
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
          <Route path="/" element={<CameraPage />} />
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/creature/:id" element={<CreaturePage />} />
          <Route path="/creature" element={<CreaturePage />} />
          <Route path="/session/:id" element={<VoiceSessionPage />} />
          <Route path="/voice-session" element={<VoiceSessionPage />} />
          <Route path="/sing/:id" element={<VoiceSessionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;