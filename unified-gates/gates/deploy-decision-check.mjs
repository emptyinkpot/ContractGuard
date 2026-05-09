import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node deploy-decision-check.mjs <input.json> or pipe JSON via stdin");
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

  if (payload.runtimeTouching !== true) {
    errors.push("runtimeTouching must be true");
  }

  if (!isObject(payload.deployDecision)) {
    errors.push("deployDecision must be an object");
  } else {
    if (!["deployed", "not-needed", "blocked"].includes(payload.deployDecision.status)) {
      errors.push("deployDecision.status must be deployed, not-needed, or blocked");
    }
    if (!isNonEmptyString(payload.deployDecision.reason)) {
      errors.push("deployDecision.reason must be a non-empty string");
    }
  }

  if (payload.deployDecision?.status === "deployed") {
    if (!isObject(payload.deployVerification)) {
      errors.push("deployed status requires deployVerification");
    } else {
      if (!["workflow", "manual", "direct", "auto-deploy"].includes(payload.deployVerification.method)) {
        errors.push("deployVerification.method must be workflow, manual, direct, or auto-deploy");
      }
      if (!isNonEmptyString(payload.deployVerification.evidence)) {
        errors.push("deployVerification.evidence must be a non-empty string");
      }
    }
  }

  if (payload.pushPerformed === true && payload.deployDecision?.status === "deployed") {
    if (!isObject(payload.pushVsDeploy)) {
      errors.push("pushVsDeploy must be present when push and deploy are both claimed");
    } else {
      if (payload.pushVsDeploy.distinguished !== true) {
        errors.push("pushVsDeploy.distinguished must be true");
      }
      if (!isNonEmptyString(payload.pushVsDeploy.description)) {
        errors.push("pushVsDeploy.description must be a non-empty string");
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: errors.length === 0,
        gateFamily: "deploy-decision",
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
