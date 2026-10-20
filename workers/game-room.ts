import { nanoid } from "nanoid";
import { BaseGameRoomDO } from "@tabledeck/game-room/server";
import type { ScoreboardState, ScoreboardSettings } from "../app/domain/types";
import { ClientMessage } from "../app/domain/messages";
import {
  addPlayer,
  editRound,
  normalizeScores,
  submitRound,
  undoLastRound,
} from "../app/domain/logic";
import { writeAddedPlayer, writeFinishedGame } from "./finish-record";

export class ScoreboardRoomDO extends BaseGameRoomDO<
  ScoreboardState,
  ScoreboardSettings,
  Env
> {
  // ── Required: initialize fresh state ────────────────────────────────────────

  protected initializeState(settings: ScoreboardSettings): ScoreboardState {
    const players = settings.playerNames.map((name, i) => ({
      seat: i,
      name,
      connected: false,
    }));
    return {
      phase: "playing",
      players,
      rounds: [],
      totals: new Array(settings.playerNames.length).fill(0) as number[],
    };
  }

  // ── Required: serialize / deserialize ────────────────────────────────────────

  protected serializeState(state: ScoreboardState): Record<string, unknown> {
    return {
      phase: state.phase,
      players: state.players,
      rounds: state.rounds,
      totals: state.totals,
    };
  }

  protected deserializeState(data: Record<string, unknown>): ScoreboardState {
    const raw = data as unknown as ScoreboardState;
    return {
      phase: raw.phase ?? "playing",
      players: raw.players ?? [],
      rounds: raw.rounds ?? [],
      totals: raw.totals ?? [],
    };
  }

  // ── Required: player seat queries ────────────────────────────────────────────

  protected isPlayerSeated(state: ScoreboardState, seat: number): boolean {
    return state.players[seat] != null;
  }

  protected getPlayerName(state: ScoreboardState, seat: number): string | null {
    return state.players[seat]?.name ?? null;
  }

  protected seatPlayer(
    state: ScoreboardState,
    seat: number,
    name: string,
  ): ScoreboardState {
    // Players are pre-seated at initialization; this is a no-op if already seated.
    if (state.players[seat] != null) return state;
    const players = [...state.players];
    players[seat] = { seat, name, connected: true };
    return { ...state, players };
  }

  protected getSeatedCount(state: ScoreboardState): number {
    return state.players.filter(Boolean).length;
  }

  // ── Required: game start ─────────────────────────────────────────────────────

  protected async onAllPlayersSeated(): Promise<void> {
    // No-op: game starts in "playing" phase from initializeState.
  }

  // ── Required: route game messages ────────────────────────────────────────────

  protected async onGameMessage(
    ws: WebSocket,
    rawMsg: unknown,
    seat: number,
  ): Promise<void> {
    if (!this.gameState || !this.settings) return;

    // Only the host (seat 0) may mutate state
    if (seat !== 0) {
      ws.send(JSON.stringify({ type: "error", message: "Only the host can update scores." }));
      return;
    }

    const result = ClientMessage.safeParse(rawMsg);
    if (!result.success) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message." }));
      return;
    }

    const msg = result.data;

    if (this.gameState.phase === "finished" && msg.type !== "end_game") {
      ws.send(JSON.stringify({ type: "error", message: "This game is already finished." }));
      return;
    }

    switch (msg.type) {
      case "submit_scores": {
        const scores = normalizeScores(msg.scores, this.gameState.players.length);
        if (!scores) {
          ws.send(JSON.stringify({ type: "error", message: "Enter a whole number for each player." }));
          return;
        }
        this.gameState = submitRound(this.gameState, scores);
        await this.persistState();
        this.broadcast(
          JSON.stringify({
            type: "round_submitted",
            round: scores,
            totals: this.gameState.totals,
            roundIndex: this.gameState.rounds.length - 1,
          }),
        );
        break;
      }

      case "edit_round": {
        const scores = normalizeScores(msg.scores, this.gameState.players.length);
        if (!scores) {
          ws.send(JSON.stringify({ type: "error", message: "Enter a whole number for each player." }));
          return;
        }
        const next = editRound(this.gameState, msg.roundIndex, scores);
        if (!next) {
          ws.send(JSON.stringify({ type: "error", message: "That round can't be edited." }));
          return;
        }
        this.gameState = next;
        await this.persistState();
        this.broadcast(
          JSON.stringify({
            type: "round_edited",
            rounds: this.gameState.rounds,
            totals: this.gameState.totals,
            roundIndex: msg.roundIndex,
          }),
        );
        break;
      }

      case "undo_round": {
        if (this.gameState.rounds.length === 0) {
          ws.send(JSON.stringify({ type: "error", message: "No rounds to undo." }));
          return;
        }
        this.gameState = undoLastRound(this.gameState);
        await this.persistState();
        this.broadcast(
          JSON.stringify({
            type: "round_undone",
            totals: this.gameState.totals,
            roundCount: this.gameState.rounds.length,
          }),
        );
        break;
      }

      case "add_player": {
        const next = addPlayer(this.gameState, msg.name);
        if (!next) {
          ws.send(JSON.stringify({ type: "error", message: "That player can't be added." }));
          return;
        }
        const added = next.players[next.players.length - 1];
        if (!added || !this.gameId) {
          ws.send(JSON.stringify({ type: "error", message: "That player can't be added." }));
          return;
        }
        try {
          await writeAddedPlayer(
            this.env.D1_DATABASE,
            this.gameId,
            nanoid(12),
            added.name,
            added.seat,
            next.players.length,
          );
        } catch (error) {
          console.error(JSON.stringify({
            event: "add_player_failed",
            gameId: this.gameId,
            message: error instanceof Error ? error.message : "unknown",
          }));
          ws.send(JSON.stringify({ type: "error", message: "Couldn't add that player. Try again." }));
          return;
        }
        const settings = this.settings;
        this.gameState = next;
        this.settings = {
          ...settings,
          maxPlayers: next.players.length,
          playerNames: next.players.map((player) => player?.name ?? ""),
        };
        await this.persistState();
        this.broadcast(
          JSON.stringify({
            type: "player_added",
            players: this.gameState.players,
            rounds: this.gameState.rounds,
            totals: this.gameState.totals,
          }),
        );
        break;
      }

      case "end_game": {
        if (this.gameState.phase !== "finished") {
          const saved = await this.saveFinishedGame();
          if (!saved) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Couldn't save the final result. Try again.",
            }));
            return;
          }
          this.gameState = { ...this.gameState, phase: "finished" };
        }
        await this.persistState();
        this.broadcast(
          JSON.stringify({
            type: "game_ended",
            totals: this.gameState.totals,
          }),
        );
        break;
      }
    }
  }

  /**
   * Write status, finishedAt, and final scores before the board locks.
   * A failed write leaves the game in play so the host can retry.
   */
  private async saveFinishedGame(): Promise<boolean> {
    if (!this.gameState || !this.gameId) return false;
    const seats = this.gameState.players
      .filter((player) => player != null)
      .map((player) => player.seat);
    try {
      return await writeFinishedGame(
        this.env.D1_DATABASE,
        this.gameId,
        this.gameState.totals,
        seats,
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: "finish_game_failed",
        gameId: this.gameId,
        message: error instanceof Error ? error.message : "unknown",
      }));
      return false;
    }
  }

  // ── Optional: track disconnect ────────────────────────────────────────────────

  protected onPlayerDisconnected(seat: number): void {
    if (seat >= 0 && this.gameState?.players[seat]) {
      this.gameState.players[seat]!.connected = false;
    }
  }
}
