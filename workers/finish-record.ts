/**
 * Stamp a finished scoreboard into D1.
 *
 * Tabledeck's weekly stats count games with status "finished" and a
 * finishedAt. The durable object is the live board; this write is what
 * makes a finished game visible to those stats. finalScore is updated
 * alongside so a completed game does not keep the default 0.
 *
 * finishedAt uses the same UTC offset format Prisma writes for createdAt
 * (`2026-10-20T22:34:27.878+00:00`) so the two columns compare cleanly.
 */

export function finishedAtStamp(date = new Date()): string {
  return date.toISOString().replace("Z", "+00:00");
}

export async function writeFinishedGame(
  db: D1Database,
  gameId: string,
  totals: number[],
  seats: number[],
): Promise<boolean> {
  const finishedAt = finishedAtStamp();
  const statements = [
    db
      .prepare(
        `UPDATE Game
         SET status = 'finished',
             finishedAt = COALESCE(finishedAt, ?)
         WHERE id = ?`,
      )
      .bind(finishedAt, gameId),
    ...seats.map((seat) =>
      db
        .prepare(
          `UPDATE GamePlayer
           SET finalScore = ?
           WHERE gameId = ? AND seat = ?`,
        )
        .bind(totals[seat] ?? 0, gameId, seat),
    ),
  ];
  const results = await db.batch(statements);
  return Number(results[0]?.meta?.changes ?? 0) > 0;
}

export async function writeAddedPlayer(
  db: D1Database,
  gameId: string,
  playerId: string,
  name: string,
  seat: number,
  maxPlayers: number,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO GamePlayer (id, gameId, name, seat, finalScore)
         VALUES (?, ?, ?, ?, 0)`,
      )
      .bind(playerId, gameId, name, seat),
    db
      .prepare(`UPDATE Game SET maxPlayers = ? WHERE id = ?`)
      .bind(maxPlayers, gameId),
  ]);
}
