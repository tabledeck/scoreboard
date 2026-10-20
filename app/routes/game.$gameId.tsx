import { useCallback, useEffect, useRef, useState } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/game.$gameId";
import { getPrisma } from "~/db.server";
import { useGameWebSocket } from "@tabledeck/game-room/client";
import { readGuestCookie } from "@tabledeck/game-room/server";
import type { ScoreboardPlayer, ScoreboardState } from "~/domain/types";
import type { ServerMessage } from "~/domain/messages";
import { repairFinishedRecord } from "~/domain/finishRecord";
import { readScore, sanitizeScoreInput } from "~/domain/logic";

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
import Dialog from "~/components/scoreboard/Dialog";
import ScoreSheet from "~/components/scoreboard/ScoreSheet";

export function meta({ data }: Route.MetaArgs) {
  const name = data?.gameName || "Scoreboard";
  return [{ title: `${name} — Scoreboard` }];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { gameId } = params;
  const db = getPrisma(context);

  const game = await db.game.findUnique({
    where: { id: gameId },
    include: { players: { orderBy: { seat: "asc" } } },
  });
  if (!game) throw redirect("/?missing=1");

  const identity = readGuestCookie(request, `sb_${gameId}`);
  const mySeat = identity?.seat ?? -1;
  const myName = identity?.name ?? "Spectator";

  const cloudflare = (context as { cloudflare?: { env?: Env } }).cloudflare;
  const env = cloudflare?.env;
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
      // The socket hydrates state if the room is briefly unreachable.
    }
  }

  if (initialState?.phase === "finished") {
    try {
      await repairFinishedRecord(db, game, initialState.totals ?? []);
    } catch (error) {
      console.error(JSON.stringify({
        event: "finish_record_repair_failed",
        gameId,
        message: error instanceof Error ? error.message : "unknown",
      }));
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

type Notice = { id: number; text: string; tone: "ok" | "err" };
type PendingKind = "scores" | "undo" | "finish" | "add";
type ScoreDraft = { roundIndex: number | null; values: Record<number, string> };

type Incoming =
  | ServerMessage
  | { type: "error"; message: string }
  | { type: "pong" };

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export default function GameRoom({ loaderData }: Route.ComponentProps) {
  const { gameId, gameName, lowerIsBetter, mySeat, myName, initialState, shareUrl } =
    loaderData;

  const isHost = mySeat === 0;

  const [phase, setPhase] = useState<"playing" | "finished">(
    initialState?.phase ?? "playing",
  );
  const [players, setPlayers] = useState<(ScoreboardPlayer | null)[]>(
    initialState?.players ?? [],
  );
  const [rounds, setRounds] = useState<number[][]>(initialState?.rounds ?? []);
  const [totals, setTotals] = useState<number[]>(initialState?.totals ?? []);
  const [live, setLive] = useState(false);

  const [scoringOpen, setScoringOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<number | null>(null);
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [saving, setSaving] = useState(false);
  const [replayBusy, setReplayBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [link, setLink] = useState(shareUrl);

  const pendingRef = useRef<PendingKind | null>(null);
  const draftRef = useRef<ScoreDraft | null>(null);
  const ackTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const flash = useCallback((text: string, tone: Notice["tone"] = "ok") => {
    const id = Date.now();
    setNotice({ id, text, tone });
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice((current) => (current?.id === id ? null : current));
    }, 3200);
  }, []);

  const settle = useCallback(() => {
    pendingRef.current = null;
    if (ackTimer.current) window.clearTimeout(ackTimer.current);
    ackTimer.current = null;
    setSaving(false);
  }, []);

  const arm = useCallback((kind: PendingKind) => {
    pendingRef.current = kind;
    if (ackTimer.current) window.clearTimeout(ackTimer.current);
    ackTimer.current = window.setTimeout(() => {
      if (pendingRef.current !== kind) return;
      pendingRef.current = null;
      setSaving(false);
      if (kind === "scores" && draftRef.current) {
        setScoreInputs(draftRef.current.values);
        setEditingRound(draftRef.current.roundIndex);
        setScoringOpen(true);
      }
      if (kind === "finish") setEndConfirmOpen(true);
      if (kind === "undo") setUndoOpen(true);
      flash("That didn't save. Check your connection and try again.", "err");
    }, 4500);
  }, [flash]);

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
    setLink(`${window.location.origin}/game/${gameId}`);
    return () => {
      if (ackTimer.current) window.clearTimeout(ackTimer.current);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const onMessage = useCallback((rawMsg: unknown) => {
    const msg = rawMsg as Incoming;
    setLive(true);

    switch (msg.type) {
      case "game_state": {
        const state = msg.state;
        if (state) {
          setPhase(state.phase);
          setPlayers(state.players ?? []);
          setRounds(state.rounds ?? []);
          setTotals(state.totals ?? []);
        }
        break;
      }
      case "round_submitted": {
        setRounds((prev) => [...prev, msg.round]);
        setTotals(msg.totals);
        if (pendingRef.current === "scores") {
          draftRef.current = null;
          settle();
        }
        break;
      }
      case "round_edited": {
        setRounds(msg.rounds);
        setTotals(msg.totals);
        if (pendingRef.current === "scores") {
          draftRef.current = null;
          settle();
        }
        break;
      }
      case "round_undone": {
        setRounds((prev) => prev.slice(0, msg.roundCount));
        setTotals(msg.totals);
        if (pendingRef.current === "undo") settle();
        break;
      }
      case "game_ended": {
        setTotals(msg.totals);
        setPhase("finished");
        setScoringOpen(false);
        if (pendingRef.current === "finish") settle();
        break;
      }
      case "player_added": {
        setPlayers(msg.players);
        setRounds(msg.rounds);
        setTotals(msg.totals);
        if (pendingRef.current === "add") {
          settle();
          setAddOpen(false);
          setAddName("");
        }
        break;
      }
      case "player_joined": {
        const { seat, name } = msg;
        setPlayers((prev) => {
          const next = [...prev];
          if (next[seat]) next[seat] = { ...next[seat]!, connected: true, name };
          return next;
        });
        break;
      }
      case "player_disconnected": {
        const { seat } = msg;
        setPlayers((prev) => {
          const next = [...prev];
          if (next[seat]) next[seat] = { ...next[seat]!, connected: false };
          return next;
        });
        break;
      }
      case "error": {
        const kind = pendingRef.current;
        settle();
        if (kind === "scores" && draftRef.current) {
          setScoreInputs(draftRef.current.values);
          setEditingRound(draftRef.current.roundIndex);
          setScoringOpen(true);
        }
        if (kind === "finish") setEndConfirmOpen(true);
        if (kind === "undo") setUndoOpen(true);
        flash(msg.message || "Something went wrong.", "err");
        break;
      }
      default:
        break;
    }
  }, [flash, settle]);

  const { send } = useGameWebSocket({
    gameId,
    seat: mySeat,
    name: myName,
    onMessage,
  });

  const seated = players.filter((player): player is ScoreboardPlayer => player != null);
  const ranked = seated
    .map((player) => ({ ...player, total: totals[player.seat] ?? 0 }))
    .sort((a, b) => (lowerIsBetter ? a.total - b.total : b.total - a.total));

  let previousTotal: number | null = null;
  let previousRank = 0;
  const standing = ranked.map((player, index) => {
    const rank = previousTotal === player.total ? previousRank : index + 1;
    previousTotal = player.total;
    previousRank = rank;
    return { ...player, rank };
  });
  const leaders = rounds.length > 0 ? standing.filter((player) => player.rank === 1) : [];
  const leaderSeats = new Set(leaders.map((player) => player.seat));

  const medalClass = (rank: number) => {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    if (rank === 4) return "copper";
    return "plain";
  };

  const openScoring = (roundIndex: number | null) => {
    if (!isHost || phase !== "playing" || saving) return;
    const defaults: Record<number, string> = {};
    for (const player of seated) {
      defaults[player.seat] =
        roundIndex == null ? "" : String(rounds[roundIndex]?.[player.seat] ?? 0);
    }
    setScoreInputs(defaults);
    setEditingRound(roundIndex);
    setScoringOpen(true);
  };

  const changeScore = (seat: number, value: string) => {
    setScoreInputs((prev) => ({ ...prev, [seat]: sanitizeScoreInput(value) }));
  };

  const adjustScore = (seat: number, delta: number) => {
    setScoreInputs((prev) => {
      const next = Math.max(-9999, Math.min(9999, readScore(prev[seat]) + delta));
      return { ...prev, [seat]: String(next) };
    });
  };

  const submitScores = () => {
    if (saving) return;
    const scores = players.map((player) => readScore(player ? scoreInputs[player.seat] : "0"));
    draftRef.current = { roundIndex: editingRound, values: scoreInputs };
    setScoringOpen(false);
    setSaving(true);
    if (editingRound == null) {
      send({ type: "submit_scores", scores });
    } else {
      send({ type: "edit_round", roundIndex: editingRound, scores });
    }
    arm("scores");
  };

  const undoRound = () => {
    if (saving || rounds.length === 0) return;
    setUndoOpen(false);
    setSaving(true);
    send({ type: "undo_round" });
    arm("undo");
  };

  const endGame = () => {
    if (saving) return;
    setEndConfirmOpen(false);
    setSaving(true);
    send({ type: "end_game" });
    arm("finish");
  };

  const submitAdd = () => {
    const name = addName.trim();
    if (!name) {
      flash("Enter a name.", "err");
      return;
    }
    if (seated.some((player) => player.name === name)) {
      flash("That name is already seated.", "err");
      return;
    }
    setSaving(true);
    send({ type: "add_player", name });
    arm("add");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      flash("Link copied");
    } catch {
      setShareOpen(true);
      flash("Select the link below and copy it.", "err");
    }
  };

  const shareNative = async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: gameName || "Scoreboard",
        text: "Follow along on this scoreboard.",
        url: link,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink();
    }
  };

  const playAgain = async () => {
    const playerNames = seated
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((player) => player.name);
    setReplayBusy(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName, playerNames, lowerIsBetter }),
      });
      if (!res.ok) {
        flash("Couldn't start the next game.", "err");
        setReplayBusy(false);
        return;
      }
      const body = (await res.json()) as { gameId: string };
      window.location.assign(`/game/${body.gameId}`);
    } catch {
      flash("Couldn't start the next game.", "err");
      setReplayBusy(false);
    }
  };

  const directionLabel = lowerIsBetter ? "Lower wins" : "Higher wins";
  const roundLabel = rounds.length === 0 ? "No rounds yet" : `Round ${rounds.length}`;
  const sheetPlayers = seated.map((player) => ({ seat: player.seat, name: player.name }));

  return (
    <div className={`td-surface game-page${phase === "finished" ? " is-finished" : ""}`}>
      <header className="header-bar game-header">
        <div className="game-header-top">
          <a className="link-quiet on-dark" href="/">New board</a>
          <h1 className="game-title">{gameName || "Scoreboard"}</h1>
          <span className={`live-pill${live ? " is-live" : ""}`}>
            <span className="live-dot" aria-hidden="true" />
            {live ? "Live" : "Connecting"}
          </span>
          <div className="header-actions">
            <button type="button" className="btn-secondary header-btn" onClick={() => setShareOpen(true)}>
              <LinkIcon size={15} />
              Share
            </button>
            {isHost && phase === "playing" && rounds.length > 0 && (
              <button type="button" className="btn-secondary header-btn" onClick={() => setUndoOpen(true)} disabled={saving}>
                <UndoIcon size={15} />
                Undo
              </button>
            )}
            {isHost && phase === "playing" && (
              <button type="button" className="btn-secondary header-btn" onClick={() => setEndConfirmOpen(true)} disabled={saving}>
                <FlagIcon size={15} />
                Finish
              </button>
            )}
            {isHost && phase === "playing" && (
              <button type="button" className="btn-primary header-btn" onClick={() => openScoring(null)} disabled={saving}>
                <PencilIcon size={15} />
                {saving ? "Saving…" : "Score round"}
              </button>
            )}
          </div>
        </div>

        <div className="game-header-sub">
          <p className="game-meta meta-compact">
            <span>{roundLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{directionLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{phase === "finished" ? "Final" : "In play"}</span>
          </p>
          <div className="meta-tickets">
            <Ticket label="Round" value={rounds.length === 0 ? "—" : String(rounds.length)} />
            <Ticket label="Status" value={phase === "finished" ? "Final" : "In play"} gold={phase === "finished"} />
            <Ticket label="Direction" value={directionLabel} />
          </div>
          <p className="role-line">
            {phase === "finished"
              ? "Final scores are locked in."
              : isHost
                ? "You're keeping score on this phone. Everyone else can watch."
                : "Watching live. Scores are entered on the phone that started this board."}
            {isHost && phase === "playing" && seated.length < 12 && (
              <>
                {" "}
                <button type="button" className="link-quiet on-dark inline" onClick={() => setAddOpen(true)}>
                  Add player
                </button>
              </>
            )}
          </p>
        </div>
      </header>

      <main className="game-main">
        {isHost && phase === "playing" && rounds.length === 0 && (
          <section className="share-callout" aria-label="Share this scoreboard">
            <div>
              <p className="callout-kicker">Pass this around the table</p>
              <p className="share-code">{gameId}</p>
              <p className="callout-copy">
                Anyone with the link sees scores as you enter them. Only this phone can change them.
              </p>
            </div>
            <div className="callout-actions">
              <button type="button" className="btn-primary" onClick={copyLink}>
                <LinkIcon size={15} />
                Copy link
              </button>
              {canNativeShare && (
                <button type="button" className="btn-secondary" onClick={shareNative}>
                  Share…
                </button>
              )}
            </div>
          </section>
        )}

        <Ledger>
          <div className="scroll-curl" aria-hidden="true">~ ~ ~</div>
          {seated.length === 0 ? (
            <div className="empty-state">Connecting to the table…</div>
          ) : (
            <>
              {rounds.length === 0 && !isHost && (
                <p className="board-hint">Waiting for the first round.</p>
              )}

              <div className="board-cards">
                {standing.map((player) => {
                  const leading = leaderSeats.has(player.seat);
                  return (
                    <article
                      key={player.seat}
                      className={`player-card${leading ? " is-leader" : ""}`}
                    >
                      <div className={`rank-medallion ${medalClass(player.rank)}`} aria-hidden="true">
                        {leading && leaders.length === 1 ? (
                          <CrownIcon size={16} color="#3a2416" />
                        ) : (
                          <span>{player.rank}</span>
                        )}
                      </div>
                      <div className="player-card-id">
                        <span className="player-name">
                          {player.name}
                          {leading && <span className="sr-only">, leading</span>}
                        </span>
                        {leading && (
                          <span className="leader-tag">{leaders.length > 1 ? "Tied" : "Leading"}</span>
                        )}
                      </div>
                      <div className="big-total">{player.total}</div>
                      {rounds.length > 0 && (
                        <div className="round-strip" aria-label={`${player.name} round scores`}>
                          {rounds.map((round, index) => {
                            const score = round[player.seat] ?? 0;
                            const latest = index === rounds.length - 1;
                            const label = `Round ${index + 1}, ${score}${isHost && phase === "playing" ? ". Edit round" : ""}`;
                            const body = (
                              <>
                                <span>R{index + 1}</span>
                                <strong>{score}</strong>
                              </>
                            );
                            return isHost && phase === "playing" ? (
                              <button
                                key={index}
                                type="button"
                                className={`round-pip${latest ? " is-latest" : ""}`}
                                onClick={() => openScoring(index)}
                                aria-label={label}
                              >
                                {body}
                              </button>
                            ) : (
                              <div key={index} className={`round-pip${latest ? " is-latest" : ""}`}>
                                {body}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              <div
                className="board-scroll"
                tabIndex={0}
                aria-label="Score table. Scroll sideways for every round."
              >
                <table
                  className="score-table"
                  style={{ minWidth: 300 + rounds.length * 64 }}
                >
                  <caption className="sr-only">
                    {gameName || "Scoreboard"}. {lowerIsBetter ? "Lowest total wins." : "Highest total wins."}
                  </caption>
                  <thead>
                    <tr>
                      <th className="ledger-th is-sticky col-rank" scope="col">#</th>
                      <th className="ledger-th is-sticky col-name" scope="col">Player</th>
                      <th className="ledger-th is-sticky col-total" scope="col">Total</th>
                      {rounds.map((_, index) => (
                        <th
                          key={index}
                          className={`ledger-th${index === rounds.length - 1 ? " is-latest" : ""}`}
                          scope="col"
                        >
                          {isHost && phase === "playing" ? (
                            <button
                              type="button"
                              className="round-edit"
                              onClick={() => openScoring(index)}
                            >
                              R{index + 1}
                            </button>
                          ) : (
                            `R${index + 1}`
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {standing.map((player) => {
                      const leading = leaderSeats.has(player.seat);
                      return (
                        <tr
                          key={player.seat}
                          className={`ledger-row${leading ? " leader" : ""}`}
                        >
                          <td className="is-sticky col-rank">
                            <div className={`rank-medallion ${medalClass(player.rank)}`}>
                              {leading && leaders.length === 1 ? (
                                <CrownIcon size={16} color="#3a2416" />
                              ) : (
                                <span>{player.rank}</span>
                              )}
                            </div>
                            <span className="sr-only">
                              {leading ? "Leading, " : `Rank ${player.rank}, `}
                            </span>
                          </td>
                          <td className="is-sticky col-name">
                            <span className="player-name">{player.name}</span>
                          </td>
                          <td className="is-sticky col-total">
                            <span className="total-figure">{player.total}</span>
                          </td>
                          {rounds.map((round, index) => (
                            <td
                              key={index}
                              className={index === rounds.length - 1 ? "is-latest" : undefined}
                            >
                              <span className="round-figure">{round[player.seat] ?? 0}</span>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Ledger>
      </main>

      {phase === "playing" && (
        <div className="action-dock">
          {isHost ? (
            <>
              <div className="dock-row">
                <button type="button" className="btn-secondary" onClick={() => setShareOpen(true)}>
                  <LinkIcon size={15} />
                  Share
                </button>
                {rounds.length > 0 && (
                  <button type="button" className="btn-secondary" onClick={() => setUndoOpen(true)} disabled={saving}>
                    <UndoIcon size={15} />
                    Undo
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={() => setEndConfirmOpen(true)} disabled={saving}>
                  <FlagIcon size={15} />
                  Finish
                </button>
              </div>
              <button type="button" className="btn-primary" onClick={() => openScoring(null)} disabled={saving}>
                <PencilIcon size={16} />
                {saving ? "Saving…" : "Score round"}
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setShareOpen(true)}>
              <LinkIcon size={15} />
              Share link
            </button>
          )}
        </div>
      )}

      {phase === "finished" && (
        <div className="finished-banner">
          <div className="finished-inner">
            <div className="finished-copy">
              <div className="finished-title">
                <span className="wax-seal" aria-hidden="true">Final</span>
                <span>Game over</span>
              </div>
              {leaders.length > 0 && (
                <p>
                  {leaders.length > 1 ? "Tie: " : "Winner: "}
                  <span className="winner-name">{joinNames(leaders.map((player) => player.name))}</span>
                  {" "}
                  <span className="winner-score">{leaders[0].total}</span>
                  <span className="winner-unit"> pts</span>
                </p>
              )}
            </div>
            <div className="finished-actions">
              {isHost && (
                <button type="button" className="btn-primary" onClick={playAgain} disabled={replayBusy}>
                  {replayBusy ? "Starting…" : "Play again"}
                </button>
              )}
              <a className="btn-secondary" href="/">New setup</a>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className={`toast-stamp${notice.tone === "err" ? " is-err" : ""}`} role="status">
          {notice.text}
        </div>
      )}

      <ScoreSheet
        open={scoringOpen}
        mode={editingRound == null ? "new" : "edit"}
        roundNumber={editingRound == null ? rounds.length + 1 : editingRound + 1}
        players={sheetPlayers}
        values={scoreInputs}
        totals={totals}
        previousRound={editingRound == null ? null : rounds[editingRound] ?? null}
        saving={saving}
        onChange={changeScore}
        onAdjust={adjustScore}
        onSubmit={submitScores}
        onClose={() => setScoringOpen(false)}
      />

      <Dialog open={shareOpen} titleId="share-title" onClose={() => setShareOpen(false)}>
        <div className="sheet-head">
          <h3 id="share-title">Share this board</h3>
          <button type="button" className="icon-btn" onClick={() => setShareOpen(false)} aria-label="Close share dialog">
            <CloseIcon size={16} />
          </button>
        </div>
        <p>Anyone with the link can watch the scores update. Sending it does not let them change the score.</p>
        <p className="share-code dialog-code">{gameId}</p>
        <label className="field-label" htmlFor="share-url">Link</label>
        <input
          id="share-url"
          className="td-input share-field"
          readOnly
          value={link}
          data-autofocus
          onFocus={(event) => event.target.select()}
        />
        <div className="sheet-actions">
          <BtnSecondary type="button" onClick={copyLink}>Copy link</BtnSecondary>
          {canNativeShare && (
            <BtnPrimary type="button" onClick={shareNative}>Share…</BtnPrimary>
          )}
        </div>
      </Dialog>

      <Dialog open={undoOpen} titleId="undo-title" onClose={() => setUndoOpen(false)}>
        <div className="sheet-head">
          <h3 id="undo-title">Remove the last round?</h3>
          <button type="button" className="icon-btn" onClick={() => setUndoOpen(false)} aria-label="Cancel undo">
            <CloseIcon size={16} />
          </button>
        </div>
        <p>Round {rounds.length} comes off the board for everyone.</p>
        {rounds.length > 0 && (
          <ul className="undo-list">
            {seated.map((player) => (
              <li key={player.seat}>
                <span>{player.name}</span>
                <span>{rounds[rounds.length - 1]?.[player.seat] ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="sheet-actions">
          <BtnSecondary type="button" data-autofocus onClick={() => setUndoOpen(false)}>Keep round</BtnSecondary>
          <button type="button" className="btn-destructive" onClick={undoRound}>Remove round</button>
        </div>
      </Dialog>

      <Dialog open={endConfirmOpen} titleId="finish-title" onClose={() => setEndConfirmOpen(false)}>
        <div className="sheet-head">
          <h3 id="finish-title">Finish this game?</h3>
          <button type="button" className="icon-btn" onClick={() => setEndConfirmOpen(false)} aria-label="Keep playing">
            <CloseIcon size={16} />
          </button>
        </div>
        <p>
          This locks the board and saves the final scores. Everyone watching will see the result.
          You can deal a new game with the same players afterward.
        </p>
        {rounds.length === 0 && <p>No rounds have been scored yet.</p>}
        <div className="sheet-actions">
          <BtnSecondary type="button" data-autofocus onClick={() => setEndConfirmOpen(false)}>Keep playing</BtnSecondary>
          <button type="button" className="btn-destructive" onClick={endGame}>Finish game</button>
        </div>
      </Dialog>

      <Dialog open={addOpen} titleId="add-title" onClose={() => setAddOpen(false)}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving) submitAdd();
          }}
        >
          <div className="sheet-head">
            <h3 id="add-title">Add a player</h3>
            <button type="button" className="icon-btn" onClick={() => setAddOpen(false)} aria-label="Cancel add player">
              <CloseIcon size={16} />
            </button>
          </div>
          <p>They start at zero for rounds already scored. Edit a round if they were playing the whole time.</p>
          <label className="field-label" htmlFor="add-player-name">Name</label>
          <input
            id="add-player-name"
            className="td-input"
            data-autofocus
            value={addName}
            maxLength={24}
            autoComplete="off"
            autoCapitalize="words"
            placeholder="Name"
            onChange={(event) => setAddName(event.target.value)}
          />
          <div className="sheet-actions">
            <BtnSecondary type="button" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? "Adding…" : "Add player"}</BtnPrimary>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
