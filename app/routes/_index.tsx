import { useEffect, useState, useRef } from "react";
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

export async function loader() {
  return {};
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

export default function Index(_: Route.ComponentProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [gameName, setGameName] = useState("");
  const [lowerIsBetter, setLowerIsBetter] = useState(false);
  const [playerNames, setPlayerNames] = useState(["", ""]);
  const [presets, setPresets] = useState<ScoreboardPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState("");
  const lastInputRef = useRef<HTMLInputElement>(null);

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
    <div
      className="td-surface"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      {/* Back link */}
      <a
        href="https://tabledeck.us"
        className="btn-ghost"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          fontSize: 11,
          letterSpacing: "0.22em",
        }}
      >
        &larr; Return to Tabledeck
      </a>

      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ marginBottom: 14, color: "var(--gold)", display: "flex", justifyContent: "center" }}>
          <ClipboardIcon size={52} />
        </div>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontVariant: "small-caps",
            fontWeight: 700,
            fontSize: 48,
            color: "var(--gold-hi)",
            letterSpacing: "0.08em",
            margin: "0 0 6px",
            textShadow:
              "0 2px 0 rgba(0,0,0,0.5), 0 0 22px rgba(201,162,74,0.2)",
          }}
        >
          Scoreboard
        </h1>
        {/* Gold rule */}
        <div
          style={{
            height: 1,
            background:
              "linear-gradient(90deg,transparent,var(--gold) 30%,var(--gold-hi) 50%,var(--gold) 70%,transparent)",
            margin: "6px auto 12px",
            width: 200,
          }}
        />
        <p
          style={{
            fontFamily: "var(--sans)",
            fontSize: 15,
            color: "rgba(246,239,224,0.65)",
            maxWidth: 360,
            lineHeight: 1.55,
            margin: "0 auto",
          }}
        >
          Live scores for any game — hearts, nertz, mexican train, and more.
          Share the link so everyone can follow along.
        </p>
      </div>

      {/* Create form — inside a lobby card */}
      <div
        className="lobby-card"
        style={{ position: "relative" }}
      >
        {/* Card content sits above texture layer */}
        <div style={{ position: "relative", zIndex: 1, padding: "28px 28px 24px" }}>

          {/* Card heading */}
          <h2
            style={{
              fontFamily: "var(--serif)",
              fontVariant: "small-caps",
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: "0.18em",
              color: "var(--walnut)",
              margin: "0 0 20px",
              paddingBottom: 10,
              borderBottom: "1.5px solid rgba(26,22,18,0.25)",
            }}
          >
            New Scoreboard
          </h2>

          {/* Game name */}
          <label
            htmlFor="gameName"
            style={{
              fontFamily: "var(--serif)",
              fontVariant: "small-caps",
              letterSpacing: "0.18em",
              fontSize: 11,
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 8,
            }}
          >
            Game Name{" "}
            <span style={{ color: "var(--ink-faint)", fontVariant: "normal", fontSize: 10 }}>
              (optional)
            </span>
          </label>
          <input
            id="gameName"
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="e.g. Friday Night Hearts"
            maxLength={60}
            className="td-input"
            style={{ marginBottom: 20 }}
          />

          {/* Scoring direction */}
          <label
            style={{
              fontFamily: "var(--serif)",
              fontVariant: "small-caps",
              letterSpacing: "0.18em",
              fontSize: 11,
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 8,
            }}
          >
            Scoring Direction
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button
              onClick={() => setLowerIsBetter(false)}
              className={!lowerIsBetter ? "ticket ticket-gold" : "ticket"}
              style={{ flex: 1, cursor: "pointer", border: "none", textAlign: "center", clipPath: "none", borderRadius: 5 }}
              type="button"
            >
              <span className="ticket-label">Direction</span>
              <span className="ticket-value">Higher Wins</span>
            </button>
            <button
              onClick={() => setLowerIsBetter(true)}
              className={lowerIsBetter ? "ticket ticket-gold" : "ticket"}
              style={{ flex: 1, cursor: "pointer", border: "none", textAlign: "center", clipPath: "none", borderRadius: 5 }}
              type="button"
            >
              <span className="ticket-label">Direction</span>
              <span className="ticket-value">Lower Wins</span>
            </button>
          </div>
          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 11,
              color: "var(--ink-faint)",
              marginBottom: 20,
              marginTop: 4,
            }}
          >
            {lowerIsBetter
              ? "Lowest total score wins — hearts, golf, etc."
              : "Highest total score wins — most games"}
          </p>

          {/* Players */}
          <label
            style={{
              fontFamily: "var(--serif)",
              fontVariant: "small-caps",
              letterSpacing: "0.18em",
              fontSize: 11,
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 8,
            }}
          >
            Players{" "}
            <span style={{ color: "var(--ink-faint)", fontVariant: "normal", fontSize: 10 }}>
              ({playerNames.length}/12)
            </span>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {playerNames.map((name, i) => (
              <div key={i} className="seat-row">
                {/* Seat number */}
                <span className="seat-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  ref={i === playerNames.length - 1 ? lastInputRef : undefined}
                  type="text"
                  value={name}
                  onChange={(e) => updatePlayer(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (i === playerNames.length - 1) addPlayer();
                    }
                  }}
                  placeholder={`Player ${i + 1}`}
                  maxLength={24}
                  className="td-input"
                  style={{ flex: 1 }}
                />
                {playerNames.length > 2 && (
                  <button
                    onClick={() => removePlayer(i)}
                    aria-label="Remove player"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--ink-faint)",
                      display: "flex",
                      alignItems: "center",
                      padding: "4px 2px",
                      flexShrink: 0,
                    }}
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Saved setups */}
          <label
            style={{
              fontFamily: "var(--serif)",
              fontVariant: "small-caps",
              letterSpacing: "0.18em",
              fontSize: 11,
              color: "var(--ink-soft)",
              display: "block",
              marginBottom: 8,
              marginTop: 8,
            }}
          >
            Saved Setups
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Setup name"
              maxLength={32}
              className="td-input"
              style={{ flex: 1 }}
            />
            <BtnSecondary
              onClick={savePreset}
              type="button"
              style={{ flexShrink: 0, padding: "7px 12px" }}
            >
              Save
            </BtnSecondary>
          </div>

          {presets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "rgba(26,22,18,0.05)",
                    border: "1px solid rgba(26,22,18,0.1)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--serif)",
                        fontWeight: 600,
                        fontStyle: "italic",
                        fontSize: 14,
                        color: "var(--ink)",
                      }}
                    >
                      {preset.name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--sans)",
                        fontSize: 11,
                        color: "var(--ink-faint)",
                      }}
                    >
                      {preset.playerNames.length} players · {preset.lowerIsBetter ? "Lower wins" : "Higher wins"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(preset.id)}
                    aria-label={`Delete ${preset.name}`}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--ink-faint)",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                    }}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {playerNames.length < 12 && (
            <button
              onClick={addPlayer}
              style={{
                fontFamily: "var(--serif)",
                fontVariant: "small-caps",
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: "0.18em",
                color: "var(--gold-lo)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
                marginBottom: 16,
                textDecoration: "underline",
                textDecorationStyle: "dashed",
                textUnderlineOffset: 4,
              }}
              type="button"
            >
              + Seat another player
            </button>
          )}

          {error && (
            <p
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 13,
                color: "var(--wine-mid)",
                marginBottom: 12,
              }}
            >
              {error}
            </p>
          )}

          <BtnPrimary
            onClick={createGame}
            disabled={creating}
            style={{ width: "100%", marginTop: 8 }}
            type="button"
          >
            {creating ? "Creating..." : "Start Scoreboard"}
          </BtnPrimary>

          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 11,
              color: "var(--ink-faint)",
              textAlign: "center",
              marginTop: 14,
            }}
          >
            You'll get a shareable link — anyone with it can watch live
          </p>
        </div>
      </div>
    </div>
  );
}
