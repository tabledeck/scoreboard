import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/_index";
import BtnPrimary from "~/components/tabledeck/BtnPrimary";
import BtnSecondary from "~/components/tabledeck/BtnSecondary";
import ClipboardIcon from "~/components/icons/ClipboardIcon";
import CloseIcon from "~/components/icons/CloseIcon";

export function meta() {
  return [
    { title: "Scoreboard — Track scores for any game" },
    {
      name: "description",
      content:
        "Free live scoreboard for hearts, nertz, mexican train, and any game with rounds. Share a link so everyone can follow along.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return { missing: url.searchParams.get("missing") === "1" };
}

const PRESET_STORAGE_KEY = "tabledeck.scoreboard.presets.v1";
const MAX_PRESETS = 8;
const GAME_KEY = "scoreboard";

interface ScoreboardPreset {
  id: string;
  name: string;
  gameName: string;
  lowerIsBetter: boolean;
  playerNames: string[];
  createdAt: number;
}

interface AccountSetupPreset {
  id: string;
  name: string;
  settings: unknown;
  createdAt: string;
  updatedAt: string;
}

function getAccountPresetEndpoint() {
  if (typeof window === "undefined") return "";
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000/api/account/setup-presets";
  }
  if (hostname.endsWith(".tabledeck.us") || hostname === "tabledeck.us") {
    return "https://tabledeck.us/api/account/setup-presets";
  }
  return `${protocol}//${hostname}/api/account/setup-presets`;
}

function readPresets(): ScoreboardPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PRESET_STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((preset): preset is ScoreboardPreset => {
      const p = preset as Partial<ScoreboardPreset>;
      return (
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.gameName === "string" &&
        typeof p.lowerIsBetter === "boolean" &&
        Array.isArray(p.playerNames) &&
        p.playerNames.every((name) => typeof name === "string") &&
        typeof p.createdAt === "number"
      );
    });
  } catch {
    return [];
  }
}

function writePresets(presets: ScoreboardPreset[]) {
  window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function isPresetSettings(value: unknown): value is {
  gameName: string;
  lowerIsBetter: boolean;
  playerNames: string[];
} {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.gameName === "string" &&
    typeof settings.lowerIsBetter === "boolean" &&
    Array.isArray(settings.playerNames) &&
    settings.playerNames.every((name) => typeof name === "string")
  );
}

function fromAccountPreset(preset: AccountSetupPreset): ScoreboardPreset | null {
  if (!isPresetSettings(preset.settings)) return null;
  return {
    id: preset.id,
    name: preset.name,
    gameName: preset.settings.gameName,
    lowerIsBetter: preset.settings.lowerIsBetter,
    playerNames: preset.settings.playerNames,
    createdAt:
      Date.parse(preset.updatedAt) ||
      Date.parse(preset.createdAt) ||
      Date.now(),
  };
}

function mergePresets(
  accountPresets: ScoreboardPreset[],
  localPresets: ScoreboardPreset[],
) {
  const byName = new Map<string, ScoreboardPreset>();
  for (const preset of [...localPresets].reverse()) byName.set(preset.name, preset);
  for (const preset of [...accountPresets].reverse()) byName.set(preset.name, preset);
  return [...byName.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_PRESETS);
}

async function loadAccountPresets(): Promise<ScoreboardPreset[]> {
  const endpoint = getAccountPresetEndpoint();
  if (!endpoint) return [];
  const response = await fetch(`${endpoint}?gameKey=${GAME_KEY}`, {
    credentials: "include",
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { presets?: AccountSetupPreset[] };
  return (body.presets ?? [])
    .map((preset) => fromAccountPreset(preset))
    .filter((preset): preset is ScoreboardPreset => preset !== null);
}

async function saveAccountPreset(
  preset: ScoreboardPreset,
): Promise<ScoreboardPreset | null> {
  const endpoint = getAccountPresetEndpoint();
  if (!endpoint) return null;
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameKey: GAME_KEY,
      name: preset.name,
      settings: {
        gameName: preset.gameName,
        lowerIsBetter: preset.lowerIsBetter,
        playerNames: preset.playerNames,
      },
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { preset?: AccountSetupPreset };
  return body.preset ? fromAccountPreset(body.preset) : null;
}

async function deleteAccountPreset(presetId: string) {
  const endpoint = getAccountPresetEndpoint();
  if (!endpoint) return;
  await fetch(`${endpoint}?id=${encodeURIComponent(presetId)}`, {
    method: "DELETE",
    credentials: "include",
  });
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [gameName, setGameName] = useState("");
  const [lowerIsBetter, setLowerIsBetter] = useState(false);
  const [playerNames, setPlayerNames] = useState(["", ""]);
  const [presets, setPresets] = useState<ScoreboardPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState("");
  const [joinValue, setJoinValue] = useState("");
  const [joinError, setJoinError] = useState("");
  const lastInputRef = useRef<HTMLInputElement>(null);
  const joinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loaderData.missing) joinRef.current?.focus();
  }, [loaderData.missing]);

  useEffect(() => {
    const localPresets = readPresets();
    setPresets(localPresets);
    loadAccountPresets()
      .then((accountPresets) => {
        if (accountPresets.length === 0) return;
        const merged = mergePresets(accountPresets, readPresets());
        writePresets(merged);
        setPresets(merged);
      })
      .catch(() => {
        // Local presets remain available when the account API is unreachable.
      });
  }, []);

  const addPlayer = () => {
    if (playerNames.length >= 12) return;
    setPlayerNames((prev) => [...prev, ""]);
    // Focus the new input on next render
    setTimeout(() => lastInputRef.current?.focus(), 0);
  };

  const removePlayer = (idx: number) => {
    if (playerNames.length <= 2) return;
    setPlayerNames((prev) => prev.filter((_, i) => i !== idx));
  };

  const updatePlayer = (idx: number, val: string) => {
    setPlayerNames((prev) => prev.map((n, i) => (i === idx ? val : n)));
  };

  const savePreset = async () => {
    const trimmedPlayers = playerNames.map((n) => n.trim()).filter(Boolean);
    if (trimmedPlayers.length < 2) {
      setError("Enter at least 2 player names before saving a setup.");
      return;
    }

    const localPreset: ScoreboardPreset = {
      id: crypto.randomUUID(),
      name:
        presetName.trim() ||
        gameName.trim() ||
        `${trimmedPlayers.length}-player scoreboard`,
      gameName: gameName.trim(),
      lowerIsBetter,
      playerNames: trimmedPlayers,
      createdAt: Date.now(),
    };
    const accountPreset = await saveAccountPreset(localPreset).catch(() => null);
    const nextPreset = accountPreset ?? localPreset;

    const nextPresets = [
      nextPreset,
      ...presets.filter((preset) => preset.name !== nextPreset.name),
    ].slice(0, MAX_PRESETS);
    writePresets(nextPresets);
    setPresets(nextPresets);
    setPresetName("");
    setError("");
  };

  const applyPreset = (preset: ScoreboardPreset) => {
    setGameName(preset.gameName);
    setLowerIsBetter(preset.lowerIsBetter);
    setPlayerNames(preset.playerNames.length >= 2 ? preset.playerNames : ["", ""]);
    setError("");
  };

  const deletePreset = (presetId: string) => {
    const nextPresets = presets.filter((preset) => preset.id !== presetId);
    writePresets(nextPresets);
    setPresets(nextPresets);
    deleteAccountPreset(presetId).catch(() => {
      // The local delete already happened; account sync will retry on the next save.
    });
  };

  const openJoin = (event: FormEvent) => {
    event.preventDefault();
    const text = joinValue.trim();
    if (!text) {
      setJoinError("Enter a scoreboard code or paste the link.");
      return;
    }
    let id = text;
    try {
      if (text.includes("/")) {
        const url = new URL(text, window.location.origin);
        const parts = url.pathname.split("/").filter(Boolean);
        const gameIndex = parts.indexOf("game");
        id = (gameIndex >= 0 ? parts[gameIndex + 1] : parts[parts.length - 1]) ?? "";
      }
    } catch {
      id = text;
    }
    id = id.trim();
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(id)) {
      setJoinError("That doesn't look like a scoreboard link.");
      return;
    }
    setJoinError("");
    navigate(`/game/${id}`);
  };

  const createGame = async () => {
    const trimmed = playerNames.map((n) => n.trim()).filter(Boolean);
    if (trimmed.length < 2) {
      setError("Enter at least 2 player names.");
      return;
    }
    const dupes = trimmed.filter((n, i) => trimmed.indexOf(n) !== i);
    if (dupes.length > 0) {
      setError(`Duplicate names: ${dupes.join(", ")}`);
      return;
    }

    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameName: gameName.trim(),
          playerNames: trimmed,
          lowerIsBetter,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to create scoreboard.");
        setCreating(false);
        return;
      }
      const { gameId } = (await res.json()) as { gameId: string };
      navigate(`/game/${gameId}`);
    } catch {
      setError("Network error. Please try again.");
      setCreating(false);
    }
  };

  return (
    <div className="td-surface home-page">
      <header className="site-nav">
        <a className="link-quiet on-dark" href="https://tabledeck.us">
          &larr; Return to Tabledeck
        </a>
      </header>

      <main className="home-main">
        <div className="hero">
          <div className="hero-mark">
            <ClipboardIcon size={48} />
          </div>
          <h1 className="hero-title">Scoreboard</h1>
          <div className="gold-rule" />
          <p className="hero-copy">
            Live scores for any game — hearts, nertz, mexican train, and more.
            Share the link so everyone at the table can follow along.
          </p>
        </div>

        <form
          className="lobby-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (!creating) void createGame();
          }}
        >
          <div className="card-body">
            <h2 className="card-title">New scoreboard</h2>

            {presets.length > 0 && (
              <div className="preset-block">
                <span className="field-label">Saved setups</span>
                <div className="preset-list">
                  {presets.map((preset) => (
                    <div className="preset-row" key={preset.id}>
                      <button
                        type="button"
                        className="preset-apply"
                        onClick={() => applyPreset(preset)}
                      >
                        <span className="preset-name">{preset.name}</span>
                        <span className="preset-meta">
                          {preset.playerNames.length} players · {preset.lowerIsBetter ? "Lower wins" : "Higher wins"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => deletePreset(preset.id)}
                        aria-label={`Delete ${preset.name}`}
                      >
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="field-label" htmlFor="gameName">
              Game name <span className="field-optional">(optional)</span>
            </label>
            <input
              id="gameName"
              type="text"
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="e.g. Friday Night Hearts"
              maxLength={60}
              className="td-input"
              autoComplete="off"
            />

            <span className="field-label" id="direction-label">Scoring direction</span>
            <div className="segmented" role="group" aria-labelledby="direction-label">
              <button
                type="button"
                aria-pressed={!lowerIsBetter}
                className={!lowerIsBetter ? "is-selected" : undefined}
                onClick={() => setLowerIsBetter(false)}
              >
                <span className="seg-kicker">Most games</span>
                <span className="seg-label">Higher wins</span>
              </button>
              <button
                type="button"
                aria-pressed={lowerIsBetter}
                className={lowerIsBetter ? "is-selected" : undefined}
                onClick={() => setLowerIsBetter(true)}
              >
                <span className="seg-kicker">Hearts, golf</span>
                <span className="seg-label">Lower wins</span>
              </button>
            </div>
            <p className="field-hint">
              {lowerIsBetter
                ? "Lowest total score wins."
                : "Highest total score wins."}
            </p>

            <span className="field-label">
              Players <span className="field-optional">({playerNames.length}/12)</span>
            </span>
            <div className="seat-list">
              {playerNames.map((name, index) => (
                <div key={index} className="seat-row">
                  <span className="seat-number">{String(index + 1).padStart(2, "0")}</span>
                  <input
                    ref={index === playerNames.length - 1 ? lastInputRef : undefined}
                    type="text"
                    value={name}
                    onChange={(event) => updatePlayer(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (index === playerNames.length - 1) addPlayer();
                      }
                    }}
                    placeholder={`Player ${index + 1}`}
                    maxLength={24}
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint={index === playerNames.length - 1 ? "next" : "next"}
                    aria-label={`Player ${index + 1} name`}
                    className="td-input"
                  />
                  {playerNames.length > 2 && (
                    <button
                      type="button"
                      className="icon-btn seat-remove"
                      onClick={() => removePlayer(index)}
                      aria-label={`Remove player ${index + 1}`}
                    >
                      <CloseIcon size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {playerNames.length < 12 && (
              <button type="button" className="btn-secondary add-seat" onClick={addPlayer}>
                Add a player
              </button>
            )}

            {error && (
              <p className="form-error" role="alert">{error}</p>
            )}

            <BtnPrimary type="submit" disabled={creating} className="start-btn">
              {creating ? "Creating…" : "Start scoreboard"}
            </BtnPrimary>
            <p className="field-hint center">
              You'll get a link to pass around. Only this phone keeps score.
            </p>

            <details className="setup-save">
              <summary>Save this setup</summary>
              <div className="save-row">
                <input
                  type="text"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void savePreset();
                    }
                  }}
                  placeholder="Setup name"
                  maxLength={32}
                  className="td-input"
                  aria-label="Setup name"
                />
                <BtnSecondary type="button" onClick={savePreset}>
                  Save
                </BtnSecondary>
              </div>
            </details>
          </div>
        </form>

        <form className="lobby-card join-card" onSubmit={openJoin}>
          <div className="card-body">
            <h2 className="card-title">Open a scoreboard</h2>
            <p className="field-hint join-hint">
              Paste a code or the full link someone sent you.
            </p>
            {(loaderData.missing || joinError) && (
              <p className="form-error" role="alert">
                {joinError || "That scoreboard doesn't exist. Check the code and try again."}
              </p>
            )}
            <div className="save-row">
              <input
                ref={joinRef}
                type="text"
                value={joinValue}
                onChange={(event) => setJoinValue(event.target.value)}
                placeholder="Code or link"
                className="td-input"
                aria-label="Scoreboard code or link"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <BtnPrimary type="submit">Open</BtnPrimary>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
