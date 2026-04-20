import { useState, useCallback, useRef, useEffect } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/game.$gameId";
import { getPrisma } from "~/db.server";
import { useGameWebSocket } from "@tabledeck/game-room/client";
import { readGuestCookie } from "@tabledeck/game-room/server";
import type { ScoreboardState, ScoreboardPlayer } from "~/domain/types";
import type { ServerMessage } from "~/domain/messages";

import Ticket from "~/components/tabledeck/Ticket";
import Ledger from "~/components/tabledeck/Ledger";
import BtnPrimary from "~/components/tabledeck/BtnPrimary";
import BtnSecondary from "~/components/tabledeck/BtnSecondary";
import CrownIcon from "~/components/icons/CrownIcon";
import PencilIcon from "~/components/icons/PencilIcon";
import LinkIcon from "~/components/icons/LinkIcon";
import UndoIcon from "~/components/icons/UndoIcon";
import FlagIcon from "~/components/icons/FlagIcon";
import CloseIcon from "~/components/icons/CloseIcon";

export function meta({ data }: Route.MetaArgs) {
  const name = (data as any)?.gameName || "Scoreboard";
  return [{ title: `${name} — Scoreboard` }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { gameId } = params;
  const db = getPrisma(context);

  const game = await db.game.findUnique({
    where: { id: gameId },
    include: { players: { orderBy: { seat: "asc" } } },
  });
  if (!game) throw redirect("/");

  // Check for host cookie
  const identity = readGuestCookie(request, `sb_${gameId}`);
  const mySeat = identity?.seat ?? -1;
  const myName = identity?.name ?? "Spectator";

  // Fetch initial state from Durable Object
  const env = (context as any).cloudflare?.env as Env | undefined;
  let initialState: ScoreboardState | null = null;
  if (env) {
    try {
      const doId = env.SCOREBOARD_ROOM.idFromName(gameId);
      const stub = env.SCOREBOARD_ROOM.get(doId);
      const res = await stub.fetch(new Request("http://internal/state"));
      if (res.ok) {
        const body = (await res.json()) as { state: ScoreboardState };
        initialState = body.state;
      }
    } catch {
      // Non-fatal — WS connect will hydrate state
    }
  }

  const url = new URL(request.url);
  const shareUrl = `${url.protocol}//${url.host}/game/${gameId}`;

  return {
    gameId,
    gameName: game.gameName,
    lowerIsBetter: game.lowerIsBetter,
    mySeat,
    myName,
    initialState,
    shareUrl,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameRoom({ loaderData }: Route.ComponentProps) {
  const { gameId, gameName, lowerIsBetter, mySeat, myName, initialState, shareUrl } =
    loaderData;

  const isHost = mySeat === 0;

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"playing" | "finished">(
    initialState?.phase ?? "playing",
  );
  const [players, setPlayers] = useState<(ScoreboardPlayer | null)[]>(
    initialState?.players ?? [],
  );
  const [rounds, setRounds] = useState<number[][]>(initialState?.rounds ?? []);
  const [totals, setTotals] = useState<number[]>(initialState?.totals ?? []);

  const [scoringOpen, setScoringOpen] = useState(false);
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const { send } = useGameWebSocket({
    gameId,
    seat: mySeat,
    name: myName,
    onMessage: useCallback((rawMsg: unknown) => {
      const msg = rawMsg as { type: string } & ServerMessage;

      switch (msg.type) {
        case "game_state": {
          const s = (msg as any).state as ScoreboardState;
          if (s) {
            setPhase(s.phase);
            setPlayers(s.players ?? []);
            setRounds(s.rounds ?? []);
            setTotals(s.totals ?? []);
          }
          break;
        }
        case "round_submitted": {
          setRounds((prev) => [...prev, msg.round]);
          setTotals(msg.totals);
          break;
        }
        case "round_undone": {
          setRounds((prev) => prev.slice(0, msg.roundCount));
          setTotals(msg.totals);
          break;
        }
        case "game_ended": {
          setTotals(msg.totals);
          setPhase("finished");
          break;
        }
        case "player_joined": {
          const { seat, name } = msg as any;
          setPlayers((prev) => {
            const next = [...prev];
            if (next[seat]) next[seat] = { ...next[seat]!, connected: true, name };
            return next;
          });
          break;
        }
        case "player_disconnected": {
          const { seat } = msg as any;
          setPlayers((prev) => {
            const next = [...prev];
            if (next[seat]) next[seat] = { ...next[seat]!, connected: false };
            return next;
          });
          break;
        }
      }
    }, []),
  });

  // ── Derived: ranked leaderboard ────────────────────────────────────────────
  const rankedPlayers = players
    .filter((p): p is ScoreboardPlayer => p != null)
    .map((p) => ({ ...p, total: totals[p.seat] ?? 0 }))
    .sort((a, b) =>
      lowerIsBetter ? a.total - b.total : b.total - a.total,
    );

  // ── Score submission ────────────────────────────────────────────────────────
  const openScoring = () => {
    const defaults: Record<number, string> = {};
    players.forEach((p) => {
      if (p) defaults[p.seat] = "0";
    });
    setScoreInputs(defaults);
    setScoringOpen(true);
  };

  const submitScores = () => {
    const scores = players.map((p) =>
      p ? parseInt(scoreInputs[p.seat] ?? "0", 10) || 0 : 0,
    );
    send({ type: "submit_scores", scores });
    setScoringOpen(false);
    setScoreInputs({});
  };

  const undoRound = () => {
    send({ type: "undo_round" });
  };

  const endGame = () => {
    send({ type: "end_game" });
    setEndConfirmOpen(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
    }
  };

  // ── Medallion class ────────────────────────────────────────────────────────
  const medalClass = (rank: number) => {
    if (rank === 0) return "gold";
    if (rank === 1) return "silver";
    if (rank === 2) return "bronze";
    if (rank === 3) return "copper";
    return "plain";
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="td-surface" style={{ minHeight: "100vh" }}>

      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div className="header-bar">
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Back link */}
          <a
            href="/"
            style={{
              fontFamily: "var(--serif)",
              fontVariant: "small-caps",
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "var(--gold-hi)",
              textDecoration: "none",
              opacity: 0.75,
              marginRight: 4,
            }}
          >
            &larr; New
          </a>

          {/* Game name plaque */}
          <div
            style={{
              fontFamily: "var(--serif)",
              fontWeight: 600,
              fontStyle: "italic",
              fontSize: 26,
              color: "var(--gold-hi)",
              letterSpacing: "0.01em",
              textShadow: "0 1px 0 rgba(0,0,0,0.5)",
              flexShrink: 0,
            }}
          >
            {gameName || "Scoreboard"}
          </div>

          {/* Ticket chips */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: 4 }}>
            <Ticket
              label="Round"
              value={rounds.length === 0 ? "—" : String(rounds.length)}
            />
            <Ticket
              label="Status"
              value={phase === "finished" ? "Final" : "Playing"}
              gold={phase === "finished"}
            />
            <Ticket
              label="Direction"
              value={lowerIsBetter ? "Lower Wins" : "Higher Wins"}
            />
          </div>

          {/* Action group */}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
            <button
              onClick={copyLink}
              className="btn-secondary"
              style={{ padding: "7px 14px", fontSize: 12, marginBottom: 0, gap: 6 }}
              type="button"
            >
              <LinkIcon size={13} />
              Share Link
            </button>
            {isHost && phase === "playing" && (
              <>
                {rounds.length > 0 && (
                  <button
                    onClick={undoRound}
                    className="btn-secondary"
                    style={{ padding: "7px 14px", fontSize: 12, marginBottom: 0, gap: 6 }}
                    title="Undo last round"
                    type="button"
                  >
                    <UndoIcon size={13} />
                    Undo
                  </button>
                )}
                <button
                  onClick={() => setEndConfirmOpen(true)}
                  className="btn-ghost"
                  style={{ padding: "7px 14px", fontSize: 12, color: "rgba(246,239,224,0.55)", gap: 6 }}
                  type="button"
                >
                  <FlagIcon size={13} />
                  End Game
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Leaderboard ──────────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "28px 16px",
          paddingBottom: phase === "finished" ? 100 : 120,
        }}
      >
        <Ledger>
          {/* Scroll curl ornament */}
          <div className="scroll-curl">~ ~ ~</div>

          {/* Table wrapper for overflow on narrow screens */}
          <div style={{ overflowX: "auto", position: "relative", zIndex: 1, padding: "0 4px 4px" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "auto",
              }}
            >
              <thead>
                <tr>
                  <th className="ledger-th" style={{ textAlign: "left", width: 48, paddingLeft: 16 }}>#</th>
                  <th className="ledger-th" style={{ textAlign: "left" }}>Player</th>
                  <th className="ledger-th" style={{ textAlign: "right", paddingRight: 16, width: 80 }}>Total</th>
                  {rounds.map((_, i) => (
                    <th
                      key={i}
                      className="ledger-th"
                      style={{ textAlign: "right", width: 52, paddingRight: 8 }}
                    >
                      R{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankedPlayers.map((player, rank) => {
                  const isFirst = rank === 0 && rounds.length > 0;
                  return (
                    <tr
                      key={player.seat}
                      className={`ledger-row${isFirst ? " leader" : ""}`}
                    >
                      {/* Rank cell */}
                      <td
                        style={{
                          paddingLeft: 16,
                          paddingRight: 8,
                          width: 48,
                          verticalAlign: "middle",
                        }}
                      >
                        <div
                          className={`rank-medallion ${medalClass(rank)}`}
                          style={{ margin: "0 auto" }}
                        >
                          {isFirst ? (
                            <CrownIcon
                              size={16}
                            />
                          ) : (
                            <span>{rank + 1}</span>
                          )}
                        </div>
                      </td>

                      {/* Player name */}
                      <td style={{ paddingRight: 12, verticalAlign: "middle" }}>
                        <span
                          style={{
                            fontFamily: "var(--sans)",
                            fontWeight: 600,
                            fontSize: 15,
                            color: "var(--ink)",
                          }}
                        >
                          {player.name}
                        </span>
                        {player.connected && (
                          <span
                            className="status-dot"
                            title="Online"
                            style={{ marginLeft: 7, verticalAlign: "middle" }}
                          />
                        )}
                      </td>

                      {/* Total */}
                      <td
                        style={{
                          paddingRight: 16,
                          textAlign: "right",
                          verticalAlign: "middle",
                          width: 80,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontWeight: 700,
                            fontSize: 18,
                            color: "var(--ink)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {player.total}
                        </span>
                      </td>

                      {/* Round cells */}
                      {rounds.map((round, i) => (
                        <td
                          key={i}
                          style={{
                            textAlign: "right",
                            paddingRight: 8,
                            width: 52,
                            verticalAlign: "middle",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 13,
                              color: "var(--ink-faint)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {round[player.seat] ?? 0}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {rankedPlayers.length === 0 && (
              <div className="empty-state">
                Loading players&hellip;
              </div>
            )}
          </div>
        </Ledger>
      </div>

      {/* ── Finished banner ──────────────────────────────────────────────── */}
      {phase === "finished" && (
        <div className="finished-banner">
          <div
            style={{
              maxWidth: 960,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                {/* Inline wax-seal "FINAL" badge */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 40% 40%, #a23138 0%, #6b1a21 58%, #4b1015 100%)",
                    boxShadow:
                      "inset 0 2px 2px rgba(255,255,255,0.25),inset 0 -3px 4px rgba(0,0,0,0.4),0 3px 8px rgba(0,0,0,0.5)",
                    transform: "rotate(-8deg)",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--serif)",
                      fontVariant: "small-caps",
                      fontWeight: 700,
                      fontSize: 9,
                      letterSpacing: "0.18em",
                      color: "rgba(246,239,224,0.88)",
                    }}
                  >
                    Final
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: "var(--serif)",
                    fontWeight: 600,
                    fontVariant: "small-caps",
                    fontSize: 16,
                    letterSpacing: "0.14em",
                    color: "var(--walnut)",
                  }}
                >
                  Game Over
                </span>
              </div>
              {rankedPlayers[0] && (
                <p
                  style={{
                    fontFamily: "var(--sans)",
                    fontSize: 14,
                    color: "var(--ink-soft)",
                    margin: 0,
                  }}
                >
                  Winner:{" "}
                  <span
                    style={{
                      fontFamily: "var(--serif)",
                      fontVariant: "small-caps",
                      fontWeight: 600,
                      color: "var(--gold-lo)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {rankedPlayers[0].name}
                  </span>
                  {" "}
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {rankedPlayers[0].total}
                  </span>{" "}
                  <span style={{ color: "var(--ink-faint)" }}>pts</span>
                </p>
              )}
            </div>
            <a href="/" className="btn-primary" style={{ flexShrink: 0, textDecoration: "none" }}>
              New Game
            </a>
          </div>
        </div>
      )}

      {/* ── Score round FAB — host only ───────────────────────────────────── */}
      {isHost && phase === "playing" && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 30 }}>
          <button
            onClick={openScoring}
            className="score-fab"
            type="button"
          >
            <PencilIcon size={16} />
            Score Round
          </button>
        </div>
      )}

      {/* ── Copied toast ──────────────────────────────────────────────────── */}
      {copied && (
        <div className="toast-stamp">
          Link Copied
        </div>
      )}

      {/* ── Score entry modal ────────────────────────────────────────────── */}
      {scoringOpen && (
        <ScoreModal
          players={players.filter((p): p is ScoreboardPlayer => p != null)}
          scoreInputs={scoreInputs}
          onChange={(seat, val) =>
            setScoreInputs((prev) => ({ ...prev, [seat]: val }))
          }
          onSubmit={submitScores}
          onClose={() => setScoringOpen(false)}
          roundNumber={rounds.length + 1}
        />
      )}

      {/* ── End game confirm ─────────────────────────────────────────────── */}
      {endConfirmOpen && (
        <div className="modal-scroll-overlay">
          <div className="modal-scroll">
            <div className="modal-inner">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <h3>End Game?</h3>
                <button
                  onClick={() => setEndConfirmOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ink-faint)",
                    padding: 2,
                    marginTop: 2,
                  }}
                  aria-label="Cancel"
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <p>
                This will finalize scores and show the final leaderboard to
                everyone. This cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <BtnSecondary
                  onClick={() => setEndConfirmOpen(false)}
                  style={{ flex: 1, marginBottom: 0 }}
                  type="button"
                >
                  Cancel
                </BtnSecondary>
                <button
                  onClick={endGame}
                  className="btn-destructive"
                  style={{ flex: 1 }}
                  type="button"
                >
                  End Game
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Score Modal ───────────────────────────────────────────────────────────────

function ScoreModal({
  players,
  scoreInputs,
  onChange,
  onSubmit,
  onClose,
  roundNumber,
}: {
  players: ScoreboardPlayer[];
  scoreInputs: Record<number, string>;
  onChange: (seat: number, val: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  roundNumber: number;
}) {
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (idx < players.length - 1) {
        // Move focus to next input
        const next = document.getElementById(
          `score-input-${idx + 1}`,
        ) as HTMLInputElement | null;
        next?.focus();
        next?.select();
      } else {
        onSubmit();
      }
    }
  };

  return (
    <div className="modal-scroll-overlay">
      <div className="modal-scroll">
        <div className="modal-inner">
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h3>
              Round {roundNumber} Scores
            </h3>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-faint)",
                padding: 2,
                marginTop: 2,
              }}
              aria-label="Close"
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Player score inputs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {players.map((player, idx) => (
              <div
                key={player.seat}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <label
                  htmlFor={`score-input-${idx}`}
                  style={{
                    flex: 1,
                    fontFamily: "var(--sans)",
                    fontWeight: 600,
                    fontSize: 14,
                    color: "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  {player.name}
                </label>
                <input
                  id={`score-input-${idx}`}
                  ref={idx === 0 ? firstInputRef : undefined}
                  type="number"
                  inputMode="numeric"
                  value={scoreInputs[player.seat] ?? "0"}
                  onChange={(e) => onChange(player.seat, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  className="td-input"
                  style={{
                    width: 80,
                    textAlign: "right",
                    fontFamily: "var(--mono)",
                    fontWeight: 700,
                    fontSize: 16,
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <BtnSecondary
              onClick={onClose}
              style={{ flex: 1, marginBottom: 0 }}
              type="button"
            >
              Cancel
            </BtnSecondary>
            <BtnPrimary
              onClick={onSubmit}
              style={{ flex: 1, marginBottom: 0 }}
              type="button"
            >
              Submit
            </BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}
