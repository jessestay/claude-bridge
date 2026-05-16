import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock the backends
vi.mock("../claude-p-backend.js", () => ({
  queryClaudeP: vi.fn(),
}));

vi.mock("../api-backend.js", () => ({
  queryAnthropicApi: vi.fn(),
}));

// Import after mocking
import { createApp } from "../server.js";
import { queryClaudeP } from "../claude-p-backend.js";
import { queryAnthropicApi } from "../api-backend.js";

const mockedClaudeP = vi.mocked(queryClaudeP);
const mockedApi = vi.mocked(queryAnthropicApi);

describe("server", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("GET /health", () => {
    it("returns status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.backends).toContain("claude-p");
      expect(res.body.backends).toContain("api");
    });
  });

  describe("POST /chat", () => {
    it("returns 400 if message is missing", async () => {
      const res = await request(app).post("/chat").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("message is required");
    });

    it("returns 400 if message is empty string", async () => {
      const res = await request(app).post("/chat").send({ message: "   " });
      expect(res.status).toBe(400);
    });

    it("uses claude-p backend when available", async () => {
      mockedClaudeP.mockResolvedValue({
        response: "Hello from claude-p",
        sessionId: "test-session",
      });

      const res = await request(app).post("/chat").send({ message: "hi" });
      expect(res.status).toBe(200);
      expect(res.body.backend).toBe("claude-p");
      expect(res.body.response).toBe("Hello from claude-p");
      expect(res.body.sessionId).toBeDefined();
    });

    it("falls back to API when claude-p fails", async () => {
      mockedClaudeP.mockRejectedValue(new Error("timeout"));
      mockedApi.mockResolvedValue({
        response: "Hello from API",
        sessionId: "test-session",
      });

      const res = await request(app).post("/chat").send({ message: "hi" });
      expect(res.status).toBe(200);
      expect(res.body.backend).toBe("api");
      expect(res.body.response).toBe("Hello from API");
    });

    it("returns 502 when both backends fail", async () => {
      mockedClaudeP.mockRejectedValue(new Error("timeout"));
      mockedApi.mockRejectedValue(new Error("no API key"));

      const res = await request(app).post("/chat").send({ message: "hi" });
      expect(res.status).toBe(502);
      expect(res.body.error).toBe("Both backends failed");
    });

    it("uses provided sessionId", async () => {
      mockedClaudeP.mockResolvedValue({
        response: "ok",
        sessionId: "my-session-123",
      });

      const res = await request(app)
        .post("/chat")
        .send({ message: "hi", sessionId: "my-session-123" });
      expect(res.body.sessionId).toBe("my-session-123");
    });

    it("generates sessionId if not provided", async () => {
      mockedClaudeP.mockResolvedValue({
        response: "ok",
        sessionId: "generated",
      });

      const res = await request(app).post("/chat").send({ message: "hi" });
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.sessionId.length).toBeGreaterThan(0);
    });
  });
});
