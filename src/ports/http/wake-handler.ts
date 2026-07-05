import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpHandler } from "./server.js";

export interface SchedulerLike {
  tick(): Promise<void>;
}

const BEARER_PREFIX = "Bearer ";

export function buildWakeHandler(scheduler: SchedulerLike, bearerToken: string): HttpHandler {
  return async (req: IncomingMessage, res: ServerResponse, _body: Buffer): Promise<void> => {
    const authHeader = req.headers["authorization"];
    const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const provided = authValue?.startsWith(BEARER_PREFIX) ? authValue.slice(BEARER_PREFIX.length) : undefined;

    if (!isValidToken(provided, bearerToken)) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          code: "wake.invalid_token",
          message: "Authorization bearer token missing or invalid",
        })
      );
      return;
    }

    // The response is only sent once tick() fully resolves (AC-01b) — the
    // machine is only allowed to idle again once this call completes.
    await scheduler.tick();

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
