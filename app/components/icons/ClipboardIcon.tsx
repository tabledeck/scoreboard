export default function ClipboardIcon({
  className = "",
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* clipboard body */}
      <rect x="7" y="4" width="12" height="16" rx="1.5" />
      {/* clip at top */}
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      {/* ruled lines */}
      <line x1="10" y1="9" x2="16" y2="9" strokeWidth="1.25" />
      <line x1="10" y1="12" x2="16" y2="12" strokeWidth="1.25" />
      <line x1="10" y1="15" x2="13" y2="15" strokeWidth="1.25" />
    </svg>
  );
}
