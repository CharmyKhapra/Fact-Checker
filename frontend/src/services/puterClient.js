import puter from "@heyputer/puter.js";

/**
 * Optional Puter.js integration for FactLens.
 * This does NOT replace the existing Gemini verification pipeline.
 * Use these helpers from React components when you want browser-side Puter AI.
 */
export async function puterChat(prompt, options = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error("Puter prompt cannot be empty.");
  }

  return puter.ai.chat(String(prompt), options);
}

export async function puterListModels() {
  return puter.ai.listModels();
}

export function puterClient() {
  return puter;
}
