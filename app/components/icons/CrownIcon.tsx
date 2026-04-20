export default function CrownIcon({
  className = "",
  size = 24,
  /** Override fill color — defaults to gold */
  color = "#c9a24a",
}: {
  className?: string;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Crown shape — from skull-king mockup, adapted */}
      <path
        d="M2 14l2-10 5 6 3-8 3 8 5-6 2 10H2z"
        fill={color}
        stroke="rgba(139,106,30,0.8)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* Jewel dots */}
      <circle cx="7" cy="5" r="1" fill="rgba(139,106,30,0.7)" />
      <circle cx="12" cy="2" r="1.1" fill="rgba(139,106,30,0.7)" />
      <circle cx="17" cy="5" r="1" fill="rgba(139,106,30,0.7)" />
    </svg>
  );
}
