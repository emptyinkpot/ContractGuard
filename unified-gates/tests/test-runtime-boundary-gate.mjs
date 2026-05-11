import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatePath = path.resolve(__dirname, "..", "gates", "runtime-boundary-gate.mjs");

function runFixture(name) {
  return spawnSync(process.execPath, [gatePath, path.resolve(__dirname, name)], {
    encoding: "utf8",
    windowsHide: true
  });
}

const pass = runFixture("runtime-boundary-gate.pass.json");
if (pass.status !== 0) {
  console.error(pass.stdout);
  console.error(pass.stderr);
  throw new Error("pass fixture failed");
}

const fail = runFixture("runtime-boundary-gate.fail.json");
if (fail.status === 0) {
  console.error(fail.stdout);
  throw new Error("fail fixture passed unexpectedly");
}

const payload = JSON.parse(fail.stdout);
for (const expected of ["GATE-OBJECTIVE-002", "GATE-RUNTIME-007", "GATE-RUNTIME-008", "GATE-RUNTIME-009", "GATE-RUNTIME-010", "GATE-RUNTIME-011", "GATE-RUNTIME-012", "GATE-RUNTIME-013"]) {
  if (!payload.errors.some((error) => error.includes(expected))) {
    throw new Error(`missing expected error for ${expected}`);
  }
}

console.log("runtime-boundary-gate tests passed");
