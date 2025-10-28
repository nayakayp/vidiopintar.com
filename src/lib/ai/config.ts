import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env/server";

export const googleAI = createGoogleGenerativeAI({
  baseURL: env.GOOGLE_GENERATIVE_AI_BASE_URL,
  apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// Model configurations
export const AI_MODELS = {
  // Low-end model for general use
  lite: "gemini-2.5-flash",
  // High-end model for complex tasks
  pro: "gemini-2.5-pro",
} as const;

export type AIModelType = keyof typeof AI_MODELS;

