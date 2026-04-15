import { useState, useCallback, useRef, useEffect } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/game.$gameId";
import { getPrisma } from "~/db.server";
import { useGameWebSocket } from "@tabledeck/game-room/client";
import { readGuestCookie } from "@tabledeck/game-room/server";
import type { ScoreboardState, ScoreboardPlayer } from "~/domain/types";
import type { ServerMessage } from "~/domain/messages";

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <a href="/" className="text-gray-500 hover:text-gray-300 text-sm block mb-1">
              ← New scoreboard
            </a>
            <h1 className="text-2xl font-bold text-white">
              {gameName || "Scoreboard"}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {rounds.length === 0
                ? "No rounds yet"
                : `Round ${rounds.length}`}
              {phase === "finished" && (
                <span className="ml-2 text-amber-400 font-medium">Final</span>
              )}
              {lowerIsBetter && (
                <span className="ml-2 text-gray-600">· lower wins</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied ? "Copied!" : "Share link"}
            </button>
            {isHost && phase === "playing" && (
              <>
                {rounds.length > 0 && (
                  <button
                    onClick={undoRound}
                    className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                    title="Undo last round"
                  >
                    Undo
                  </button>
                )}
                <button
                  onClick={() => setEndConfirmOpen(true)}
                  className="text-sm bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  End game
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="max-w-4xl mx-auto px-4 pb-24 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 pr-3 font-medium w-8">#</th>
              <th className="text-left py-2 pr-4 font-medium">Player</th>
              <th className="text-right py-2 px-3 font-medium w-20">Total</th>
              {rounds.map((_, i) => (
                <th key={i} className="text-right py-2 px-2 font-medium text-gray-600 w-14">
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
                  className={`border-b border-gray-800/50 ${
                    isFirst ? "bg-amber-950/20" : ""
                  }`}
                >
                  <td className="py-3 pr-3 text-gray-500">
                    {rank + 1}
                    {isFirst && <span className="ml-1">👑</span>}
                  </td>
                  <td className="py-3 pr-4 font-medium text-white">
                    {player.name}
                    {player.connected && (
                      <span
                        className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle"
                        title="Online"
                      />
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-lg text-white">
                    {player.total}
                  </td>
                  {rounds.map((round, i) => (
                    <td key={i} className="py-3 px-2 text-right text-gray-400">
                      {round[player.seat] ?? 0}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rankedPlayers.length === 0 && (
          <p className="text-gray-500 text-center py-12">Loading players...</p>
        )}
      </div>

      {/* Finished banner */}
      {phase === "finished" && (
        <div className="fixed inset-x-0 bottom-0 bg-gray-900 border-t border-amber-600/30 p-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-amber-400 font-semibold">Game over!</p>
              {rankedPlayers[0] && (
                <p className="text-gray-300 text-sm">
                  Winner: <span className="font-medium text-white">{rankedPlayers[0].name}</span>
                  {" "}with {rankedPlayers[0].total} points
                </p>
              )}
            </div>
            <a
              href="/"
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              New game
            </a>
          </div>
        </div>
      )}

      {/* Score round FAB — host only */}
      {isHost && phase === "playing" && (
        <div className="fixed bottom-6 right-6">
          <button
            onClick={openScoring}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-full px-6 py-3 shadow-lg transition-colors text-base"
          >
            + Score round
          </button>
        </div>
      )}

      {/* Score entry modal */}
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

      {/* End game confirm */}
      {endConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold text-lg mb-2">End game?</h3>
            <p className="text-gray-400 text-sm mb-6">
              This will finalize scores and show the final leaderboard to everyone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setEndConfirmOpen(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={endGame}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-medium rounded-lg py-2 transition-colors"
              >
                End game
              </button>
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
        const next = document.getElementById(`score-input-${idx + 1}`) as HTMLInputElement | null;
        next?.focus();
        next?.select();
      } else {
        onSubmit();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">
            Round {roundNumber} scores
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 mb-6">
          {players.map((player, idx) => (
            <div key={player.seat} className="flex items-center gap-3">
              <label
                htmlFor={`score-input-${idx}`}
                className="flex-1 text-gray-300 text-sm font-medium"
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
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-right text-sm focus:outline-none focus:border-amber-600"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg py-2.5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg py-2.5 transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
