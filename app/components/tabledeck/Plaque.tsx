import type { ReactNode } from "react";

interface PlaqueProps {
  children: ReactNode;
  className?: string;
}

/**
 * Plaque — bone raised card surface with beveled rim shadow.
 * Drop it around a title or header group; it sits on the walnut surface.
 */
export default function Plaque({ children, className = "" }: PlaqueProps) {
  return (
    <div className={`plaque ${className}`}>
      {children}
    </div>
  );
}
