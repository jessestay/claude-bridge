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
