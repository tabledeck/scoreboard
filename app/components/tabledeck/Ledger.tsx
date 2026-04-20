import type { ReactNode } from "react";

interface LedgerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Ledger — linen paper wrapper with horizontal ruled lines, gold top-rule,
 * and linen texture overlay. Wraps the leaderboard table.
 */
export default function Ledger({ children, className = "" }: LedgerProps) {
  return (
    <div className={`ledger ${className}`}>
      {children}
    </div>
  );
}
