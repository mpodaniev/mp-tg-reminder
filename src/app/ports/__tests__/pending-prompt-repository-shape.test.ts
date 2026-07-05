import { describe, it, expect } from "vitest";
import type { PendingPromptRepository, PendingPromptRow } from "../pending-prompt-repository.js";
import { PENDING_PROMPT_REPOSITORY_METHODS } from "../pending-prompt-repository.js";

describe("PendingPromptRepository port shape", () => {
  it("declares the three durable pending-prompt methods (AC-05)", () => {
    expect(PENDING_PROMPT_REPOSITORY_METHODS).toEqual([
      "savePendingPrompt",
      "findPendingPrompt",
      "clearPendingPrompt",
    ]);
  });

  it("type-checks a repository implementing the port", () => {
    const repo: PendingPromptRepository = {
      savePendingPrompt: async (_row: PendingPromptRow) => {},
      findPendingPrompt: async () => null,
      clearPendingPrompt: async () => {},
    };

    expect(typeof repo.savePendingPrompt).toBe("function");
    expect(typeof repo.findPendingPrompt).toBe("function");
    expect(typeof repo.clearPendingPrompt).toBe("function");
  });
});
