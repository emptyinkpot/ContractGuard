import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node architecture-boundary-gate.mjs <input.json> or pipe JSON via stdin");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function main() {
  const payload = JSON.parse(readInput());
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  if (payload.architectureBoundaryTouched !== true) {
    errors.push("architectureBoundaryTouched must be true");
  }

  if (!isObject(payload.boundary)) {
    errors.push("boundary must be an object");
  } else {
    if (!isNonEmptyString(payload.boundary.type)) {
      errors.push("boundary.type must be a non-empty string");
    }
    if (!isNonEmptyString(payload.boundary.currentCanonicalPath)) {
      errors.push("boundary.currentCanonicalPath must be a non-empty string");
    }
  }

  if (!isObject(payload.riskVerdict)) {
    errors.push("riskVerdict must be an object");
  } else {
    if (!["allow", "review", "block"].includes(payload.riskVerdict.verdict)) {
      errors.push("riskVerdict.verdict must be allow, review, or block");
    }
    if (!isNonEmptyString(payload.riskVerdict.reason)) {
      errors.push("riskVerdict.reason must be a non-empty string");
    }
  }

  if (!isObject(payload.preChangeCheck) || payload.preChangeCheck.completed !== true) {
    errors.push("preChangeCheck.completed must be true");
  }

  if (!isObject(payload.postChangeCheck) || payload.postChangeCheck.completed !== true) {
    errors.push("postChangeCheck.completed must be true");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: errors.length === 0,
        gateFamily: "architecture-boundary",
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
