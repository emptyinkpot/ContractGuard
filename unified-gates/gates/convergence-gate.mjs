import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node convergence-gate.mjs <input.json> or pipe JSON via stdin");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalize(value).toLowerCase();
}

function includesPath(canonicalPath, item) {
  const needle = normalizeLower(item);
  return asArray(canonicalPath).some((part) => normalizeLower(part) === needle);
}

function checkCanonicalPath(payload, errors) {
  const path = asArray(payload.canonicalExecutionPath).map(normalize).filter(Boolean);
  if (path.length === 0) {
    errors.push("GATE-CONVERGENCE-001 canonicalExecutionPath must be non-empty");
  }

  for (const item of asArray(payload.outOfScopeSubsystems)) {
    if (includesPath(path, item)) {
      errors.push(`GATE-CONVERGENCE-001 out-of-scope subsystem appears in canonical path: ${normalize(item)}`);
    }
  }
}

function checkScopeLock(payload, errors) {
  const allowed = new Set(asArray(payload.allowedSubsystems).map(normalizeLower).filter(Boolean));
  const outOfScope = new Set(asArray(payload.outOfScopeSubsystems).map(normalizeLower).filter(Boolean));

  for (const touched of asArray(payload.touchedSubsystems).map(normalizeLower).filter(Boolean)) {
    if (outOfScope.has(touched)) {
      errors.push(`GATE-CONVERGENCE-002 out-of-scope subsystem touched: ${touched}`);
    }
    if (allowed.size > 0 && !allowed.has(touched)) {
      errors.push(`GATE-CONVERGENCE-002 subsystem outside allowed set: ${touched}`);
    }
  }
}

function checkExplorationBudget(payload, errors) {
  const budget = isObject(payload.explorationBudget) ? payload.explorationBudget : {};
  const actual = isObject(payload.actualExploration) ? payload.actualExploration : {};
  const fields = ["repoSearches", "fileReads", "executionBranches", "subsystemsTouched"];

  for (const field of fields) {
    const max = Number.isFinite(Number(budget[field])) ? Number(budget[field]) : 0;
    const used = Number.isFinite(Number(actual[field])) ? Number(actual[field]) : 0;
    if (used > max) {
      errors.push(`GATE-CONVERGENCE-003 exploration budget exceeded for ${field}: max=${max} actual=${used}`);
    }
  }
}

function checkRelevance(payload, errors) {
  const path = asArray(payload.canonicalExecutionPath).map(normalizeLower).filter(Boolean);

  for (const read of asArray(payload.fileReads)) {
    if (!isObject(read)) {
      errors.push("GATE-CONVERGENCE-004 fileReads entries must be objects");
      continue;
    }

    const file = normalize(read.path);
    const reason = normalize(read.reason);
    const pathSegment = normalizeLower(read.pathSegment);
    const direct = read.directlyOnCanonicalPath === true || (pathSegment && path.includes(pathSegment));

    if (!file) {
      errors.push("GATE-CONVERGENCE-004 file read path must be explicit");
    }
    if (!reason) {
      errors.push(`GATE-CONVERGENCE-004 file read missing relevance reason: ${file}`);
    }
    if (!direct) {
      errors.push(`GATE-CONVERGENCE-004 file read is not tied to canonical path: ${file}`);
    }
  }
}

function checkProgress(payload, errors) {
  const steps = asArray(payload.steps);
  const maxNoProgress = Number.isFinite(Number(payload.maxConsecutiveNoProgressSteps))
    ? Number(payload.maxConsecutiveNoProgressSteps)
    : 1;

  let consecutiveNoProgress = 0;
  for (const step of steps) {
    if (!isObject(step)) {
      errors.push("GATE-CONVERGENCE-005 steps entries must be objects");
      continue;
    }

    const id = normalize(step.id) || "unnamed-step";
    if (step.objectiveProgress === true) {
      consecutiveNoProgress = 0;
      continue;
    }

    consecutiveNoProgress += 1;
    if (consecutiveNoProgress > maxNoProgress) {
      errors.push(`GATE-CONVERGENCE-005 too many consecutive no-progress steps at ${id}: max=${maxNoProgress}`);
    }
  }
}

function checkDeadEnds(payload, errors) {
  for (const branch of asArray(payload.executionBranches)) {
    if (!isObject(branch)) {
      errors.push("GATE-CONVERGENCE-006 executionBranches entries must be objects");
      continue;
    }

    const id = normalize(branch.id) || "unnamed-branch";
    if (branch.status === "dead-end" && branch.terminated !== true) {
      errors.push(`GATE-CONVERGENCE-006 dead-end branch must be terminated: ${id}`);
    }
    if (branch.unrelatedFailure === true && branch.action !== "ignore-blocked") {
      errors.push(`GATE-CONVERGENCE-006 unrelated failure must be ignored/blocked, not repaired: ${id}`);
    }
  }
}

function main() {
  const payload = JSON.parse(readInput());
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  checkCanonicalPath(payload, errors);
  checkScopeLock(payload, errors);
  checkExplorationBudget(payload, errors);
  checkRelevance(payload, errors);
  checkProgress(payload, errors);
  checkDeadEnds(payload, errors);

  process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, gateFamily: "convergence", errors }, null, 2)}\n`);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
