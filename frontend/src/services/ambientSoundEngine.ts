/**
 * Ambient Sound Engine
 * 
 * Manages looping ambient audio playback in the browser using Web Audio API.
 * Fetches audio from the backend /api/ambient endpoint and plays it at reduced volume.
 */

class AmbientSoundEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  /**
   * Start playing ambient audio for the given category
   * @param category - The creature category to fetch ambient sound for
   */
  async start(category: string): Promise<void> {
    try {
      // Initialize AudioContext if not already created
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Fetch audio from backend
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiBaseUrl}/api/ambient?category=${encodeURIComponent(category)}`);

      // Handle 204 No Content - swallow silently and return
      if (response.status === 204) {
        console.log('Ambient sound not available, continuing without audio');
        return;
      }

      // Check for other error responses
      if (!response.ok) {
        console.error(`Failed to fetch ambient audio: ${response.status} ${response.statusText}`);
        return;
      }

      // Get audio data as array buffer
      const arrayBuffer = await response.arrayBuffer();

      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Create gain node for volume control (20% volume)
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.2;

      // Create source node
      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = audioBuffer;
      this.sourceNode.loop = true;

      // Connect: source → gain → destination
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // Start playback
      this.sourceNode.start();

      console.log(`Ambient sound started for category: ${category}`);
    } catch (error) {
      // Swallow all errors silently (non-blocking per requirements)
      console.error('Error starting ambient sound:', error);
    }
  }

  /**
   * Stop playing ambient audio and clean up resources
   */
  stop(): void {
    try {
      // Stop the source node
      if (this.sourceNode) {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }

      // Disconnect gain node
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }

      console.log('Ambient sound stopped');
    } catch (error) {
      // Swallow errors silently
      console.error('Error stopping ambient sound:', error);
    }
  }
}

// Export singleton instance
export const ambientSoundEngine = new AmbientSoundEngine();
