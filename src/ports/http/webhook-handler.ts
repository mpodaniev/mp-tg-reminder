import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpHandler } from "./server.js";

export interface RouterLike {
  handleUpdate(update: unknown): Promise<void>;
}

export function buildWebhookHandler(router: RouterLike, secretToken: string): HttpHandler {
  return async (req: IncomingMessage, res: ServerResponse, body: Buffer): Promise<void> => {
    const provided = req.headers["x-telegram-bot-api-secret-token"];
    const providedValue = Array.isArray(provided) ? provided[0] : provided;

    if (!isValidToken(providedValue, secretToken)) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          code: "webhook.invalid_secret_token",
          message: "X-Telegram-Bot-Api-Secret-Token missing or invalid",
        })
      );
      return;
    }

    let update: unknown;
    try {
      update = JSON.parse(body.toString("utf-8"));
    } catch {
      update = {};
    }

    // The Owner-authorization gate (ADR-0003) runs inside the router; a
    // verified-Telegram-but-not-Owner sender still gets 200 (AC-04b) — Telegram's
    // retry semantics expect an ack regardless of the internal auth outcome.
    await router.handleUpdate(update);

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end("{}");
  };
}

function isValidToken(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
