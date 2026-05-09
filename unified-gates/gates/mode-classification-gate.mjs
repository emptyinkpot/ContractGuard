import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node mode-classification-gate.mjs <input.json> or pipe JSON via stdin");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function ensureModeEvidence(payload, errors) {
  if (!isObject(payload.modeEvidence)) {
    errors.push("modeEvidence must be an object");
    return;
  }

  if (!hasNonEmptyArray(payload.modeEvidence.signals)) {
    errors.push("modeEvidence.signals must be a non-empty array");
  }
}

function validateDeterministic(payload, errors) {
  if (!isObject(payload.rootCause)) {
    errors.push("deterministic mode requires rootCause");
  } else {
    if (!isNonEmptyString(payload.rootCause.summary)) {
      errors.push("rootCause.summary must be a non-empty string");
    }
    if (!hasNonEmptyArray(payload.rootCause.observableEvidence)) {
      errors.push("rootCause.observableEvidence must be a non-empty array");
    }
    if (payload.rootCause.reproducible !== true) {
      errors.push("rootCause.reproducible must be true in deterministic mode");
    }
    if (payload.rootCause.nonGuessBased !== true) {
      errors.push("rootCause.nonGuessBased must be true in deterministic mode");
    }
  }

  if (!hasNonEmptyArray(payload.pathTrace)) {
    errors.push("deterministic mode requires a non-empty pathTrace");
  }
}

function validateProbabilistic(payload, errors) {
  if (!hasNonEmptyArray(payload.hypotheses)) {
    errors.push("probabilistic mode requires a non-empty hypotheses array");
    return;
  }

  const expectedFactors = new Set(["primary", "interaction", "external"]);
  let previousConfidence = Number.POSITIVE_INFINITY;

  payload.hypotheses.forEach((hypothesis, index) => {
    if (!isObject(hypothesis)) {
      errors.push(`hypotheses[${index}] must be an object`);
      return;
    }

    if (!isNonEmptyString(hypothesis.summary)) {
      errors.push(`hypotheses[${index}].summary must be a non-empty string`);
    }
    if (typeof hypothesis.confidence !== "number" || hypothesis.confidence < 0 || hypothesis.confidence > 1) {
      errors.push(`hypotheses[${index}].confidence must be a number between 0 and 1`);
    } else if (hypothesis.confidence > previousConfidence) {
      errors.push("hypotheses must be sorted by descending confidence");
    } else {
      previousConfidence = hypothesis.confidence;
    }
    if (!expectedFactors.has(hypothesis.factorType)) {
      errors.push(`hypotheses[${index}].factorType must be primary, interaction, or external`);
    }
    if (!hasNonEmptyArray(hypothesis.evidence)) {
      errors.push(`hypotheses[${index}].evidence must be a non-empty array`);
    }
  });

  for (const factor of expectedFactors) {
    if (!payload.hypotheses.some((entry) => entry?.factorType === factor)) {
      errors.push(`probabilistic mode hypotheses must include factorType=${factor}`);
    }
  }
}

function validateResilience(payload, errors) {
  const hasRootCause = isObject(payload.rootCause) && isNonEmptyString(payload.rootCause.summary);
  const hasIrreducibleUncertainty =
    isObject(payload.irreducibleUncertainty) &&
    payload.irreducibleUncertainty.declared === true &&
    isNonEmptyString(payload.irreducibleUncertainty.reason);

  if (!hasRootCause && !hasIrreducibleUncertainty) {
    errors.push("resilience mode requires either rootCause or irreducibleUncertainty declaration");
  }

  if (!isObject(payload.resiliencePlan)) {
    errors.push("resilience mode requires resiliencePlan");
    return;
  }

  for (const field of ["trigger", "failureCost", "recoveryPath"]) {
    if (!isNonEmptyString(payload.resiliencePlan[field])) {
      errors.push(`resiliencePlan.${field} must be a non-empty string`);
    }
  }
}

function main() {
  const payload = JSON.parse(readInput());
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  if (!["deterministic", "probabilistic", "resilience"].includes(payload.mode)) {
    errors.push("mode must be deterministic, probabilistic, or resilience");
  }

  ensureModeEvidence(payload, errors);

  if (payload.mode === "deterministic") {
    validateDeterministic(payload, errors);
  } else if (payload.mode === "probabilistic") {
    validateProbabilistic(payload, errors);
  } else if (payload.mode === "resilience") {
    validateResilience(payload, errors);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: errors.length === 0,
        gateFamily: "execution-mode",
        mode: payload.mode ?? null,
        errors
      },
      null,
      2
    )}\n`
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
