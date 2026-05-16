import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "mocked API response" }],
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

import { queryAnthropicApi, clearConversation } from "../api-backend.js";

describe("api-backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearConversation("test-session");
  });

  it("throws if no API key is available", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    await expect(queryAnthropicApi("hello", "test-session", undefined)).rejects.toThrow(
      "ANTHROPIC_API_KEY is required",
    );

    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns response with correct format when API key provided", async () => {
    const result = await queryAnthropicApi("hello", "test-session", "sk-test-key");
    expect(result).toHaveProperty("response");
    expect(result).toHaveProperty("sessionId", "test-session");
    expect(typeof result.response).toBe("string");
  });

  it("maintains conversation history across calls", async () => {
    const result1 = await queryAnthropicApi("first message", "session-a", "sk-test-key");
    expect(result1.sessionId).toBe("session-a");

    const result2 = await queryAnthropicApi("second message", "session-a", "sk-test-key");
    expect(result2.sessionId).toBe("session-a");
  });
});
