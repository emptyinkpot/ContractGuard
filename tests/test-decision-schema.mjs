import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(repoRoot, "schemas", "decision.schema.json");
const aiBehaviorGate = path.join(repoRoot, "guards", "ai-behavior", "core", "check-ai-behavior.mjs");
const frontendGate = path.join(repoRoot, "guards", "ai-behavior", "core", "check-frontend-design-closeout.mjs");
const tmpDir = path.join(repoRoot, ".tmp-decision-schema-test");

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function parseJson(stdout, label) {
  assert.ok(stdout && stdout.trim().length > 0, `${label} should produce JSON`);
  return JSON.parse(stdout);
}

function runAiBehavior(text, name) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, `${text}\n`, "utf8");
  const result = runNode([
    aiBehaviorGate,
    "--repo-root",
    repoRoot,
    "--response-file",
    filePath,
  ]);
  return { result, parsed: parseJson(result.stdout, name) };
}

function runFrontendFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const result = runNode([frontendGate, fixturePath]);
  return { result, parsed: parseJson(result.stdout, name) };
}

assert.ok(fs.existsSync(schemaPath), "decision schema should exist");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
assert.deepEqual(schema.required.slice(0, 4), ["decision", "gateId", "reason", "violations"]);

const safeAi = runAiBehavior(
  [
    "[STEP] Review the current gate wiring.",
    "[WHY] We need to make the format rule executable.",
    "[ACTION] Add a response-format validator and bind it to the output guard.",
    "[RESULT] The guard now blocks missing STEP/WHY/ACTION/RESULT outputs.",
  ].join("\n"),
  "safe-response.txt",
);
assert.equal(safeAi.result.status, 0, "safe ai-behavior response should pass");
assert.equal(safeAi.parsed.decision, safeAi.parsed.verdict, "decision should mirror verdict");
assert.equal(safeAi.parsed.gateId, "GATE-AI-BEHAVIOR-001");
assert.ok(Array.isArray(safeAi.parsed.violations), "ai-behavior result should include violations array");

const blockedAi = runAiBehavior("This response is missing the required format.", "blocked-response.txt");
assert.notEqual(blockedAi.result.status, 0, "blocked ai-behavior response should fail");
assert.equal(blockedAi.parsed.decision, "block", "blocked ai-behavior response should block");
assert.ok(blockedAi.parsed.violations.length > 0, "blocked ai-behavior response should include violations");

const passFrontend = runFrontendFixture("frontend-design-closeout.pass.json");
assert.equal(passFrontend.result.status, 0, "frontend pass fixture should pass");
assert.equal(passFrontend.parsed.decision, "allow");
assert.equal(passFrontend.parsed.gateId, "GATE-FRONTEND-DESIGN-CLOSEOUT-001");
assert.ok(Array.isArray(passFrontend.parsed.violations), "frontend pass should include violations array");

const reviewFrontend = runFrontendFixture("frontend-design-closeout.review.json");
assert.notEqual(reviewFrontend.result.status, 0, "frontend review fixture should be non-zero");
assert.equal(reviewFrontend.parsed.decision, "review");

const blockFrontend = runFrontendFixture("frontend-design-closeout.block.json");
assert.notEqual(blockFrontend.result.status, 0, "frontend block fixture should be non-zero");
assert.equal(blockFrontend.parsed.decision, "block");
assert.ok(blockFrontend.parsed.violations.length > 0, "frontend block should include violations");

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log("decision schema gate test passed");
