import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export const CLAUDE_MODEL = "claude-sonnet-4-5";

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Extracts the concatenated text blocks from a Claude response. */
export function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
