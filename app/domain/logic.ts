import type { ScoreboardState } from "./types";

/** Append a new round of scores and recalculate totals. */
export function submitRound(
  state: ScoreboardState,
  scores: number[],
): ScoreboardState {
  const rounds = [...state.rounds, scores];
  const totals = recalcTotals(state.players.length, rounds);
  return { ...state, rounds, totals };
}

/** Remove the last round and recalculate totals. */
export function undoLastRound(state: ScoreboardState): ScoreboardState {
  if (state.rounds.length === 0) return state;
  const rounds = state.rounds.slice(0, -1);
  const totals = recalcTotals(state.players.length, rounds);
  return { ...state, rounds, totals };
}

/** Recalculate totals from rounds array. */
function recalcTotals(playerCount: number, rounds: number[][]): number[] {
  const totals = new Array<number>(playerCount).fill(0);
  for (const round of rounds) {
    for (let seat = 0; seat < playerCount; seat++) {
      totals[seat] += round[seat] ?? 0;
    }
  }
  return totals;
}
