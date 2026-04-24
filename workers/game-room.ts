import { BaseGameRoomDO } from "@tabledeck/game-room/server";
import type { ScoreboardState, ScoreboardSettings } from "../app/domain/types";
import { ClientMessage } from "../app/domain/messages";
import { submitRound, undoLastRound } from "../app/domain/logic";

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

    switch (msg.type) {
      case "submit_scores": {
        const { scores } = msg;
        if (scores.length !== this.gameState.players.length) {
          ws.send(JSON.stringify({ type: "error", message: "Score count mismatch." }));
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

      case "end_game": {
        this.gameState = { ...this.gameState, phase: "finished" };
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

  // ── Optional: track disconnect ────────────────────────────────────────────────

  protected onPlayerDisconnected(seat: number): void {
    if (seat >= 0 && this.gameState?.players[seat]) {
      this.gameState.players[seat]!.connected = false;
    }
  }
}
