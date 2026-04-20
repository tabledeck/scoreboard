import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";
import type { Route } from "./+types/root";
import styles from "./app.css?url";

export const meta: Route.MetaFunction = () => [
  { title: "Scoreboard" },
  { name: "description", content: "Live scoreboard for any game" },
];

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;700&family=Caveat:wght@500;600&display=swap",
  },
  { rel: "stylesheet", href: styles },
];

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";
  let statusCode: number | null = null;

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    if (error.status === 404) {
      title = "Not Found";
      message = "That scoreboard doesn't exist.";
    } else {
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error — Scoreboard</title>
        <Meta />
        <Links />
      </head>
      <body
        className="td-surface flex flex-col items-center justify-center p-4"
        style={{ minHeight: "100vh" }}
      >
        <div
          style={{
            background: "linear-gradient(180deg,#f6efe0 0%,#e2d4b0 100%)",
            borderRadius: 8,
            padding: "32px 40px",
            textAlign: "center",
            boxShadow:
              "inset 0 0 0 1px rgba(26,22,18,0.18),0 12px 36px rgba(0,0,0,0.65)",
          }}
        >
          {statusCode && (
            <p
              style={{
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: 56,
                fontWeight: 700,
                color: "#c9a24a",
                margin: "0 0 8px",
              }}
            >
              {statusCode}
            </p>
          )}
          <h1
            style={{
              fontFamily: "'Cormorant Garamond',Georgia,serif",
              fontVariant: "small-caps",
              fontSize: 24,
              fontWeight: 600,
              color: "#3a2416",
              margin: "0 0 10px",
              letterSpacing: "0.14em",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontFamily: "Inter,system-ui,sans-serif",
              fontSize: 14,
              color: "rgba(26,22,18,0.65)",
              margin: "0 0 24px",
              maxWidth: 320,
            }}
          >
            {message}
          </p>
          <a href="/" className="btn-primary" style={{ textDecoration: "none" }}>
            New Scoreboard
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
