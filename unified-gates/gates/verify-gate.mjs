import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node verify-gate.mjs <input.json> or pipe JSON via stdin");
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

function main() {
  const payload = JSON.parse(readInput());
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  if (payload.taskIsNonTrivial !== true) {
    errors.push("taskIsNonTrivial must be true");
  }

  if (!isObject(payload.verification)) {
    errors.push("verification must be an object");
  } else {
    if (!["file", "static", "unit", "integration", "manual", "live"].includes(payload.verification.level)) {
      errors.push("verification.level must be file, static, unit, integration, manual, or live");
    }
    if (!hasNonEmptyArray(payload.verification.evidence)) {
      errors.push("verification.evidence must be a non-empty array");
    }
    if (!["passed", "failed", "blocked"].includes(payload.verification.result)) {
      errors.push("verification.result must be passed, failed, or blocked");
    }
  }

  if (!isObject(payload.verificationDecision)) {
    errors.push("verificationDecision must be an object");
  } else {
    if (!["passed", "not-needed", "blocked"].includes(payload.verificationDecision.status)) {
      errors.push("verificationDecision.status must be passed, not-needed, or blocked");
    }
    if (!isNonEmptyString(payload.verificationDecision.reason)) {
      errors.push("verificationDecision.reason must be a non-empty string");
    }
  }

  if (payload.userVisibleChange === true) {
    if (!isObject(payload.liveVerification)) {
      errors.push("userVisibleChange requires liveVerification");
    } else {
      if (!["passed", "not-needed", "blocked"].includes(payload.liveVerification.status)) {
        errors.push("liveVerification.status must be passed, not-needed, or blocked");
      }
      if (!isNonEmptyString(payload.liveVerification.artifactOrReason)) {
        errors.push("liveVerification.artifactOrReason must be a non-empty string");
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: errors.length === 0,
        gateFamily: "verification",
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
