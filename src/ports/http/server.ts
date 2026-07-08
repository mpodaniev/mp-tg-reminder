import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

export type HttpHandler = (req: IncomingMessage, res: ServerResponse, body: Buffer) => Promise<void>;

export interface HttpRoutes {
  webhook: HttpHandler;
  wake: HttpHandler;
}

export function buildHttpServer(routes: HttpRoutes): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, routes);
  });
}

// Telegram updates are a few KB; anything near this cap is not a legitimate
// caller. The cap is enforced before auth, because auth lives inside the
// handlers and would otherwise run only after the whole body is buffered.
const MAX_BODY_BYTES = 1024 * 1024;

async function handleRequest(req: IncomingMessage, res: ServerResponse, routes: HttpRoutes): Promise<void> {
  const method = req.method ?? "";
  const path = (req.url ?? "").split("?")[0];

  const handler =
    method === "POST" && path === "/webhook/telegram"
      ? routes.webhook
      : method === "POST" && path === "/wake"
        ? routes.wake
        : null;

  if (!handler) {
    res.statusCode = 404;
    res.end();
    return;
  }

  // Error boundary: any unexpected throw from body reading or the handler
  // (e.g. a DB error inside scheduler.tick(), or grammy rejecting a malformed
  // update) must still close the connection with a 500 rather than leaving the
  // caller hanging to timeout and the rejection swallowed by the `void` above.
  try {
    const declared = parseInt(String(req.headers["content-length"] ?? ""), 10);
    if (!Number.isNaN(declared) && declared > MAX_BODY_BYTES) {
      respondPayloadTooLarge(res);
      return;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      received += (chunk as Buffer).length;
      if (received > MAX_BODY_BYTES) {
        // Chunked transfer without a content-length header: stop buffering as
        // soon as the cap is crossed. The malicious client may observe a
        // connection error instead of the 413 body — that is acceptable.
        respondPayloadTooLarge(res);
        req.destroy();
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);

    await handler(req, res, body);
  } catch (err) {
    console.error({ module: "http", event: "handler_error", path, error: String(err) });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ code: "http.internal_error", message: "Internal error" }));
    } else {
      res.end();
    }
  }
}

function respondPayloadTooLarge(res: ServerResponse): void {
  res.statusCode = 413;
  res.setHeader("content-type", "application/json");
  res.setHeader("connection", "close");
  res.end(JSON.stringify({ code: "http.payload_too_large", message: "Request body exceeds limit" }));
}
