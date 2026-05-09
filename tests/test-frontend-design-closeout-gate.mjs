import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const gatePath = path.join(
  repoRoot,
  "guards",
  "ai-behavior",
  "core",
  "check-frontend-design-closeout.mjs",
);

function runFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const result = spawnSync(process.execPath, [gatePath, fixturePath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout);
  return { result, parsed };
}

const passRun = runFixture("frontend-design-closeout.pass.json");
assert.equal(passRun.result.status, 0, "pass fixture should exit 0");
assert.equal(passRun.parsed.verdict, "allow", "pass fixture should allow");
assert.equal(passRun.parsed.decision, "allow", "pass fixture should include decision");
assert.equal(passRun.parsed.gateId, "GATE-FRONTEND-DESIGN-CLOSEOUT-001", "pass fixture should include gateId");
assert.ok(Array.isArray(passRun.parsed.violations), "pass fixture should include violations array");

const reviewRun = runFixture("frontend-design-closeout.review.json");
assert.notEqual(reviewRun.result.status, 0, "review fixture should exit non-zero");
assert.equal(reviewRun.parsed.verdict, "review", "review fixture should require review");
assert.equal(reviewRun.parsed.decision, "review", "review fixture should include decision");
assert.ok(reviewRun.parsed.warnings.length > 0, "review fixture should emit warnings");

const blockRun = runFixture("frontend-design-closeout.block.json");
assert.notEqual(blockRun.result.status, 0, "block fixture should exit non-zero");
assert.equal(blockRun.parsed.verdict, "block", "block fixture should block");
assert.equal(blockRun.parsed.decision, "block", "block fixture should include decision");
assert.ok(blockRun.parsed.errors.length > 0, "block fixture should emit errors");

process.stdout.write("frontend design closeout gate test passed\n");
