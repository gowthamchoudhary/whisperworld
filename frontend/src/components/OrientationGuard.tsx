/**
 * OrientationGuard component
 * Displays an overlay prompting users to rotate their device to portrait mode
 * when in landscape orientation.
 */
export default function OrientationGuard(): JSX.Element {
  return (
    <div className="orientation-guard">
      <div className="orientation-guard-icon" role="img" aria-label="Rotate device">
        📱
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">
        Please Rotate Your Device
      </h2>
      <p className="text-base text-gray-300 max-w-sm text-center">
        WhisperWorld is designed for portrait orientation. Please rotate your
        device to continue.
      </p>
    </div>
  );
}
