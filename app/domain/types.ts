import type { BaseSettings } from "@tabledeck/game-room/server";

export interface ScoreboardSettings extends BaseSettings {
  gameName: string;
  playerNames: string[]; // pre-seats all players at creation
  lowerIsBetter: boolean;
}

export interface ScoreboardPlayer {
  seat: number;
  name: string;
  connected: boolean;
}

export type ScoreboardPhase = "playing" | "finished";

export interface ScoreboardState {
  phase: ScoreboardPhase;
  /** Indexed by seat. Length === maxPlayers. */
  players: (ScoreboardPlayer | null)[];
  /** rounds[roundIndex][seat] = score for that player that round */
  rounds: number[][];
  /** totals[seat] = sum of all rounds */
  totals: number[];
}
