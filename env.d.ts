/// <reference types="@cloudflare/workers-types" />

export {};

declare global {
  interface Env {
    D1_DATABASE: D1Database;
    SCOREBOARD_ROOM: DurableObjectNamespace;
    ENVIRONMENT: string;
  }
}

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}
