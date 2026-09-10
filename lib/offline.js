/**
 * Offline commit-message engine.
 * No API, no network — classifies the staged diff into a Conventional Commit.
 * This is what makes commit-genie work 100% free out of the box.
 */

const TYPE_RULES = [
  { type: "test", test: /(^|\/)(tests?|__tests__|spec)\//i, verbs: ["add", "update", "fix"] },
  { type: "docs", test: /(^|\/)(docs?|changelog|license|authors|contributing)/i, verbs: ["update", "add"] },
  { type: "ci", test: /(^|\/)\.github\/workflows\//i, verbs: ["update", "add"] },
  { type: "chore", test: /(^|\/)(\.gitignore|\.editorconfig|\.prettierrc|\.eslintrc|renovate)/i, verbs: ["update", "add"] },
  { type: "refactor", test: /(^|\/)(styles?|assets?|public)\//i, verbs: ["update", "refactor"] },
];

const DEP_FILES = ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "requirements.txt", "go.mod", "Cargo.toml"];

/** Categorize one changed file path. */
export function classifyFile(path, patchHeader = "") {
  const lower = path.toLowerCase();

  if (DEP_FILES.some((f) => lower === f || lower.endsWith("/" + f))) {
    return "chore(deps)";
  }
  for (const rule of TYPE_RULES) {
    if (rule.test.test(lower)) return rule.type;
  }
  // New file → feat; deleted file → remove; else look at hunk content
  if (/^\+\+\+ b\//.test(patchHeader) && /new file mode/.test(patchHeader)) return "feat";
  if (/deleted file mode/.test(patchHeader)) return "refactor";
  return "feat";
}

/** Extract the most "meaningful" identifiers from added/removed lines. */
export function extractTopics(diff, max = 3) {
  const stops = new Set([
    "const","let","var","function","return","import","export","from","class","new","if","else","for","while","try","catch","async","await","this","self","def","public","private","static","void","int","string","bool","true","false","null","none","undefined","throw","case","switch","default","interface","type","struct","impl","fn","pub","use","mod","package","end","do","then","require","extends","implements","static","super","typeof","instanceof","delete","yield","in","of","not","and","or","is","it","the","a","an","to","with","add","added","update","updated","fix","fixed","change","changed",
  ]);
  const scores = new Map();

  for (const line of diff.split("\n")) {
    if (!/^[+-]/.test(line) || /^\+\+\+|^---/.test(line)) continue;
    const words = line.slice(1).match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || [];
    for (const raw of words) {
      const w = raw.toLowerCase();
      if (stops.has(w) || w.length > 24) continue;
      // camelCase / snake_case get a boost — they're usually identifiers
      const boost = /[a-z][A-Z]/.test(raw) || raw.includes("_") ? 2 : 1;
      // lines starting with +/- (actual changes) vs context noise
      scores.set(w, (scores.get(w) || 0) + boost);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function summarizeSubject(text, maxLen = 65) {
  let s = text.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/\s\S*$/, "") + "…";
  return s;
}

/** Build a conventional commit message from a diff — no network required. */
export function offlineMessage(diff, files, { scope } = {}) {
  if (files.length === 0) return null;

  // Group files by type
  const types = new Map();
  for (const f of files) {
    const t = classifyFile(f);
    if (!types.has(t)) types.set(t, []);
    types.get(t).push(f);
  }

  // Dominant type = most files, with feat/fix winning ties
  let dominant = "feat";
  let best = -1;
  for (const [t, fs] of types) {
    const weight = fs.length + (t === "feat" || t === "fix" ? 1 : 0);
    if (weight > best) {
      best = weight;
      dominant = t;
    }
  }

  const topics = extractTopics(diff);
  const fileCount = files.length;

  let subject;
  if (topics.length >= 2) {
    subject = summarizeSubject(`update ${topics[0]} and ${topics[1]}`);
  } else if (topics.length === 1) {
    subject = summarizeSubject(`update ${topics[0]}`);
  } else if (fileCount === 1) {
    const base = files[0].split("/").pop().replace(/\.[^.]+$/, "");
    subject = summarizeSubject(`update ${base}`);
  } else {
    subject = `update ${fileCount} files`;
  }

  const isDeps = dominant === "chore(deps)";
  if (isDeps) {
    subject = "update dependencies";
    dominant = "chore";
  }

  const scopePart = scope ? `(${scope})` : isDeps ? "(deps)" : "";
  const type = dominant.replace("(deps)", "");

  const bodyFiles =
    fileCount > 1 ? `\n\nAffected files:\n${files.slice(0, 8).map((f) => `- ${f}`).join("\n")}${fileCount > 8 ? `\n- … and ${fileCount - 8} more` : ""}` : "";

  return `${type}${scopePart}: ${subject}${bodyFiles}`;
}

/** Generate `count` ranked alternatives (used by --count with --offline). */
export function offlineMessages(diff, files, count, opts) {
  const main = offlineMessage(diff, files, opts);
  if (!main) return [];
  const msgs = [main];

  if (count > 1) {
    const topics = extractTopics(diff, 6);
    const [type, rest] = main.split(": ");
    const scope = opts.scope;
    for (let i = 0; msgs.length < count && i < topics.length; i += 2) {
      const t1 = topics[i];
      const t2 = topics[i + 1];
      if (!t1) break;
      const subject = t2 ? `tweak ${t1} and ${t2}` : `tweak ${t1}`;
      msgs.push(`${type}${scope ? `(${scope})` : ""}: ${subject}`);
    }
  }
  return msgs;
}
