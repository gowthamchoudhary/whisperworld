import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard';
import Header from '../components/Header';
import CameraCapture from '../components/CameraCapture';
import CreatureCard from '../components/CreatureCard';

interface IdentificationResult {
  species: string;
  commonName: string;
  habitat: string;
  confidence: number;
  category: string;
}

interface CreatureProfile {
  id: string;
  userId: string;
  species: string;
  commonName: string;
  category: string;
  name: string;
  traits: string[];
  backstory: string;
  speakingStyle: string;
  voiceId: string;
  location?: { lat: number; lng: number };
  createdAt: string;
  lastSeenAt: string;
}

export default function AppPage(): JSX.Element {
  const [identifications, setIdentifications] = useState<IdentificationResult[]>([]);
  const [profiles, setProfiles] = useState<CreatureProfile[]>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number } | undefined>();
  const navigate = useNavigate();

  const handleIdentificationComplete = (results: IdentificationResult[]): void => {
    setIdentifications(results);
    setProfiles([]);
  };

  const handleError = (error: string): void => {
    console.error('Camera error:', error);
  };

  const handleProfileLoaded = (profile: CreatureProfile): void => {
    setProfiles(prev => [...prev, profile]);
  };

  const handleStartConversation = (): void => {
    if (profiles.length === 0) return;
    
    // Navigate to session page with profile IDs
    const profileIds = profiles.map(p => p.id).join(',');
    navigate(`/app/session/${profileIds}`);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />
        
        <div className="mx-auto max-w-md p-4">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900">Capture a Creature</h2>
            <p className="mt-2 text-base text-gray-600">
              Take a photo of any living thing in nature
            </p>
          </div>

          {/* Camera capture */}
          <CameraCapture
            onIdentificationComplete={handleIdentificationComplete}
            onError={handleError}
          />

          {/* Creature cards */}
          {identifications.length > 0 && (
            <div className="mt-6 space-y-4">
              {identifications.map((identification, index) => (
                <CreatureCard
                  key={index}
                  identification={identification}
                  gps={gps}
                  onProfileLoaded={handleProfileLoaded}
                />
              ))}
            </div>
          )}

          {/* Start conversation button */}
          {profiles.length > 0 && (
            <div className="mt-6">
              <button
                onClick={handleStartConversation}
                className="w-full rounded-lg bg-green-600 px-4 py-3 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                style={{ minHeight: '44px' }}
              >
                {profiles.length === 1
                  ? `Start conversation with ${profiles[0].name}`
                  : `Start group conversation (${profiles.length} creatures)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
