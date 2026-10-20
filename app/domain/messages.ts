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

export const EditRoundMsg = z.object({
  type: z.literal("edit_round"),
  roundIndex: z.number().int().nonnegative(),
  scores: z.array(z.number()),
});

export const AddPlayerMsg = z.object({
  type: z.literal("add_player"),
  name: z.string().min(1).max(24),
});

export const ClientMessage = z.discriminatedUnion("type", [
  SubmitScoresMsg,
  UndoRoundMsg,
  EndGameMsg,
  EditRoundMsg,
  AddPlayerMsg,
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

export interface RoundEditedMsg {
  type: "round_edited";
  rounds: number[][];
  totals: number[];
  roundIndex: number;
}

export interface PlayerAddedMsg {
  type: "player_added";
  players: ScoreboardState["players"];
  rounds: number[][];
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
  | RoundEditedMsg
  | GameEndedMsg
  | PlayerAddedMsg
  | PlayerJoinedMsg
  | PlayerDisconnectedMsg;
