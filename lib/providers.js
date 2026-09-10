/**
 * LLM providers. Every provider speaks plain HTTP via global fetch —
 * zero dependencies, works with Ollama (free/local) or any
 * OpenAI-compatible API.
 */

const SYSTEM_PROMPT = `You are a commit message generator. You write concise, professional git commit messages following the Conventional Commits specification (feat, fix, docs, style, refactor, perf, test, build, ci, chore).

Rules:
- Format: <type>(<optional scope>): <subject>
- Subject: imperative mood, lowercase start, no period, max {maxLen} characters
- Optionally one short body paragraph explaining WHY, separated by a blank line
- Reply with the commit message ONLY. No quotes, no code fences, no explanation.`;

export function buildPrompt(diff, files, cfg, recent = []) {
  const recentBlock = recent.length
    ? `\nRecent commit subjects for style reference (match their tone):\n${recent.map((s) => "- " + s).join("\n")}\n`
    : "";

  return {
    system: SYSTEM_PROMPT.replace("{maxLen}", String(cfg.maxSubjectLength)),
    user: `Write 1 commit message for this staged change.${recentBlock}
Changed files:
${files.slice(0, 20).map((f) => "- " + f).join("\n")}

Diff:
\`\`\`diff
${diff}
\`\`\``,
  };
}

export function cleanResponse(text) {
  return String(text)
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    // drop leading lines that look like chatter ("Here is the commit message:")
    .filter((l, i, arr) => !(i === 0 && arr.length > 1 && /^(here|sure|certainly|this commit)/i.test(l)))
    .join("\n")
    .trim();
}

/**
 * Parse and validate the configured endpoint. Returns a URL object whose
 * protocol has been verified to be http/https — the only acceptable schemes
 * for an LLM API endpoint. Everything else (file:, ftp:, …) is a misconfig.
 */
export function toEndpointUrl(baseUrl, path) {
  let endpoint;
  try {
    endpoint = new URL(baseUrl.replace(/\/$/, "") + path);
  } catch {
    throw new Error(`Invalid baseUrl "${baseUrl}" — must be a full URL, e.g. http://localhost:11434`);
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error(`Endpoint must use http: or https: (got "${endpoint.protocol}")`);
  }
  return endpoint;
}

/** Ollama native API (POST /api/generate). Free & local. */
export async function generateOllama(prompt, cfg, model = cfg.model) {
  const endpoint = toEndpointUrl(cfg.baseUrl, "/api/generate");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: `${prompt.system}\n\n${prompt.user}`,
      stream: false,
      options: { temperature: 0.3, num_predict: 200 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return cleanResponse(data.response);
}

/** Any OpenAI-compatible chat completions endpoint. */
export async function generateOpenAI(prompt, cfg, model = cfg.model) {
  if (!cfg.apiKey) {
    throw new Error(
      "No API key found. Set COMMIT_GENIE_API_KEY (or OPENAI_API_KEY), or switch to the free 'offline' or 'ollama' provider."
    );
  }
  const base = cfg.baseUrl.replace(/\/$/, "");
  const endpoint = toEndpointUrl(base, base.endsWith("/v1") ? "/chat/completions" : "/v1/chat/completions");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return cleanResponse(data.choices?.[0]?.message?.content);
}

/**
 * Dispatch to a provider. `selection.provider`/`selection.model` come from
 * allowlist-validated CLI flags; `cfg` carries env/file config only.
 */
export function generate(cfg, prompt, selection = {}) {
  const provider = selection.provider ?? cfg.provider;
  const model = selection.model ?? cfg.model;
  if (provider === "ollama") return generateOllama(prompt, cfg, model);
  if (provider === "openai") return generateOpenAI(prompt, cfg, model);
  throw new Error(`Unknown provider "${provider}". Use offline, ollama or openai.`);
}
