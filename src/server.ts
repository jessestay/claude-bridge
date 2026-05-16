import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { queryClaudeP } from "./claude-p-backend.js";
import { queryAnthropicApi } from "./api-backend.js";

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
  app.use(express.json());

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      backends: ["claude-p", "api"],
    });
  });

  // Chat endpoint
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
