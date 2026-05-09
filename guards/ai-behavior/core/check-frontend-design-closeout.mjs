import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDecisionResult } from "../../shared/decision-result.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const schemaPath = path.join(
  repoRoot,
  "templates",
  "project-contract",
  "frontend-design-closeout.schema.json",
);

const inputPath = process.argv[2];

function fail(message) {
  throw new Error(message);
}

function readInput() {
  if (inputPath) {
    return fs.readFileSync(inputPath, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  fail("usage: node check-frontend-design-closeout.mjs <input.json> or pipe JSON via stdin");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value, minLength = 1) {
  return typeof value === "string" && value.trim().length >= minLength;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function addUnique(items, message) {
  if (!items.includes(message)) {
    items.push(message);
  }
}

function validateContract(contract, errors) {
  if (!isObject(contract)) {
    addUnique(errors, "contract must be an object");
    return;
  }

  if (!isNonEmptyString(contract.layout, 8)) {
    addUnique(errors, "contract.layout must be a concrete non-empty string");
  }
  if (!isNonEmptyArray(contract.components)) {
    addUnique(errors, "contract.components must be a non-empty array");
  }
  if (!isNonEmptyArray(contract.spacings)) {
    addUnique(errors, "contract.spacings must be a non-empty array");
  }
  if (!isNonEmptyArray(contract.copy)) {
    addUnique(errors, "contract.copy must be a non-empty array");
  }
}

function validateComponentSourceGate(componentSourceGate, errors) {
  if (!isObject(componentSourceGate)) {
    addUnique(errors, "componentSourceGate must be an object");
    return;
  }

  if (!isNonEmptyArray(componentSourceGate.allowedSources)) {
    addUnique(errors, "componentSourceGate.allowedSources must be a non-empty array");
  }
  if (!isNonEmptyArray(componentSourceGate.checkedFiles)) {
    addUnique(errors, "componentSourceGate.checkedFiles must be a non-empty array");
  }
  if (!Array.isArray(componentSourceGate.violations)) {
    addUnique(errors, "componentSourceGate.violations must be an array");
  }
  if (componentSourceGate.status !== "pass") {
    addUnique(errors, "componentSourceGate.status must be pass");
  }
  if (Array.isArray(componentSourceGate.violations) && componentSourceGate.violations.length > 0) {
    addUnique(errors, "componentSourceGate.violations must be empty");
  }
}

function validateVisualRegressionGate(visualRegressionGate, errors) {
  if (!isObject(visualRegressionGate)) {
    addUnique(errors, "visualRegressionGate must be an object");
    return;
  }

  if (visualRegressionGate.status !== "pass") {
    addUnique(errors, "visualRegressionGate.status must be pass");
  }
  if (!isNonEmptyString(visualRegressionGate.tool)) {
    addUnique(errors, "visualRegressionGate.tool must be a non-empty string");
  }
  if (!isNonEmptyString(visualRegressionGate.baseline)) {
    addUnique(errors, "visualRegressionGate.baseline must be a non-empty string");
  }
  if (!isNonEmptyString(visualRegressionGate.report)) {
    addUnique(errors, "visualRegressionGate.report must be a non-empty string");
  }
}

function validateLintGate(lintGate, warnings) {
  if (lintGate === undefined) {
    addUnique(warnings, "lintGate not provided; add lightweight token/component lint when the consumer repo is ready");
    return;
  }

  if (!isObject(lintGate)) {
    addUnique(warnings, "lintGate should be an object when provided");
    return;
  }

  const status = lintGate.status ?? "not-run";
  if (status === "warn" || status === "not-run") {
    addUnique(warnings, `lintGate status is ${status}; lightweight style enforcement is recommended`);
  }
  if (status === "fail") {
    addUnique(warnings, "lintGate reported fail; fix token/component lint drift before shipping");
  }
  if (Array.isArray(lintGate.findings) && lintGate.findings.length > 0) {
    addUnique(warnings, `lintGate reported ${lintGate.findings.length} finding(s)`);
  }
}

function buildViolations(errors, warnings) {
  const violations = [];

  for (const error of errors) {
    violations.push({
      code: "VALIDATION_ERROR",
      severity: "block",
      detail: error,
    });
  }

  for (const warning of warnings) {
    violations.push({
      code: "VALIDATION_WARNING",
      severity: "review",
      detail: warning,
    });
  }

  return violations;
}

function main() {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const payload = JSON.parse(readInput());
  const errors = [];
  const warnings = [];

  if (!isObject(payload)) {
    fail("input must be a JSON object");
  }

  if (payload.taskIsNonTrivial !== true) {
    addUnique(errors, "taskIsNonTrivial must be true");
  }

  const allowedTaskTypes = schema.properties.taskType.enum;
  if (!allowedTaskTypes.includes(payload.taskType)) {
    addUnique(errors, `taskType must be one of: ${allowedTaskTypes.join(", ")}`);
  }

  validateContract(payload.contract, errors);
  validateComponentSourceGate(payload.componentSourceGate, errors);
  validateVisualRegressionGate(payload.visualRegressionGate, errors);
  validateLintGate(payload.lintGate, warnings);

  const verdict = errors.length > 0 ? "block" : warnings.length > 0 ? "review" : "allow";
  const violations = buildViolations(errors, warnings);
  const result = buildDecisionResult({
    gateId: "GATE-FRONTEND-DESIGN-CLOSEOUT-001",
    tool: "frontend-design-closeout-gate",
    verdict,
    reason: errors[0] ?? warnings[0] ?? "frontend design closeout passed",
    status: verdict === "block" ? "failed" : "ok",
    violations,
    extra: {
      schemaId: schema.$id,
      gateFamily: "frontend-design-closeout",
      contract: payload.contract,
      componentSourceGate: payload.componentSourceGate,
      visualRegressionGate: payload.visualRegressionGate,
      lintGate: payload.lintGate,
      errors,
      warnings,
    },
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (verdict !== "allow") {
    process.exitCode = 1;
  }
}

main();
