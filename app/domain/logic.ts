import type { ScoreboardState } from "./types";

export const MIN_SCORE = -9999;
export const MAX_SCORE = 9999;
export const MAX_PLAYERS = 12;

/** Keep typed score text to a signed whole number, or a lone minus sign. */
export function sanitizeScoreInput(raw: string): string {
  let next = raw.replace(/[^\d-]/g, "");
  const negative = next.startsWith("-");
  next = next.replace(/-/g, "");
  return `${negative ? "-" : ""}${next.slice(0, 4)}`;
}

/** Empty or a lone minus counts as zero. Other values are clamped whole numbers. */
export function readScore(raw: string | undefined): number {
  if (!raw || raw === "-") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(value)));
}

/**
 * Accept a score vector aligned to seats. Floats are rounded.
 * Returns null when the shape or range is unusable.
 */
export function normalizeScores(
  scores: number[],
  playerCount: number,
): number[] | null {
  if (!Array.isArray(scores) || scores.length !== playerCount) return null;
  const next: number[] = [];
  for (const value of scores) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    if (rounded < MIN_SCORE || rounded > MAX_SCORE) return null;
    next.push(rounded);
  }
  return next;
}

/** Append a new round of scores and recalculate totals. */
export function submitRound(
  state: ScoreboardState,
  scores: number[],
): ScoreboardState {
  const rounds = [...state.rounds, scores];
  const totals = recalcTotals(state.players.length, rounds);
  return { ...state, rounds, totals };
}

/** Replace one round and recalculate totals. */
export function editRound(
  state: ScoreboardState,
  roundIndex: number,
  scores: number[],
): ScoreboardState | null {
  if (roundIndex < 0 || roundIndex >= state.rounds.length) return null;
  if (scores.length !== state.players.length) return null;
  const rounds = state.rounds.map((round, index) =>
    index === roundIndex ? scores : round,
  );
  return {
    ...state,
    rounds,
    totals: recalcTotals(state.players.length, rounds),
  };
}

/** Remove the last round and recalculate totals. */
export function undoLastRound(state: ScoreboardState): ScoreboardState {
  if (state.rounds.length === 0) return state;
  const rounds = state.rounds.slice(0, -1);
  const totals = recalcTotals(state.players.length, rounds);
  return { ...state, rounds, totals };
}

/** Seat someone who arrived late. Earlier rounds count as 0 until edited. */
export function addPlayer(
  state: ScoreboardState,
  name: string,
): ScoreboardState | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 24) return null;
  if (state.players.length >= MAX_PLAYERS) return null;
  if (state.players.some((player) => player?.name === trimmed)) return null;
  const seat = state.players.length;
  const players = [
    ...state.players,
    { seat, name: trimmed, connected: false },
  ];
  const rounds = state.rounds.map((round) => {
    const next = round.slice();
    next[seat] = 0;
    return next;
  });
  return {
    ...state,
    players,
    rounds,
    totals: recalcTotals(players.length, rounds),
  };
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
