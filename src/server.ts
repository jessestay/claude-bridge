import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { queryClaudeP } from "./claude-p-backend.js";
import { queryAnthropicApi, queryAnthropicApiRaw } from "./api-backend.js";

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  response: string;
  backend: "claude-p" | "api";
  sessionId: string;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      backends: ["claude-p", "api"],
    });
  });

  // Anthropic-compatible /v1/messages endpoint
  // Accepts the same payload as https://api.anthropic.com/v1/messages
  // Tries claude -p first (flattening system+messages into a single prompt),
  // then falls back to the real Anthropic API.
  app.post("/v1/messages", async (req: Request, res: Response) => {
    const body = req.body;

    if (!body || !body.messages || !Array.isArray(body.messages)) {
      res.status(400).json({
        type: "error",
        error: { type: "invalid_request_error", message: "messages array is required" },
      });
      return;
    }

    const sessionId = uuidv4();

    // Extract API key from request headers (n8n workflows send x-api-key header)
    const incomingApiKey =
      (req.headers["x-api-key"] as string) ||
      (req.headers["authorization"] as string)?.replace(/^Bearer\s+/i, "") ||
      undefined;

    // Build a flattened prompt for claude -p from system + messages
    const systemPrompt = typeof body.system === "string" ? body.system : "";
    const userMessages = body.messages
      .filter((m: { role: string; content: string }) => m.role === "user")
      .map((m: { role: string; content: string }) => m.content)
      .join("\n\n");
    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\n---\n\n${userMessages}`
      : userMessages;

    // Try claude -p first
    try {
      const result = await queryClaudeP(fullPrompt, sessionId);
      // Return in Anthropic API response format
      res.json({
        id: `msg_${sessionId.replace(/-/g, "").slice(0, 24)}`,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: result.response }],
        model: body.model || "claude-sonnet-4-6",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
        _backend: "claude-p",
      });
      return;
    } catch (err) {
      console.warn(
        `[claude-bridge] /v1/messages: claude -p failed, falling back to API: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Fallback: forward the raw request to Anthropic API
    try {
      const apiResponse = await queryAnthropicApiRaw(body, incomingApiKey);
      res.json({ ...apiResponse, _backend: "api" });
      return;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[claude-bridge] /v1/messages: API fallback also failed: ${errorMsg}`);
      res.status(502).json({
        type: "error",
        error: { type: "api_error", message: `Both backends failed: ${errorMsg}` },
        _backend: "none",
      });
    }
  });

  // Simple chat endpoint
  app.post("/chat", async (req: Request, res: Response) => {
    const { message, sessionId: providedSessionId } = req.body as ChatRequest;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "message is required and must be a non-empty string" });
      return;
    }

    const sessionId = providedSessionId || uuidv4();

    // Try claude -p first
    try {
      const result = await queryClaudeP(message, sessionId);
      const response: ChatResponse = {
        response: result.response,
        backend: "claude-p",
        sessionId,
      };
      res.json(response);
      return;
    } catch (err) {
      console.warn(
        `[claude-bridge] claude -p failed, falling back to API: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Fallback to Anthropic API
    try {
      const result = await queryAnthropicApi(message, sessionId);
      const response: ChatResponse = {
        response: result.response,
        backend: "api",
        sessionId,
      };
      res.json(response);
      return;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[claude-bridge] API fallback also failed: ${errorMsg}`);
      res.status(502).json({
        error: "Both backends failed",
        details: errorMsg,
      });
    }
  });

  return app;
}
