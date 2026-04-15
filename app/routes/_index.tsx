import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/_index";

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

export default function Index(_: Route.ComponentProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [gameName, setGameName] = useState("");
  const [lowerIsBetter, setLowerIsBetter] = useState(false);
  const [playerNames, setPlayerNames] = useState(["", ""]);
  const [error, setError] = useState("");
  const lastInputRef = useRef<HTMLInputElement>(null);

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
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      {/* Back to tabledeck */}
      <a
        href="https://tabledeck.us"
        className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm"
      >
        ← tabledeck.us
      </a>

      {/* Hero */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-3">📋</div>
        <h1 className="text-5xl font-bold text-white mb-3">Scoreboard</h1>
        <p className="text-gray-400 text-lg max-w-md">
          Live scores for any game — hearts, nertz, mexican train, and more.
          Share the link so everyone can follow along.
        </p>
      </div>

      {/* Create form */}
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md border border-gray-800">
        <h2 className="text-white font-semibold text-xl mb-6">New Scoreboard</h2>

        {/* Game name */}
        <label className="text-gray-400 text-sm block mb-2" htmlFor="gameName">
          Game name <span className="text-gray-600">(optional)</span>
        </label>
        <input
          id="gameName"
          type="text"
          value={gameName}
          onChange={(e) => setGameName(e.target.value)}
          placeholder="e.g. Friday Night Hearts"
          maxLength={60}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm mb-5 focus:outline-none focus:border-amber-600"
        />

        {/* Scoring direction */}
        <label className="text-gray-400 text-sm block mb-2">
          Scoring direction
        </label>
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setLowerIsBetter(false)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              !lowerIsBetter
                ? "bg-amber-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Higher wins
          </button>
          <button
            onClick={() => setLowerIsBetter(true)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              lowerIsBetter
                ? "bg-amber-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Lower wins
          </button>
        </div>
        <p className="text-gray-500 text-xs mb-5 -mt-3">
          {lowerIsBetter
            ? "Lowest total score wins — hearts, golf, etc."
            : "Highest total score wins — most games"}
        </p>

        {/* Players */}
        <label className="text-gray-400 text-sm block mb-2">
          Players <span className="text-gray-600">({playerNames.length}/12)</span>
        </label>
        <div className="flex flex-col gap-2 mb-3">
          {playerNames.map((name, i) => (
            <div key={i} className="flex gap-2">
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
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-amber-600"
              />
              {playerNames.length > 2 && (
                <button
                  onClick={() => removePlayer(i)}
                  className="text-gray-500 hover:text-red-400 px-2 transition-colors"
                  aria-label="Remove player"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {playerNames.length < 12 && (
          <button
            onClick={addPlayer}
            className="text-amber-500 hover:text-amber-400 text-sm mb-5 transition-colors"
          >
            + Add player
          </button>
        )}

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <button
          onClick={createGame}
          disabled={creating}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-lg transition-colors mt-2"
        >
          {creating ? "Creating..." : "Start Scoreboard"}
        </button>

        <p className="text-gray-500 text-xs text-center mt-4">
          You'll get a shareable link — anyone with it can watch the live leaderboard
        </p>
      </div>
    </div>
  );
}
