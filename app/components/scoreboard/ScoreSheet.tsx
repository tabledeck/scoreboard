import type { KeyboardEvent } from "react";
import { readScore } from "~/domain/logic";
import Dialog from "~/components/scoreboard/Dialog";
import BtnPrimary from "~/components/tabledeck/BtnPrimary";
import BtnSecondary from "~/components/tabledeck/BtnSecondary";
import CloseIcon from "~/components/icons/CloseIcon";

export interface ScoreSheetPlayer {
  seat: number;
  name: string;
}

interface ScoreSheetProps {
  open: boolean;
  mode: "new" | "edit";
  roundNumber: number;
  players: ScoreSheetPlayer[];
  values: Record<number, string>;
  totals: number[];
  previousRound: number[] | null;
  saving: boolean;
  onChange: (seat: number, value: string) => void;
  onAdjust: (seat: number, delta: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const STEPS = [-5, -1, 1, 5] as const;

/**
 * One round, every player, with steppers so a phone can keep score
 * without hunting through the numeric keyboard for every point.
 */
export default function ScoreSheet({
  open,
  mode,
  roundNumber,
  players,
  values,
  totals,
  previousRound,
  saving,
  onChange,
  onAdjust,
  onSubmit,
  onClose,
}: ScoreSheetProps) {
  const titleId = "score-sheet-title";
  const title = mode === "edit" ? `Edit round ${roundNumber}` : `Round ${roundNumber}`;

  const projected = (seat: number) => {
    const entered = readScore(values[seat]);
    const current = totals[seat] ?? 0;
    if (mode === "edit") {
      const previous = previousRound?.[seat] ?? 0;
      return current - previous + entered;
    }
    return current + entered;
  };

  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (index < players.length - 1) {
      const next = document.getElementById(`score-input-${index + 1}`);
      next?.focus();
      if (next instanceof HTMLInputElement) next.select();
      return;
    }
    onSubmit();
  };

  return (
    <Dialog open={open} titleId={titleId} onClose={onClose}>
      <form
        className="score-sheet"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving) onSubmit();
        }}
      >
        <div className="sheet-head">
          <div>
            <h3 id={titleId}>{title}</h3>
            <p className="sheet-note">
              {mode === "edit"
                ? "Updates this round for everyone watching."
                : "Enter this round. Empty scores count as zero."}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close score entry"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="score-sheet-body">
          {players.map((player, index) => (
            <div className="score-player" key={player.seat}>
              <div className="score-player-name">
                <label htmlFor={`score-input-${index}`}>{player.name}</label>
                <span>Total {projected(player.seat)}</span>
              </div>
              <div className="stepper">
                {STEPS.filter((step) => step < 0).map((step) => (
                  <button
                    key={step}
                    type="button"
                    className="step-btn"
                    onClick={() => onAdjust(player.seat, step)}
                    aria-label={`Subtract ${Math.abs(step)} ${Math.abs(step) === 1 ? "point" : "points"} for ${player.name}`}
                  >
                    {step}
                  </button>
                ))}
                <input
                  id={`score-input-${index}`}
                  data-autofocus={index === 0 ? true : undefined}
                  className="td-input score-field"
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint={index === players.length - 1 ? "done" : "next"}
                  placeholder="0"
                  value={values[player.seat] ?? ""}
                  onChange={(event) => onChange(player.seat, event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => onFieldKey(event, index)}
                  aria-describedby={`score-total-${player.seat}`}
                />
                {STEPS.filter((step) => step > 0).map((step) => (
                  <button
                    key={step}
                    type="button"
                    className="step-btn"
                    onClick={() => onAdjust(player.seat, step)}
                    aria-label={`Add ${step} ${step === 1 ? "point" : "points"} for ${player.name}`}
                  >
                    +{step}
                  </button>
                ))}
              </div>
              <span id={`score-total-${player.seat}`} className="sr-only">
                New total {projected(player.seat)}
              </span>
            </div>
          ))}
        </div>

        <div className="sheet-actions">
          <BtnSecondary type="button" onClick={onClose} disabled={saving}>
            Cancel
          </BtnSecondary>
          <BtnPrimary type="submit" disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save round" : "Add round"}
          </BtnPrimary>
        </div>
      </form>
    </Dialog>
  );
}
