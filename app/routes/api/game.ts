import { data } from "react-router";
import type { Route } from "./+types/game";
import { getPrisma } from "~/db.server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { makeGuestCookieHeader } from "@tabledeck/game-room/server";

const CreateGameSchema = z.object({
  gameName: z.string().max(60).default(""),
  playerNames: z
    .array(z.string().min(1).max(24))
    .min(2)
    .max(12),
  lowerIsBetter: z.boolean().default(false),
});

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const parsed = CreateGameSchema.safeParse(body);
  if (!parsed.success) {
    throw data({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { gameName, playerNames, lowerIsBetter } = parsed.data;
  const maxPlayers = playerNames.length;
  const gameId = nanoid(6);

  const db = getPrisma(context);

  // Create DB records
  await db.game.create({
    data: {
      id: gameId,
      gameName,
      lowerIsBetter,
      maxPlayers,
      players: {
        create: playerNames.map((name, seat) => ({
          id: nanoid(12),
          name,
          seat,
        })),
      },
    },
  });

  // Initialize the Durable Object with all players pre-seated
  const env = (context as any).cloudflare.env as Env;
  const doId = env.SCOREBOARD_ROOM.idFromName(gameId);
  const stub = env.SCOREBOARD_ROOM.get(doId);

  await stub.fetch(
    new Request("http://internal/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        settings: {
          maxPlayers,
          gameName,
          playerNames,
          lowerIsBetter,
        },
      }),
    }),
  );

  // Set host cookie so the creator gets score-entry controls
  const hostCookie = makeGuestCookieHeader(
    `sb_${gameId}`,
    0,
    playerNames[0],
  );

  return data(
    { gameId },
    {
      headers: {
        "Set-Cookie": hostCookie,
      },
    },
  );
}
