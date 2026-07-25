import { createOpenAI } from "@ai-sdk/openai";

/** Shared OpenAI client — uses OPENAI_API_KEY or AI_GATEWAY_API_KEY. */
export function getOpenAI() {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;
  return createOpenAI({ apiKey });
}

export function hasAIKey() {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() || process.env.AI_GATEWAY_API_KEY?.trim()
  );
}

export const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
export const DEFAULT_VISION_MODEL = "gpt-4o";
