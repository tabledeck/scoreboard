-- Migration: 0001_init
-- Game and GamePlayer tables for scoreboard app

CREATE TABLE "Game" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "gameName"      TEXT NOT NULL DEFAULT '',
  "status"        TEXT NOT NULL DEFAULT 'active',
  "lowerIsBetter" INTEGER NOT NULL DEFAULT 0,
  "maxPlayers"    INTEGER NOT NULL,
  "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"    DATETIME
);

CREATE INDEX "Game_status_idx" ON "Game"("status");

CREATE TABLE "GamePlayer" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "gameId"     TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "seat"       INTEGER NOT NULL,
  "finalScore" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GamePlayer_gameId_seat_key" ON "GamePlayer"("gameId", "seat");
CREATE INDEX "GamePlayer_gameId_idx" ON "GamePlayer"("gameId");
