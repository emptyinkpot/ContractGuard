import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRootDefault = path.resolve(__dirname, "..", "..");

const GIT = process.platform === "win32" ? "git.exe" : "git";
const NODE = process.execPath;

function parseArgs(argv) {
  const args = {
    repoRoot: repoRootDefault,
    mode: "local",
    jsonOut: null,
    selfTest: false,
  };

  function nextValue(flagName, index) {
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Missing value for ${flagName}`);
    }
    return value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--repo-root":
        args.repoRoot = path.resolve(nextValue(token, index));
        index += 1;
        break;
      case "--mode":
        args.mode = nextValue(token, index);
        index += 1;
        break;
      case "--json-out":
        args.jsonOut = nextValue(token, index);
        index += 1;
        break;
      case "--self-test":
        args.selfTest = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!["local", "ci"].includes(args.mode)) {
    throw new Error("--mode must be local or ci");
  }

  return args;
}

function writeJsonIfRequested(filePath, value) {
  if (!filePath) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });

  return {
    command,
    args,
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    ok: result.status === 0,
    error: result.error ? String(result.error.message ?? result.error) : null,
  };
}

function tail(text, lines = 20) {
  const chunks = String(text || "").split(/\r?\n/);
  return chunks.slice(Math.max(0, chunks.length - lines)).join("\n").trim();
}

function getStagedFiles(repoRoot) {
  const result = run(GIT, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], repoRoot);
  if (!result.ok) {
    throw new Error(`git diff --cached failed: ${result.stderr || result.stdout || result.error || "unknown error"}`);
  }
  if (!result.stdout) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasAny(files, patterns) {
  return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

function planChecks(mode, stagedFiles) {
  const checks = [
    {
      id: "validate-project",
      label: "project schema validation",
      command: NODE,
      args: [path.join(repoRootDefault, "tools", "validate-project-contract.mjs"), "project.json"],
    },
    {
      id: "guard-selftest",
      label: "behavior gate self-test",
      command: NODE,
      args: [path.join(repoRootDefault, "guards", "ai-behavior", "core", "check-ai-behavior.mjs"), "--repo-root", repoRootDefault, "--self-test"],
    },
    {
      id: "guard-regressions",
      label: "behavior gate regressions",
      command: NODE,
      args: [path.join(repoRootDefault, "tools", "selftest-ai-behavior-regressions.mjs")],
    },
    {
      id: "structural-laws-selftest",
      label: "structural laws gate self-test",
      command: NODE,
      args: [path.join(repoRootDefault, "unified-gates", "tests", "test-structural-laws-gate.mjs")],
    },
    {
      id: "decision-schema-selftest",
      label: "decision schema self-test",
      command: NODE,
      args: [path.join(repoRootDefault, "tests", "test-decision-schema.mjs")],
    },
  ];

  const touchesTaskPipeline = hasAny(stagedFiles, [
    /(^|\/)tools\/task-pipeline\//i,
    /(^|\/)tools\/validate-project-contract\.mjs$/i,
    /(^|\/)project\.json$/i,
    /(^|\/)package\.json$/i,
  ]);
  const touchesFrontendContract = hasAny(stagedFiles, [
    /(^|\/)templates\/project-contract\//i,
    /(^|\/)tests\/test-frontend-design-closeout-gate\.mjs$/i,
    /(^|\/)tests\/test-decision-schema\.mjs$/i,
    /(^|\/)guards\/ai-behavior\/core\/check-frontend-design-closeout\.mjs$/i,
  ]);

  if (mode === "ci" || touchesTaskPipeline) {
    checks.push({
      id: "task-pipeline-selftest",
      label: "task pipeline self-test",
      command: NODE,
      args: [path.join(repoRootDefault, "tools", "task-pipeline", "run-task-pipeline.mjs"), "--self-test"],
    });
  }

  if (mode === "ci" || touchesFrontendContract) {
    checks.push({
      id: "frontend-closeout-selftest",
      label: "frontend design closeout self-test",
      command: NODE,
      args: [path.join(repoRootDefault, "tests", "test-frontend-design-closeout-gate.mjs")],
    });
  }

  return checks;
}

function evaluateChecks(checks, repoRoot) {
  const results = [];
  let verdict = "allow";
  let reason = "all checks passed";

  for (const check of checks) {
    const result = run(check.command, check.args, repoRoot);
    results.push({
      id: check.id,
      label: check.label,
      command: check.command,
      args: check.args,
      exitCode: result.exitCode,
      ok: result.ok,
      stdout: tail(result.stdout),
      stderr: tail(result.stderr),
    });

    if (!result.ok) {
      verdict = "block";
      reason = `${check.label} failed`;
      break;
    }
  }

  return {
    verdict,
    reason,
    results,
  };
}

function buildLocalFacts(repoRoot) {
  const diffCheck = run(GIT, ["diff", "--cached", "--check"], repoRoot);
  const stagedFiles = getStagedFiles(repoRoot);

  return {
    diffCheck,
    stagedFiles,
    stagedFileCount: stagedFiles.length,
  };
}

function evaluateLocalGate(repoRoot) {
  const facts = buildLocalFacts(repoRoot);
  const errors = [];

  if (!facts.stagedFiles.length) {
    errors.push("no staged files found");
  }

  if (!facts.diffCheck.ok) {
    errors.push("git diff --cached --check failed");
  }

  const checks = planChecks("local", facts.stagedFiles);
  const checkEvaluation = errors.length === 0 ? evaluateChecks(checks, repoRoot) : {
    verdict: "block",
    reason: errors.join("; "),
    results: [],
  };

  return {
    mode: "local",
    repoRoot,
    stagedFiles: facts.stagedFiles,
    stagedFileCount: facts.stagedFileCount,
    diffCheck: {
      ok: facts.diffCheck.ok,
      exitCode: facts.diffCheck.exitCode,
      stdout: tail(facts.diffCheck.stdout),
      stderr: tail(facts.diffCheck.stderr),
    },
    plannedChecks: checks.map((item) => ({ id: item.id, label: item.label })),
    ...checkEvaluation,
  };
}

function evaluateCiGate(repoRoot) {
  const trackedFiles = run(GIT, ["ls-files"], repoRoot);
  if (!trackedFiles.ok) {
    return {
      mode: "ci",
      repoRoot,
      verdict: "block",
      reason: "git ls-files failed",
      results: [],
      trackedFiles: [],
    };
  }

  const trackedFileList = trackedFiles.stdout
    ? trackedFiles.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : [];
  const checks = planChecks("ci", trackedFileList);
  const checkEvaluation = evaluateChecks(checks, repoRoot);

  return {
    mode: "ci",
    repoRoot,
    trackedFiles: trackedFileList.slice(0, 2000),
    trackedFileCount: trackedFileList.length,
    plannedChecks: checks.map((item) => ({ id: item.id, label: item.label })),
    ...checkEvaluation,
  };
}

function runSelfTest(repoRoot) {
  const localPlan = planChecks("local", [
    "README.md",
    "guards/ai-behavior/core/check-ai-behavior.mjs",
    "tools/task-pipeline/run-task-pipeline.mjs",
    "tests/test-decision-schema.mjs",
  ]);
  const ciPlan = planChecks("ci", ["README.md"]);

  const safeLocal = {
    mode: "local",
    repoRoot,
    stagedFiles: ["README.md"],
    stagedFileCount: 1,
    diffCheck: { ok: true, exitCode: 0, stdout: "", stderr: "" },
    plannedChecks: localPlan.map((item) => ({ id: item.id, label: item.label })),
    verdict: "allow",
    reason: "all checks passed",
    results: [],
  };

  const blockedLocal = {
    mode: "local",
    repoRoot,
    stagedFiles: [],
    stagedFileCount: 0,
    diffCheck: { ok: true, exitCode: 0, stdout: "", stderr: "" },
    plannedChecks: [],
    verdict: "block",
    reason: "no staged files found",
    results: [],
  };

  const safeCi = {
    mode: "ci",
    repoRoot,
    trackedFiles: ["README.md"],
    trackedFileCount: 1,
    plannedChecks: ciPlan.map((item) => ({ id: item.id, label: item.label })),
    verdict: "allow",
    reason: "all checks passed",
    results: [],
  };

  if (safeLocal.verdict !== "allow") {
    throw new Error("self-test failed: safe local case should allow");
  }
  if (blockedLocal.verdict !== "block") {
    throw new Error("self-test failed: empty local case should block");
  }
  if (safeCi.verdict !== "allow") {
    throw new Error("self-test failed: ci case should allow");
  }

  return {
    ok: true,
    gateFamily: "pre-commit",
    selfTest: true,
    localPlannedChecks: safeLocal.plannedChecks,
    ciPlannedChecks: safeCi.plannedChecks,
    timestampUtc: new Date().toISOString(),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const result = runSelfTest(args.repoRoot);
    writeJsonIfRequested(args.jsonOut, result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const evaluation = args.mode === "ci"
    ? evaluateCiGate(args.repoRoot)
    : evaluateLocalGate(args.repoRoot);

  const output = {
    ok: evaluation.verdict === "allow",
    gateFamily: "pre-commit",
    ...evaluation,
    timestampUtc: new Date().toISOString(),
  };

  writeJsonIfRequested(args.jsonOut, output);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (evaluation.verdict !== "allow") {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const payload = {
    ok: false,
    gateFamily: "pre-commit",
    verdict: "block",
    reason: error instanceof Error ? error.message : String(error),
    timestampUtc: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}
