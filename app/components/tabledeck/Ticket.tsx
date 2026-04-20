interface TicketProps {
  label: string;
  value: string;
  /** Use gold foil variant for accent/selected state */
  gold?: boolean;
  className?: string;
}

/**
 * Ticket — raffle-ticket chip with chamfered corners and punch holes.
 * Used for Round / Status / Direction in the game header.
 */
export default function Ticket({ label, value, gold = false, className = "" }: TicketProps) {
  return (
    <div className={`ticket${gold ? " ticket-gold" : ""} ${className}`}>
      <span className="ticket-label">{label}</span>
      <span className="ticket-value">{value}</span>
    </div>
  );
}
