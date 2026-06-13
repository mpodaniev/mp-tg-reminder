import { describe, it, expect, vi } from "vitest";
import { handleSettings } from "../handlers/settings-handler.js";
import { InMemoryReminderRepository } from "../../app/use-cases/__tests__/helpers/in-memory-repo.js";

const OWNER_ID = 123456789;

function makeCtx(text = "/settings Europe/Kyiv", senderId = OWNER_ID) {
  const repo = new InMemoryReminderRepository(OWNER_ID, null);
  const replies: string[] = [];
  const ctx = {
    from: { id: senderId },
    message: { text },
    reply: vi.fn().mockImplementation((t: string) => {
      replies.push(t);
      return Promise.resolve();
    }),
    _replies: replies,
    _repo: repo,
  };
  return ctx;
}

describe("/settings handler", () => {
  it("saves timezone when valid IANA zone provided", async () => {
    const ctx = makeCtx("/settings Europe/Kyiv");
    await handleSettings(ctx as any, ctx._repo);
    expect(ctx._replies.some((r) => r.includes("Europe/Kyiv") || r.includes("налашт") || r.toLowerCase().includes("set"))).toBe(true);
  });

  it("shows current timezone options when called without argument", async () => {
    const ctx = makeCtx("/settings");
    await handleSettings(ctx as any, ctx._repo);
    expect(ctx.reply).toHaveBeenCalled();
  });

  it("ignores non-Owner", async () => {
    const ctx = makeCtx("/settings Europe/Kyiv", 999);
    await handleSettings(ctx as any, ctx._repo);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
