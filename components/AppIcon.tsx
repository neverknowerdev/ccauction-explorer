export default function AppIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="16" fill="url(#gradient)" />
      <path
        d="M32 20L28 28H36L32 20Z"
        fill="white"
        fillOpacity="0.9"
      />
      <path
        d="M20 32L28 28L32 36L28 44L20 40L20 32Z"
        fill="white"
        fillOpacity="0.9"
      />
      <path
        d="M44 32L36 28L32 36L36 44L44 40L44 32Z"
        fill="white"
        fillOpacity="0.9"
      />
      <path
        d="M32 36L28 44H36L32 36Z"
        fill="white"
        fillOpacity="0.7"
      />
      <defs>
        <linearGradient id="gradient" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
    </svg>
  );
}
