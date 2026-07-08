import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "net";
import { buildHttpServer } from "../server.js";

describe("buildHttpServer (ADR-0002, AC-04)", () => {
  let server: ReturnType<typeof buildHttpServer>;
  let baseUrl: string;
  let webhookHandler: ReturnType<typeof vi.fn>;
  let wakeHandler: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    webhookHandler = vi.fn(async (_req: any, res: any) => {
      res.statusCode = 200;
      res.end("{}");
    });
    wakeHandler = vi.fn(async (_req: any, res: any) => {
      res.statusCode = 200;
      res.end("{}");
    });
    server = buildHttpServer({ webhook: webhookHandler, wake: wakeHandler });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("routes POST /webhook/telegram to the webhook handler", async () => {
    const res = await fetch(`${baseUrl}/webhook/telegram`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(webhookHandler).toHaveBeenCalledTimes(1);
    expect(wakeHandler).not.toHaveBeenCalled();
  });

  it("routes POST /wake to the wake handler", async () => {
    const res = await fetch(`${baseUrl}/wake`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(wakeHandler).toHaveBeenCalledTimes(1);
    expect(webhookHandler).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown path with no handler invoked", async () => {
    const res = await fetch(`${baseUrl}/unknown`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(webhookHandler).not.toHaveBeenCalled();
    expect(wakeHandler).not.toHaveBeenCalled();
  });

  it("returns 404 for the wrong method on a known path (GET /webhook/telegram)", async () => {
    const res = await fetch(`${baseUrl}/webhook/telegram`, { method: "GET" });
    expect(res.status).toBe(404);
    expect(webhookHandler).not.toHaveBeenCalled();
  });

  it("returns 500 and closes the connection when a handler throws (NFR §6 processing success)", async () => {
    const errorConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    wakeHandler.mockImplementationOnce(async () => {
      throw new Error("tick blew up");
    });

    const res = await fetch(`${baseUrl}/wake`, { method: "POST" });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ code: "http.internal_error", message: "Internal error" });
    errorConsole.mockRestore();
  });

  it("returns 413 for a body over 1 MiB without invoking the handler", async () => {
    const big = Buffer.alloc(1024 * 1024 + 1, 0x61);
    const res = await fetch(`${baseUrl}/webhook/telegram`, { method: "POST", body: big });
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      code: "http.payload_too_large",
      message: "Request body exceeds limit",
    });
    expect(webhookHandler).not.toHaveBeenCalled();
  });

  it("still accepts a body just under the limit", async () => {
    const ok = Buffer.alloc(1024, 0x61);
    const res = await fetch(`${baseUrl}/webhook/telegram`, { method: "POST", body: ok });
    expect(res.status).toBe(200);
    expect(webhookHandler).toHaveBeenCalledTimes(1);
  });
});
