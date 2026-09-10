/**
 * Config handling. Precedence: CLI flags > env vars > ~/.commit-genie.json
 * Works with ANY OpenAI-compatible endpoint (Ollama, LM Studio, Groq,
 * OpenRouter, Together, vLLM, llama.cpp server…) — so it can stay free.
 */

import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULTS = {
  provider: "offline", // "offline" | "ollama" | "openai"
  model: "llama3.2",
  baseUrl: "http://localhost:11434", // ollama default; openai → https://api.openai.com
  locale: "en",
  maxSubjectLength: 65,
};

const CONFIG_FILE = join(homedir(), ".commit-genie.json");

export async function loadConfig(overrides = {}) {
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    /* no config file yet — fine */
  }

  const cfg = {
    ...DEFAULTS,
    ...fileCfg,
    provider: process.env.COMMIT_GENIE_PROVIDER || undefined,
    model: process.env.COMMIT_GENIE_MODEL || undefined,
    baseUrl: process.env.COMMIT_GENIE_BASE_URL || undefined,
    apiKey: process.env.COMMIT_GENIE_API_KEY || process.env.OPENAI_API_KEY || undefined,
    locale: process.env.COMMIT_GENIE_LOCALE || undefined,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  };

  // env vars can be present but empty strings — fall back sanely
  for (const key of ["provider", "model", "baseUrl", "locale"]) {
    if (cfg[key] === undefined) cfg[key] = DEFAULTS[key];
  }
  return cfg;
}

export async function saveConfig(partial) {
  let current = {};
  try {
    current = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    /* ignore */
  }
  const next = { ...current, ...partial };
  await writeFile(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function configPath() {
  return CONFIG_FILE;
}
