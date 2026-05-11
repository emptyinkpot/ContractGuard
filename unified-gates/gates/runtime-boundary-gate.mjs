import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node runtime-boundary-gate.mjs <input.json> or pipe JSON via stdin");
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

function sameValue(expected, actual) {
  return normalize(expected) === normalize(actual);
}

function checkObjective(payload, errors) {
  const requested = isObject(payload.requestedObjective) ? payload.requestedObjective : {};
  const actual = isObject(payload.actualObjective) ? payload.actualObjective : {};

  for (const field of ["model", "provider", "runtime", "dependency", "transport", "executionPath", "protocol", "persistenceTarget", "route", "successCriteria"]) {
    if (requested[field] !== undefined && !sameValue(requested[field], actual[field])) {
      errors.push(`GATE-OBJECTIVE-002 ${field} mismatch: requested=${normalize(requested[field])} actual=${normalize(actual[field])}`);
    }
  }
}

function checkMutationBoundary(payload, errors) {
  const mutations = asArray(payload.mutations);
  const allowedTargets = new Set(asArray(payload.allowedMutationTargets).map(normalize).filter(Boolean));

  for (const mutation of mutations) {
    const target = normalize(isObject(mutation) ? mutation.target : mutation);
    if (!target) {
      errors.push("GATE-RUNTIME-007 mutation target must be explicit");
      continue;
    }
    if (!allowedTargets.has(target)) {
      errors.push(`GATE-RUNTIME-007 unauthorized mutation target: ${target}`);
    }
  }
}

function checkProductionBoundary(payload, errors) {
  const productionTouched = payload.productionTouched === true;
  const productionMutation = payload.productionMutation === true || asArray(payload.mutations).some((mutation) => isObject(mutation) && mutation.production === true);

  if (productionTouched && payload.productionAuthorization !== true) {
    errors.push("GATE-RUNTIME-008 production access requires productionAuthorization=true");
  }

  if (productionMutation && payload.productionMutationAuthorization !== true) {
    errors.push("GATE-RUNTIME-008 production mutation requires productionMutationAuthorization=true");
  }
}

function checkExecutionPath(payload, errors) {
  const expected = asArray(payload.canonicalExecutionPath).map(normalize).filter(Boolean);
  const actual = asArray(payload.actualExecutionPath).map(normalize).filter(Boolean);

  if (expected.length === 0) {
    return;
  }

  if (expected.length !== actual.length) {
    errors.push(`GATE-RUNTIME-009 execution path length mismatch: expected=${expected.length} actual=${actual.length}`);
    return;
  }

  expected.forEach((part, index) => {
    if (part !== actual[index]) {
      errors.push(`GATE-RUNTIME-009 execution path mismatch at ${index}: expected=${part} actual=${actual[index]}`);
    }
  });
}

function checkProviderAuthenticity(payload, errors) {
  if (payload.providerAuthenticityRequired !== true) {
    return;
  }

  const proof = isObject(payload.providerProof) ? payload.providerProof : {};
  for (const field of ["upstream", "model", "endpoint", "authDomain", "responseSource"]) {
    if (!normalize(proof[field])) {
      errors.push(`GATE-RUNTIME-010 providerProof.${field} is required`);
    }
  }

  if (proof.isProxy === true || proof.isFallback === true || proof.isMock === true || proof.isCache === true || proof.isCompatibilityEndpoint === true) {
    errors.push("GATE-RUNTIME-010 provider proof cannot be proxy/fallback/mock/cache/compatibility endpoint");
  }
}

function checkFrozenCriteria(payload, errors) {
  const frozen = asArray(payload.frozenSuccessCriteria).map(normalize).filter(Boolean);
  const verified = asArray(payload.verifiedSuccessCriteria).map(normalize).filter(Boolean);

  if (frozen.length === 0) {
    errors.push("GATE-RUNTIME-011 frozenSuccessCriteria must be non-empty");
    return;
  }

  const verifiedSet = new Set(verified);
  for (const criterion of frozen) {
    if (!verifiedSet.has(criterion)) {
      errors.push(`GATE-RUNTIME-011 missing verified frozen criterion: ${criterion}`);
    }
  }

  const forbiddenCompletionSignals = new Set([
    "http 200",
    "no exception",
    "output exists",
    "generated content",
    "health check passed",
    "fallback success",
    "partial success",
    "alternate provider success"
  ]);

  for (const signal of asArray(payload.completionSignals).map((item) => normalize(item).toLowerCase())) {
    if (forbiddenCompletionSignals.has(signal) && !verifiedSet.has(signal)) {
      errors.push(`GATE-RUNTIME-011 forbidden completion substitute: ${signal}`);
    }
  }
}

function checkStructuralBudget(payload, errors) {
  const budget = isObject(payload.structuralBudget) ? payload.structuralBudget : {};
  const actual = isObject(payload.actualStructuralDelta) ? payload.actualStructuralDelta : {};
  const fields = ["newFiles", "newAbstractions", "newProviders", "newExecutionPaths", "newRegistries", "mutationTargets"];

  for (const field of fields) {
    const max = Number.isFinite(Number(budget[field])) ? Number(budget[field]) : 0;
    const used = Number.isFinite(Number(actual[field])) ? Number(actual[field]) : 0;
    if (used > max) {
      errors.push(`GATE-RUNTIME-012 structural budget exceeded for ${field}: max=${max} actual=${used}`);
    }
  }
}

function checkObservedCompletion(payload, errors) {
  const completionClaim = normalize(payload.completionClaim);
  if (!completionClaim) {
    return;
  }

  const observed = isObject(payload.observedExecution) ? payload.observedExecution : {};
  const requiredFields = ["model", "provider", "route", "executionPath"];
  for (const field of requiredFields) {
    if (!normalize(observed[field])) {
      errors.push(`GATE-RUNTIME-013 observedExecution.${field} is required for completion claims`);
    }
  }

  const requested = isObject(payload.requestedObjective) ? payload.requestedObjective : {};
  for (const field of requiredFields) {
    if (requested[field] !== undefined && observed[field] !== undefined && !sameValue(requested[field], observed[field])) {
      errors.push(`GATE-RUNTIME-013 observed ${field} mismatch: requested=${normalize(requested[field])} observed=${normalize(observed[field])}`);
    }
  }

  const evidence = asArray(payload.observedEvidence).map(normalize).filter(Boolean);
  if (evidence.length === 0) {
    errors.push("GATE-RUNTIME-013 completion claim requires observedEvidence");
  }
}

function main() {
  const payload = JSON.parse(readInput());
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  checkObjective(payload, errors);
  checkMutationBoundary(payload, errors);
  checkProductionBoundary(payload, errors);
  checkExecutionPath(payload, errors);
  checkProviderAuthenticity(payload, errors);
  checkFrozenCriteria(payload, errors);
  checkStructuralBudget(payload, errors);
  checkObservedCompletion(payload, errors);

  process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, gateFamily: "runtime-boundary", errors }, null, 2)}\n`);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
