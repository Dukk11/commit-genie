# ✨ commit-genie

[![CI](https://github.com/Dukk11/commit-genie/actions/workflows/ci.yml/badge.svg)](https://github.com/Dukk11/commit-genie/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-4f9cf9.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![built by Duk](https://img.shields.io/badge/built%20by-Duk%20%C2%B7%20dukdev.com-8e6ff7)](https://dukdev.com)

**AI-powered git commit messages — free forever.**

Turn your staged diff into a clean [Conventional Commit](https://www.conventionalcommits.org) in under a second. Works **fully offline** out of the box, plugs into **local Ollama** for real AI (still free), or any OpenAI-compatible API. **Zero dependencies.**

```bash
$ git add -A
$ commit-genie -c

⚙ provider=ollama model=llama3.2

Suggested commit:
──────────────────────────────────────────────────
feat(auth): add refresh-token rotation

Expired access tokens now trigger a single-use refresh
instead of forcing a full re-login.
──────────────────────────────────────────────────
✔ Committed.
```

## Why another commit tool?

| | commit-genie | aicommits / opencommit |
|---|---|---|
| Works without any API key | ✅ offline engine | ❌ |
| 100% free AI (local Ollama) | ✅ | partial |
| Any OpenAI-compatible endpoint | ✅ | ✅ |
| Dependencies | **0** | many |
| Install size | ~40 KB | MBs |

Most AI commit tools are paywalled behind an OpenAI key. commit-genie ships a smart **offline engine** that classifies your diff into a proper conventional commit with no network at all — and upgrades itself to real AI the moment you point it at [Ollama](https://ollama.com).

## Install

Requires Node 18+. No other dependencies.

```bash
npm install -g commit-genie-cli
```

## Quickstart

```bash
# 1) Free, offline, right now — no setup, no API key
git add -A
commit-genie            # prints a suggested message

# 2) Stage everything and commit in one go
commit-genie -a -c

# 3) Real AI, still free, runs locally via Ollama
ollama pull llama3.2
commit-genie config set provider ollama
commit-genie -c

# 4) Pick from 3 candidates
commit-genie -n 3

# 5) Use any OpenAI-compatible API (Groq, OpenRouter, Together, vLLM…)
export COMMIT_GENIE_PROVIDER=openai
export COMMIT_GENIE_BASE_URL=https://api.groq.com/openai
export COMMIT_GENIE_MODEL=llama-3.1-8b-instant
export COMMIT_GENIE_API_KEY=gsk_...
commit-genie -c
```

## CLI

```
commit-genie [options]

  -a, --all          Stage all changes first (git add -A)
  -c, --commit       Commit automatically with the generated message
  -n, --count <n>    Generate n candidates and pick one
  -s, --scope <s>    Force a commit scope (api, ui, auth…)
  -o, --offline      Force the free offline engine
  -d, --dry-run      Print the message, don't commit
      --provider <p> offline | ollama | openai
      --model <m>    Model name
```

Config lives in `~/.commit-genie.json`:

```bash
commit-genie config                       # show
commit-genie config set provider ollama   # change
```

Environment variables: `COMMIT_GENIE_PROVIDER`, `COMMIT_GENIE_MODEL`, `COMMIT_GENIE_BASE_URL`, `COMMIT_GENIE_API_KEY`, `COMMIT_GENIE_LOCALE`.

## The offline engine

No magic server — pure diff heuristics:

- **Type detection** from file paths (`test/` → `test:`, `docs/` → `docs:`, lockfiles → `chore(deps):`, new files → `feat:` …)
- **Subject extraction** from the actual changed lines, boosting identifiers (camelCase/snake_case)
- **Conventional Commits** formatting with optional body listing affected files

It's honest about what it is: a fast, free baseline. Your best commits will still come from AI — but you're never blocked, never rate-limited, never billed.

## Development

```bash
git clone https://github.com/Dukk11/commit-genie
cd commit-genie
npm test
```

## License

[MIT](LICENSE) — free forever, for everyone.

---

Built with ⚡ by **[Duk](https://dukdev.com)** · [more open-source tools](https://github.com/Dukk11) · [dukdev.com](https://dukdev.com)
