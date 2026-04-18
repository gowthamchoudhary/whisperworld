import { useEffect } from 'react';
import { ambientSoundEngine } from '../services/ambientSoundEngine';

interface AmbientControllerProps {
  category: string;
}

export default function AmbientController({ category }: AmbientControllerProps): null {
  useEffect(() => {
    // Start ambient sound on mount
    ambientSoundEngine.start(category);

    // Stop ambient sound on unmount
    return () => {
      ambientSoundEngine.stop();
    };
  }, [category]);

  // This component doesn't render anything
  return null;
}
