import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptRoot, "..");
const guardCli = path.join(repoRoot, "guards", "ai-behavior", "core", "check-ai-behavior.mjs");

function runGuardCase({ id, diffText, changedFiles, expectedVerdict }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "contractguard-ai-selftest-"));
  const diffFile = path.join(tempRoot, `${id}.diff`);
  const changedFilesFile = path.join(tempRoot, `${id}-files.txt`);

  fs.writeFileSync(diffFile, diffText, "utf8");
  fs.writeFileSync(changedFilesFile, `${changedFiles.join("\n")}\n`, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      guardCli,
      "--repo-root",
      repoRoot,
      "--diff-file",
      diffFile,
      "--changed-files-file",
      changedFilesFile,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  const stdout = result.stdout?.trim() || "";
  const stderr = result.stderr?.trim() || "";

  let payload = null;
  if (stdout) {
    try {
      payload = JSON.parse(stdout);
    } catch (error) {
      throw new Error(`${id}: failed to parse guard JSON output: ${error.message}`);
    }
  }

  if (!payload) {
    throw new Error(`${id}: guard did not emit JSON output.`);
  }

  if (payload.verdict !== expectedVerdict) {
    throw new Error(
      `${id}: expected verdict ${expectedVerdict}, received ${payload.verdict}. stdout=${stdout} stderr=${stderr}`,
    );
  }

  return {
    id,
    expectedVerdict,
    actualVerdict: payload.verdict,
    score: payload.score,
    changedFiles,
  };
}

function main() {
  const cases = [
    {
      id: "docs-only-diff",
      expectedVerdict: "allow",
      changedFiles: ["docs/quickstart.md"],
      diffText: [
        "diff --git a/docs/quickstart.md b/docs/quickstart.md",
        "index 0000000..1111111 100644",
        "--- a/docs/quickstart.md",
        "+++ b/docs/quickstart.md",
        "@@ -72,0 +73,4 @@",
        "+```powershell",
        "+powershell -File guards/ai-behavior/hooks/invoke-plan-gate.ps1 -ProjectRoot . -Query \"Change base_url to http://127.0.0.1:3001/openai/v1 and bypass pool with direct provider\"",
        "+```",
        "",
      ].join("\n"),
    },
    {
      id: "real-risk-diff",
      expectedVerdict: "block",
      changedFiles: ["src/gateway.js"],
      diffText: [
        "diff --git a/src/gateway.js b/src/gateway.js",
        "index 0000000..1111111 100644",
        "--- a/src/gateway.js",
        "+++ b/src/gateway.js",
        "@@ -1,0 +1,2 @@",
        "+const base_url = \"http://127.0.0.1:3001/openai/v1\";",
        "+// bypass pool with direct provider",
        "",
      ].join("\n"),
    },
  ];

  const results = cases.map((item) => runGuardCase(item));
  const output = {
    ok: true,
    tool: "contractguard-ai-behavior-regression-selftest",
    repoRoot,
    results,
    timestampUtc: new Date().toISOString(),
  };

  console.log(JSON.stringify(output, null, 2));
}

try {
  main();
} catch (error) {
  const payload = {
    ok: false,
    tool: "contractguard-ai-behavior-regression-selftest",
    error: error instanceof Error ? error.message : String(error),
    timestampUtc: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
