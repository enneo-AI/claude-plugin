import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

export interface LoopbackResult {
  code: string;
  state: string;
}

/**
 * Start a one-shot loopback HTTP server that waits for the OAuth callback.
 * Returns the redirect URI (with the chosen port) and a promise that resolves
 * with the received `code` and `state` (or rejects on error).
 */
export async function startLoopback(timeoutMs = 5 * 60 * 1000): Promise<{
  redirectUri: string;
  done: Promise<LoopbackResult>;
}> {
  let resolveResult: (r: LoopbackResult) => void;
  let rejectResult: (err: Error) => void;
  const resultPromise = new Promise<LoopbackResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) return;
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }

    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (error) {
      respondPage(res, `Authorization failed: ${error}`);
      rejectResult(new Error(`Authorization error: ${error} — ${url.searchParams.get("error_description") ?? ""}`));
    } else if (code && state) {
      respondPage(res, "Authorized. You can close this tab and return to Claude.");
      resolveResult({ code, state });
    } else {
      respondPage(res, "Invalid callback.");
      rejectResult(new Error("Callback missing code or state"));
    }

    // Close shortly after responding.
    setTimeout(() => server.close(), 100);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Port 0 → OS picks a free port.
    server.listen(0, "127.0.0.1", resolve);
  });

  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const timeout = setTimeout(() => {
    server.close();
    rejectResult(new Error(`OAuth timeout — no callback received within ${timeoutMs}ms`));
  }, timeoutMs);
  resultPromise.finally(() => clearTimeout(timeout)).catch(() => {});

  return { redirectUri, done: resultPromise };
}

function respondPage(res: ServerResponse, message: string): void {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Enneo</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:8em auto;padding:2em;text-align:center}</style>
</head><body><h1>${message}</h1></body></html>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
