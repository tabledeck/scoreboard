import { z } from "zod";
import type { ScoreboardState } from "./types";

// ── Client → Server ───────────────────────────────────────────────────────────

export const SubmitScoresMsg = z.object({
  type: z.literal("submit_scores"),
  /** scores[seat] = score for that player this round */
  scores: z.array(z.number()),
});

export const UndoRoundMsg = z.object({
  type: z.literal("undo_round"),
});

export const EndGameMsg = z.object({
  type: z.literal("end_game"),
});

export const ClientMessage = z.discriminatedUnion("type", [
  SubmitScoresMsg,
  UndoRoundMsg,
  EndGameMsg,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ── Server → Client ───────────────────────────────────────────────────────────

export interface RoundSubmittedMsg {
  type: "round_submitted";
  round: number[];
  totals: number[];
  roundIndex: number;
}

export interface RoundUndoneMsg {
  type: "round_undone";
  totals: number[];
  roundCount: number;
}

export interface GameEndedMsg {
  type: "game_ended";
  totals: number[];
}

export interface GameStateMsg {
  type: "game_state";
  state: ScoreboardState;
}

export interface PlayerJoinedMsg {
  type: "player_joined";
  seat: number;
  name: string;
}

export interface PlayerDisconnectedMsg {
  type: "player_disconnected";
  seat: number;
}

export type ServerMessage =
  | GameStateMsg
  | RoundSubmittedMsg
  | RoundUndoneMsg
  | GameEndedMsg
  | PlayerJoinedMsg
  | PlayerDisconnectedMsg;
