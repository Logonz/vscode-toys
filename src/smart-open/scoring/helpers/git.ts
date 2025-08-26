import * as child_process from "child_process";
import * as path from "path";

type CoChangeOptions = {
  repoRoot: string;
  targetRelPath: string; // repo-relative
  sinceDays?: number; // e.g., 365
  maxCommits?: number; // e.g., 5000
  noMerges?: boolean; // default true
};

// Step 1: Get all commits that touched the target file (track renames)
function getCommitsThatTouchedFile(opts: CoChangeOptions): string[] {
  const { repoRoot, targetRelPath, sinceDays = 365 * 3, maxCommits = 10000, noMerges = true } = opts;

  const args = [
    "log",
    "--format=%H",
    ...(noMerges ? ["--no-merges"] : []),
    ...(sinceDays ? [`--since=${sinceDays}.days`] : []),
    "-n",
    String(maxCommits),
    "--follow",
    "--",
    targetRelPath,
  ];

  const cwd = repoRoot;
  const command = `git ${args.join(" ")}`;
  console.log(`Step 1 - Getting commits: ${command}`);

  try {
    const output = child_process
      .execSync(command, {
        cwd,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 100,
      })
      .toString();

    const commits = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    console.log(`Found ${commits.length} commits that touched ${targetRelPath}`);
    return commits;
  } catch (error) {
    console.error("Git command failed:", error);
    throw error;
  }
}

// Step 2: For each commit, list all files in that commit (with rename/copy detection) - BATCHED
function getFilesInCommits(
  repoRoot: string,
  commits: string[],
  targetRelPath: string,
  batchSize = 256
): Map<string, number> {
  const scores = new Map<string, number>();

  // Process commits in batches for better performance
  for (let i = 0; i < commits.length; i += batchSize) {
    const batch = commits.slice(i, i + batchSize);

    const args = [
      "show",
      // "--no-patch",
      "--name-status",
      "-M",
      "-C",
      "--pretty=@@@%H",
      ...batch,
    ];

    const command = `git ${args.join(" ")}`;
    console.log(
      `Step 2 - Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(commits.length / batchSize)} (${
        batch.length
      } commits)`
    );

    try {
      const output = child_process
        .execSync(command, {
          cwd: repoRoot,
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 50, // Increased buffer for batched output
        })
        .toString();

      let currentSha = "";
      const lines = output.split("\n");

      for (const line of lines) {
        const trimmedLine = line.trimRight();
        if (!trimmedLine) continue;

        // Check for commit header
        if (trimmedLine.startsWith("@@@")) {
          currentSha = trimmedLine.slice(3);
          continue;
        }

        // Parse name-status line: e.g. "M\tpath" or "R100\told\tnew"
        const cols = trimmedLine.split("\t");
        if (!cols.length) continue;

        let file = "";
        if (/^R/.test(cols[0]) && cols.length >= 3) {
          file = cols[2]; // For renames, take the new name
        } else if (cols.length >= 2) {
          file = cols[1]; // For modifications, additions, deletions
        }

        if (file) {
          // Normalize to repo-relative with posix separators
          const norm = file.replace(/\\/g, "/");

          // Exclude the target file itself
          if (norm !== targetRelPath) {
            scores.set(norm, (scores.get(norm) ?? 0) + 1);
          }
        }
      }
    } catch (error) {
      console.error(`Git show failed for batch starting at commit ${i}:`, error);
      // Continue with other batches
    }
  }

  return scores;
}

export function coChangeScores(opts: CoChangeOptions): Map<string, number> {
  console.log(`RepoRoot: ${opts.repoRoot}`);
  console.log(`Target file: ${opts.targetRelPath}`);

  // Step 1: Get all commits that touched the target file
  const commits = getCommitsThatTouchedFile(opts);

  // Step 2: For each commit, get all files and count co-changes
  const scores = getFilesInCommits(opts.repoRoot, commits, opts.targetRelPath);

  console.log(`Found co-change scores for ${scores.size} files`);

  return scores;
}
