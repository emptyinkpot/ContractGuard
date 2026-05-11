import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatePath = path.resolve(__dirname, "..", "gates", "convergence-gate.mjs");

function runFixture(name) {
  return spawnSync(process.execPath, [gatePath, path.resolve(__dirname, name)], {
    encoding: "utf8",
    windowsHide: true
  });
}

const pass = runFixture("convergence-gate.pass.json");
if (pass.status !== 0) {
  console.error(pass.stdout);
  console.error(pass.stderr);
  throw new Error("pass fixture failed");
}

const fail = runFixture("convergence-gate.fail.json");
if (fail.status === 0) {
  console.error(fail.stdout);
  throw new Error("fail fixture passed unexpectedly");
}

const payload = JSON.parse(fail.stdout);
for (const expected of ["GATE-CONVERGENCE-002", "GATE-CONVERGENCE-003", "GATE-CONVERGENCE-004", "GATE-CONVERGENCE-005", "GATE-CONVERGENCE-006"]) {
  if (!payload.errors.some((error) => error.includes(expected))) {
    throw new Error(`missing expected error for ${expected}`);
  }
}

console.log("convergence-gate tests passed");
