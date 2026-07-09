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

  // Unauthenticated liveness probe. It sits before the auth-gated POST
  // handlers so a platform health check (fly.toml) can tell a booted,
  // serving process from a crash-looped one — a non-serving deploy then
  // fails loudly instead of reporting success. Cheap and side-effect free,
  // so it does not pin a scale-to-zero machine awake.
  if (method === "GET" && path === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain");
    res.end("ok");
    return;
  }

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
      respondPayloadTooLarge(req, res);
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
        respondPayloadTooLarge(req, res);
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

// Node's server-level requestTimeout only guards the time before the
// `request` event is dispatched — once handleRequest is running, it no
// longer applies, so a client that stalls mid-upload must be bounded here.
const DRAIN_TIMEOUT_MS = 5000;

function respondPayloadTooLarge(req: IncomingMessage, res: ServerResponse): void {
  res.statusCode = 413;
  res.setHeader("content-type", "application/json");
  res.setHeader("connection", "close");
  const body = JSON.stringify({ code: "http.payload_too_large", message: "Request body exceeds limit" });

  // Respond only once the client has finished (or aborted) its upload, or
  // the drain timeout elapses: closing the socket while the client is still
  // mid-write races the write and surfaces as a client-side
  // EPIPE/ECONNRESET, even for a legitimate caller that simply sent a body
  // over the cap. `resume()` drains and discards the remaining bytes
  // without buffering them, so waiting adds no memory cost. A client that
  // stalls past the timeout gets its connection destroyed outright — by
  // then it is indistinguishable from a hostile slow-loris, so an abrupt
  // reset is an acceptable outcome.
  let responded = false;
  const finish = (forceDestroy: boolean): void => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    req.removeListener("end", onFinish);
    req.removeListener("close", onFinish);
    req.removeListener("error", onFinish);
    if (forceDestroy) {
      res.end(body, () => req.destroy());
    } else {
      res.end(body);
    }
  };
  const onFinish = (): void => finish(false);
  const timer = setTimeout(() => finish(true), DRAIN_TIMEOUT_MS);
  req.once("end", onFinish);
  req.once("close", onFinish);
  req.once("error", onFinish);
  req.resume();
}
