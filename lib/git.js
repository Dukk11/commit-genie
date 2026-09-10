import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_DIFF_CHARS = 12000; // keep prompts small & fast

/**
 * Get the staged diff of the current repo.
 * @param {object} opts
 * @param {boolean} opts.staged read `git diff --cached` (default true)
 * @returns {Promise<{diff: string, files: string[]}>}
 */
export async function getDiff({ staged = true } = {}) {
  const args = staged
    ? ["diff", "--cached", "--no-color"]
    : ["diff", "HEAD", "--no-color"];

  const { stdout } = await execFileAsync("git", args, {
    maxBuffer: 1024 * 1024 * 10,
  });

  const files = [...stdout.matchAll(/^diff --git a\/(.+?) b\//gm)].map(
    (m) => m[1]
  );

  return { diff: truncateDiff(stdout), files };
}

function truncateDiff(diff) {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  // Keep the head (usually file headers + first changes) and tail (last file)
  const head = diff.slice(0, MAX_DIFF_CHARS * 0.8);
  const tail = diff.slice(-MAX_DIFF_CHARS * 0.2);
  return head + "\n... [diff truncated] ...\n" + tail;
}

/** Get repo root, throws if not inside a git repo. */
export async function assertGitRepo() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch {
    throw new Error(
      "Not inside a git repository. Run commit-genie from a repo with staged changes."
    );
  }
}

/** Stage everything tracked (git add -A) — used by `commit-genie -a` */
export async function stageAll() {
  await execFileAsync("git", ["add", "-A"]);
}

/** Create a commit with the given message. */
export async function commit(message) {
  await execFileAsync("git", ["commit", "-m", message]);
}

/** Last 5 commit subjects, to give the model style context. */
export async function recentCommits(n = 5) {
  try {
    const { stdout } = await execFileAsync("git", [
      "log",
      `-${n}`,
      "--pretty=format:%s",
    ]);
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
