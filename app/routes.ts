import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("game/:gameId", "routes/game.$gameId.tsx"),
  route("api/game", "routes/api/game.ts"),
] satisfies RouteConfig;
