import Anthropic from "@anthropic-ai/sdk";

export interface ApiResponse {
  response: string;
  sessionId: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

const conversations = new Map<string, ConversationMessage[]>();

export function getConversationHistory(sessionId: string): ConversationMessage[] {
  return conversations.get(sessionId) || [];
}

export function clearConversation(sessionId: string): void {
  conversations.delete(sessionId);
}

export async function queryAnthropicApi(
  message: string,
  sessionId: string,
  apiKey?: string,
): Promise<ApiResponse> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is required for API fallback");
  }

  const client = new Anthropic({ apiKey: key });

  // Get or create conversation history
  const history = conversations.get(sessionId) || [];
  history.push({ role: "user", content: message });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: history,
  });

  const assistantMessage =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Store assistant response in history
  history.push({ role: "assistant", content: assistantMessage });
  conversations.set(sessionId, history);

  return { response: assistantMessage, sessionId };
}

/**
 * Forward a raw Anthropic API request body to the Anthropic API.
 * Used by the /v1/messages proxy endpoint to pass through the exact
 * payload that n8n workflows already send to api.anthropic.com.
 */
export async function queryAnthropicApiRaw(
  body: Record<string, unknown>,
  apiKey?: string,
): Promise<Record<string, unknown>> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is required for API fallback");
  }

  const client = new Anthropic({ apiKey: key });

  const params: Anthropic.MessageCreateParams = {
    model: (body.model as string) || "claude-sonnet-4-20250514",
    max_tokens: (body.max_tokens as number) || 4096,
    messages: body.messages as Anthropic.MessageParam[],
  };

  if (body.system) {
    params.system = body.system as string;
  }
  if (body.temperature !== undefined) {
    params.temperature = body.temperature as number;
  }
  if (body.top_p !== undefined) {
    params.top_p = body.top_p as number;
  }
  if (body.stop_sequences) {
    params.stop_sequences = body.stop_sequences as string[];
  }

  const response = await client.messages.create(params);

  // Return the full Anthropic response object
  return response as unknown as Record<string, unknown>;
}
