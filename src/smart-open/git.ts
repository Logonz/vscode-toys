import { spawn } from "child_process";
import * as path from "path";

type CoChangeOptions = {
  repoRoot: string;
  targetRelPath: string; // repo-relative
  sinceDays?: number; // e.g., 365
  maxCommits?: number; // e.g., 5000
  noMerges?: boolean; // default true
};

export async function coChangeScores(opts: CoChangeOptions): Promise<Map<string, number>> {
  const { repoRoot, targetRelPath, sinceDays = 365 * 3, maxCommits = 10000, noMerges = true } = opts;

  const args = [
    "log",
    `--format="@@@%H|%ct"`,
    "--name-status",
    "-M",
    "-C",
    ...(noMerges ? ["--no-merges"] : []),
    ...(sinceDays ? [`--since=${sinceDays}.days`] : []),
    "-n",
    String(maxCommits),
    "--follow",
    "--",
    targetRelPath,
  ];

  console.log(`RepoRoot: ${repoRoot}`);
  const git = spawn("git", args, { cwd: repoRoot });

  // output the command to console
  console.log(`git ${args.join(" ")}`);
  const scores = new Map<string, number>();

  let curCommitTime = 0;
  let curFiles: string[] = [];

  const flushCommit = () => {
    if (!curFiles.length) return;
    // De-duplicate within a commit; exclude the target file itself
    const uniq = new Set(curFiles.filter((f) => f !== targetRelPath));
    if (!uniq.size) {
      curFiles = [];
      return;
    }

    // Simple weight now; refine later (see section 3)
    const weight = 1; // commit size/recency weighting comes later

    for (const f of uniq) {
      scores.set(f, (scores.get(f) ?? 0) + weight);
    }
    curFiles = [];
  };

  const decoder = new TextDecoder();
  let buf = "";
  git.stdout.on("data", (chunk) => {
    console.log("----- Git data return");
    buf += decoder.decode(chunk);
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trimRight();
      buf = buf.slice(idx + 1);

      if (line.startsWith("@@@")) {
        // New commit header
        flushCommit();
        // @@@<sha>|<ct>
        const parts = line.slice(3).split("|");
        curCommitTime = Number(parts[1] ?? 0);
      } else if (line) {
        // name-status line: e.g. "M\tpath" or "R100\told\tnew"
        const cols = line.split("\t");
        if (!cols.length) continue;
        let file = "";
        if (/^R/.test(cols[0]) && cols.length >= 3) file = cols[2];
        else if (cols.length >= 2) file = cols[1];

        if (file) {
          // Normalize to repo-relative with posix separators
          const norm = file.replace(/\\/g, "/");
          curFiles.push(norm);
        }
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    git.on("error", reject);
    git.on("close", (code) => {
      if (code !== 0) reject(new Error(`git exited ${code}`));
      else resolve();
    });
  });

  // Flush last commit if needed
  if (curFiles.length) flushCommit();

  return scores;
}
