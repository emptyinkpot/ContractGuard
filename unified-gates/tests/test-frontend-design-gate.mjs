import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gatesDir = path.resolve(__dirname, "..", "gates");

function runFixture(fixtureName) {
  const gatePath = path.join(gatesDir, "frontend-design-gate.mjs");
  const fixturePath = path.join(__dirname, fixtureName);
  const result = spawnSync(process.execPath, [gatePath, fixturePath], { encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);
  return { result, parsed };
}

const passRun = runFixture("frontend-design-gate.pass.json");
assert.equal(passRun.result.status, 0, "pass fixture should exit 0");
assert.equal(passRun.parsed.verdict, "allow", "pass fixture should allow");
assert.deepEqual(passRun.parsed.errors, [], "pass fixture should not have block errors");

const failRun = runFixture("frontend-design-gate.fail.json");
assert.notEqual(failRun.result.status, 0, "fail fixture should exit non-zero");
assert.equal(failRun.parsed.verdict, "block", "fail fixture should block");
assert.ok(failRun.parsed.errors.length > 0, "fail fixture should report block errors");

process.stdout.write("frontend-design-gate test passed\n");
