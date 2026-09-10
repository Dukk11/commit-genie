# Contributing to commit-genie

Thanks for helping make commit-genie better! 🎉

## Ground rules

1. **Zero dependencies.** If your change needs `npm install`, it needs a redesign. Node stdlib only.
2. **Keep the offline engine honest.** It must work with no network, no API key, no config — that's the core promise.
3. **Every provider change needs a test.** `npm test` must stay green on Node 18, 20 and 22 (CI covers Linux, macOS, Windows).

## Workflow

```bash
git clone https://github.com/Dukk11/commit-genie
cd commit-genie
npm test          # node --test, no install needed
```

- Small, focused PRs win. One feature or fix per PR.
- Bug reports: include OS, Node version (`node -v`) and the diff that triggered it (strip anything private).
- Feature ideas: open an issue first so we can agree on scope — especially anything touching the config surface.

## Code style

Plain ESM, no build step, no lint config to fight with. Match the style of the file you're editing.

---

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
