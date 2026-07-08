import { describe, it, expect, vi } from "vitest";
import { buildWebhookHandler } from "../webhook-handler.js";

const SECRET = "correct-secret-token";

function makeReq(headers: Record<string, string | undefined>) {
  return { headers } as any;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(chunk?: string) {
      this.body = chunk ?? "";
    },
  };
}

describe("webhook handler (ADR-0002/decision-6, AC-04/AC-04b)", () => {
  it("rejects a missing secret token — 401, router never invoked", async () => {
    const router = { handleUpdate: vi.fn().mockResolvedValue(undefined) };
    const handler = buildWebhookHandler(router, SECRET);
    const req = makeReq({});
    const res = makeRes();

    await handler(req, res as any, Buffer.from("{}"));

    expect(res.statusCode).toBe(401);
    expect(router.handleUpdate).not.toHaveBeenCalled();
    const parsed = JSON.parse(res.body);
    expect(parsed.code).toBe("webhook.invalid_secret_token");
  });

  it("rejects an invalid secret token — 401, router never invoked", async () => {
    const router = { handleUpdate: vi.fn().mockResolvedValue(undefined) };
    const handler = buildWebhookHandler(router, SECRET);
    const req = makeReq({ "x-telegram-bot-api-secret-token": "wrong-token" });
    const res = makeRes();

    await handler(req, res as any, Buffer.from("{}"));

    expect(res.statusCode).toBe(401);
    expect(router.handleUpdate).not.toHaveBeenCalled();
  });

  it("forwards a valid request to the router and returns 200 Ack", async () => {
    const router = { handleUpdate: vi.fn().mockResolvedValue(undefined) };
    const handler = buildWebhookHandler(router, SECRET);
    const update = { update_id: 1, message: { text: "hi" } };
    const req = makeReq({ "x-telegram-bot-api-secret-token": SECRET });
    const res = makeRes();

    await handler(req, res as any, Buffer.from(JSON.stringify(update)));

    expect(res.statusCode).toBe(200);
    expect(router.handleUpdate).toHaveBeenCalledTimes(1);
    expect(router.handleUpdate).toHaveBeenCalledWith(update);
    expect(JSON.parse(res.body)).toEqual({});
  });

  it("returns 200 even when the router silently no-ops for a non-Owner sender (AC-04b)", async () => {
    const router = { handleUpdate: vi.fn().mockResolvedValue(undefined) };
    const handler = buildWebhookHandler(router, SECRET);
    const req = makeReq({ "x-telegram-bot-api-secret-token": SECRET });
    const res = makeRes();

    await handler(req, res as any, Buffer.from(JSON.stringify({ update_id: 2 })));

    expect(res.statusCode).toBe(200);
  });
});
