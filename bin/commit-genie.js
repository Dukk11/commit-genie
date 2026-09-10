#!/usr/bin/env node
/**
 * commit-genie — ✨ AI commit messages from your staged diff.
 * Free forever: offline heuristics by default, Ollama for local AI,
 * any OpenAI-compatible API if you want. Zero dependencies.
 */

import { loadConfig, saveConfig, configPath } from "../lib/config.js";
import { assertGitRepo, getDiff, stageAll, commit, recentCommits } from "../lib/git.js";
import { buildPrompt, generate } from "../lib/providers.js";
import { offlineMessages } from "../lib/offline.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";

const VERSION = "1.0.0";

// allowlist for the --provider flag: lookup always yields one of our own literals
const PROVIDER_ALIASES = { offline: "offline", ollama: "ollama", openai: "openai" };

const HELP = `
  ✨ commit-genie v${VERSION} — AI commit messages from your staged diff

  Usage
    $ commit-genie [options]

  Options
    -a, --all          Stage all changes first (git add -A)
    -c, --commit       Commit automatically with the generated message
    -n, --count <n>    Generate n candidates and pick one (default: 1)
    -s, --scope <s>    Force a commit scope, e.g. api, ui, auth
    -l, --locale <l>   Message language, e.g. en, de, es (default: en)
    -o, --offline      Force the free offline engine (no AI, no network)
    -d, --dry-run      Print the message, don't commit
        --provider <p> offline | ollama | openai (overrides config)
        --model <m>    Model name, e.g. llama3.2, qwen2.5-coder:7b
    -h, --help         Show this help
    -v, --version      Show version

  Config
    $ commit-genie config                     Show current config
    $ commit-genie config set provider ollama Use local Ollama (free AI)
    $ commit-genie config set model qwen2.5-coder:7b
    Config file: ${configPath()}

  Examples
    $ git add -A && commit-genie          # message for staged changes
    $ commit-genie -a -c                  # stage everything & commit
    $ commit-genie -n 3                   # pick from 3 candidates
    $ commit-genie -o                     # fully offline, zero cost
`;

function parseArgs(argv) {
  const args = {
    _: [],
    all: false, commit: false, dryRun: false, offline: false,
    count: 1, scope: undefined, locale: undefined,
    provider: undefined, model: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-a": case "--all": args.all = true; break;
      case "-c": case "--commit": args.commit = true; break;
      case "-d": case "--dry-run": args.dryRun = true; break;
      case "-o": case "--offline": args.offline = true; break;
      case "-h": case "--help": args.help = true; break;
      case "-v": case "--version": args.version = true; break;
      case "-n": case "--count": args.count = Math.max(1, parseInt(argv[++i], 10) || 1); break;
      case "-s": case "--scope": args.scope = argv[++i]; break;
      case "-l": case "--locale": args.locale = argv[++i]; break;
      case "--provider": args.provider = argv[++i]; break;
      case "--model": args.model = argv[++i]; break;
      case "config": args.config = true; break;
      default:
        if (a.startsWith("-")) { console.error(`Unknown option: ${a}`); exit(1); }
        args._.push(a);
    }
  }
  return args;
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

async function pickCandidate(candidates) {
  if (candidates.length === 1) return candidates[0];
  console.log(bold("\nPick a commit message:\n"));
  candidates.forEach((m, i) => {
    console.log(`  ${green(`${i + 1}.`)} ${m.split("\n")[0]}`);
  });
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("\nChoice [1]: ")).trim() || "1";
  rl.close();
  const idx = parseInt(answer, 10);
  if (!(idx >= 1 && idx <= candidates.length)) {
    console.error(red("Invalid choice.")); exit(1);
  }
  return candidates[idx - 1];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { console.log(HELP); return; }
  if (args.version) { console.log(VERSION); return; }

  // ---- config subcommand -------------------------------------------------
  if (args.config) {
    const [sub, key, ...rest] = args._;
    if (!sub || sub === "show" || sub === "get") {
      const cfg = await loadConfig();
      const masked = { ...cfg };
      if (masked.apiKey) masked.apiKey = masked.apiKey.slice(0, 6) + "…";
      console.log(bold("\nCurrent config:\n"));
      for (const [k, v] of Object.entries(masked)) console.log(`  ${cyan(k.padEnd(10))} ${v}`);
      console.log(dim(`\nFile: ${configPath()}`));
      return;
    }
    if (sub === "set") {
      if (!key) { console.error(red("Usage: commit-genie config set <key> <value>")); exit(1); }
      const next = await saveConfig({ [key]: rest.join(" ") });
      console.log(green(`✔ Saved. provider=${next.provider} model=${next.model}`));
      return;
    }
    console.error(red(`Unknown config command "${sub}". Try: show | set <key> <value>`));
    exit(1);
  }

  // ---- main flow ---------------------------------------------------------
  await assertGitRepo();
  if (args.all) await stageAll();

  // env + config-file only. CLI flags are resolved separately below through
  // allowlist lookups so raw argv never flows into the request path.
  const cfg = await loadConfig();

  // CLI flag → provider: resolved against a constant map, so the value used
  // downstream is always one of our own literals (never raw argv).
  const provider =
    (args.offline && "offline") ||
    PROVIDER_ALIASES[args.provider] ||
    cfg.provider;
  // CLI flag → model: strictly bounded charset/length before it may reach a request body
  const model =
    typeof args.model === "string" && /^[A-Za-z0-9._:@/+~-]{1,80}$/.test(args.model)
      ? args.model
      : cfg.model;

  const { diff, files } = await getDiff();
  if (!diff.trim()) {
    console.error(yellow("No staged changes found. Stage something first (git add) or run with -a."));
    exit(1);
  }

  let message = null;

  if (provider === "offline") {
    console.error(dim("⚙ offline engine (free, no AI) — install Ollama + `config set provider ollama` for AI messages"));
    message = offlineMessages(diff, files, args.count, { scope: args.scope })[0];
  } else {
    console.error(dim(`⚙ provider=${provider} model=${model}`));
    try {
      // endpoint URL is parsed & protocol-validated inside the provider before any request
      message = await generate(cfg, buildPrompt(diff, files, cfg, await recentCommits()), { provider, model });
    } catch (err) {
      console.error(yellow(`⚠ ${err.message}`));
      console.error(yellow("  Falling back to the offline engine…\n"));
      message = offlineMessages(diff, files, 1, cfg)[0];
    }
  }

  if (!message) {
    console.error(red("Could not generate a commit message."));
    exit(1);
  }

  if (args.count > 1 && cfg.provider !== "offline") {
    // For AI mode just show single best; candidates selection is offline-only for now
  }

  const chosen = args.count > 1
    ? await pickCandidate(cfg.provider === "offline"
        ? offlineMessages(diff, files, args.count, cfg)
        : [message])
    : message;

  console.log("\n" + bold(green("Suggested commit:")));
  console.log("─".repeat(50));
  console.log(chosen);
  console.log("─".repeat(50));

  if (args.dryRun || !args.commit) {
    console.log(dim("\n(dry run — run with -c to commit directly)"));
    return;
  }

  await commit(chosen);
  console.log(green("✔ Committed."));
}

main().catch((err) => {
  console.error(red("✖ " + err.message));
  exit(1);
});
