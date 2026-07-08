import { describe, it, expect, vi } from "vitest";
import { buildWakeHandler } from "../wake-handler.js";

const TOKEN = "correct-wake-token";

function makeReq(headers: Record<string, string | undefined>) {
  return { headers } as any;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    ended: false,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(chunk?: string) {
      this.body = chunk ?? "";
      this.ended = true;
    },
  };
}

describe("wake handler (AC-01/AC-01b/AC-04)", () => {
  it("rejects a missing bearer token — 401, tick() never invoked", async () => {
    const scheduler = { tick: vi.fn().mockResolvedValue(undefined) };
    const handler = buildWakeHandler(scheduler, TOKEN);
    const req = makeReq({});
    const res = makeRes();

    await handler(req, res as any, Buffer.alloc(0));

    expect(res.statusCode).toBe(401);
    expect(scheduler.tick).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).code).toBe("wake.invalid_token");
  });

  it("rejects an invalid bearer token — 401, tick() never invoked", async () => {
    const scheduler = { tick: vi.fn().mockResolvedValue(undefined) };
    const handler = buildWakeHandler(scheduler, TOKEN);
    const req = makeReq({ authorization: "Bearer wrong-token" });
    const res = makeRes();

    await handler(req, res as any, Buffer.alloc(0));

    expect(res.statusCode).toBe(401);
    expect(scheduler.tick).not.toHaveBeenCalled();
  });

  it("a valid request invokes tick() and returns 200 Ack", async () => {
    const scheduler = { tick: vi.fn().mockResolvedValue(undefined) };
    const handler = buildWakeHandler(scheduler, TOKEN);
    const req = makeReq({ authorization: `Bearer ${TOKEN}` });
    const res = makeRes();

    await handler(req, res as any, Buffer.alloc(0));

    expect(scheduler.tick).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({});
  });

  it("the response is not sent until tick() resolves (AC-01b)", async () => {
    let releaseTick: () => void = () => {};
    const tickGate = new Promise<void>((resolve) => {
      releaseTick = resolve;
    });
    const scheduler = { tick: vi.fn().mockReturnValue(tickGate) };
    const handler = buildWakeHandler(scheduler, TOKEN);
    const req = makeReq({ authorization: `Bearer ${TOKEN}` });
    const res = makeRes();

    const handlerPromise = handler(req, res as any, Buffer.alloc(0));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(res.ended).toBe(false);

    releaseTick();
    await handlerPromise;

    expect(res.ended).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});
