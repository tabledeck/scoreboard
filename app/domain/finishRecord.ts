import type { PrismaClient } from "~/db/client";

/**
 * Repair a board that is already finished in the durable object but was
 * never stamped in D1. Safe to call on every load: it does not move an
 * existing finishedAt, and it only rewrites a finalScore that differs.
 */

type FinishedGameRow = {
  id: string;
  status: string;
  finishedAt: Date | null;
  players: { id: string; seat: number; finalScore: number }[];
};

export async function repairFinishedRecord(
  db: PrismaClient,
  game: FinishedGameRow,
  totals: number[],
): Promise<void> {
  if (game.status !== "finished" || game.finishedAt == null) {
    await db.game.update({
      where: { id: game.id },
      data: {
        status: "finished",
        finishedAt: game.finishedAt ?? new Date(),
      },
    });
  }

  if (totals.length < game.players.length) return;

  const stale = game.players.filter(
    (player) => (totals[player.seat] ?? 0) !== player.finalScore,
  );
  await Promise.all(
    stale.map((player) =>
      db.gamePlayer.update({
        where: { id: player.id },
        data: { finalScore: totals[player.seat] ?? 0 },
      }),
    ),
  );
}
