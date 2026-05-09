import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const hooksPath = path.join(repoRoot, "githooks");

function runGit(args) {
  const command = process.platform === "win32" ? "git.exe" : "git";
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

function main() {
  const hookFile = path.join(hooksPath, "pre-commit");
  if (!fs.existsSync(hookFile)) {
    throw new Error(`Missing hook file: ${hookFile}`);
  }

  const result = runGit(["config", "--local", "core.hooksPath", "githooks"]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git config failed").trim());
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        hooksPath: "githooks",
        repoRoot,
        message: "core.hooksPath configured for local pre-commit gate",
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.stderr.write("\n");
  process.exit(1);
}
