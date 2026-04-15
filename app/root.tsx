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
    <html lang="en" className="dark bg-gray-950">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error — Scoreboard</title>
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4">
        {statusCode && (
          <p className="text-amber-400 text-6xl font-bold mb-2">{statusCode}</p>
        )}
        <h1 className="text-2xl font-semibold mb-3">{title}</h1>
        <p className="text-white/60 mb-6 text-center max-w-sm">{message}</p>
        <a
          href="/"
          className="bg-amber-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-amber-500 transition-colors"
        >
          New Scoreboard
        </a>
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <html lang="en" className="dark bg-gray-950">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-gray-950 text-white">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
