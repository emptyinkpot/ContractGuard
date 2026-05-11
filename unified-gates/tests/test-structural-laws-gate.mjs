import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gatesDir = path.resolve(__dirname, "..", "gates");
const gitCommand = process.platform === "win32" ? "git.exe" : "git";

function runFixture(fixtureName) {
  const gatePath = path.join(gatesDir, "structural-laws-gate.mjs");
  const fixturePath = path.join(__dirname, fixtureName);
  const result = spawnSync(process.execPath, [gatePath, fixturePath], { encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);
  return { result, parsed };
}

const passRun = runFixture("structural-laws-gate.pass.json");
assert.equal(passRun.result.status, 0, "pass fixture should exit 0");
assert.equal(passRun.parsed.verdict, "allow", "pass fixture should allow");
assert.deepEqual(passRun.parsed.errors, [], "pass fixture should not report errors");

const failRun = runFixture("structural-laws-gate.fail.json");
assert.notEqual(failRun.result.status, 0, "fail fixture should exit non-zero");
assert.equal(failRun.parsed.verdict, "block", "fail fixture should block");
assert.ok(failRun.parsed.errors.length > 0, "fail fixture should report errors");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "structural-laws-gate-"));
spawnSync(gitCommand, ["init"], { cwd: tempRoot, encoding: "utf8" });
spawnSync(gitCommand, ["config", "user.email", "contractguard@example.invalid"], { cwd: tempRoot, encoding: "utf8" });
spawnSync(gitCommand, ["config", "user.name", "ContractGuard"], { cwd: tempRoot, encoding: "utf8" });
fs.writeFileSync(
  path.join(tempRoot, "fallback-helper.ts"),
  "export function readItems(items?: string[]) { if (!items) return []; return items; }\n",
  "utf8"
);
spawnSync(gitCommand, ["add", "fallback-helper.ts"], { cwd: tempRoot, encoding: "utf8" });

const scanResult = spawnSync(
  process.execPath,
  [path.join(gatesDir, "structural-laws-gate.mjs"), "--mode", "staged", "--repo-root", tempRoot],
  { encoding: "utf8" }
);
const scanParsed = JSON.parse(scanResult.stdout);
assert.notEqual(scanResult.status, 0, "staged scan should exit non-zero for forbidden surfaces");
assert.equal(scanParsed.verdict, "block", "staged scan should block forbidden surfaces");
assert.ok(scanParsed.errors.some((error) => error.includes("fallback")), "staged scan should report fallback surface");
assert.ok(scanParsed.errors.some((error) => error.includes("return []")), "staged scan should report default empty array");

const topologyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "structural-topology-gate-"));
spawnSync(gitCommand, ["init"], { cwd: topologyRoot, encoding: "utf8" });
spawnSync(gitCommand, ["config", "user.email", "contractguard@example.invalid"], { cwd: topologyRoot, encoding: "utf8" });
spawnSync(gitCommand, ["config", "user.name", "ContractGuard"], { cwd: topologyRoot, encoding: "utf8" });
fs.mkdirSync(path.join(topologyRoot, "features", "story", "domain"), { recursive: true });
fs.mkdirSync(path.join(topologyRoot, "features", "story", "view"), { recursive: true });
fs.mkdirSync(path.join(topologyRoot, "features", "billing", "domain"), { recursive: true });
fs.mkdirSync(path.join(topologyRoot, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(topologyRoot, "structural-topology.json"),
  `${JSON.stringify(
    {
      layers: [
        { name: "domain", root: "features/story/domain" },
        { name: "view", root: "features/story/view" }
      ],
      allowedImports: {
        view: ["domain"],
        domain: []
      },
      allowedRoots: ["features", "structural-topology.json"],
      owners: {
        "features/story/**": "story",
        "features/billing/**": "billing"
      },
      allowedOwnerImports: {
        story: []
      },
      requiredChildren: [
        {
          parentGlob: "features/*",
          children: ["domain", "application", "view"]
        }
      ],
      publicEntrypoints: ["features/story/index.ts"]
    },
    null,
    2
  )}\n`,
  "utf8"
);
fs.writeFileSync(
  path.join(topologyRoot, "features", "story", "domain", "model.ts"),
  "import { render } from '../view/render';\nimport { invoice } from '../../billing/domain/invoice';\nexport const model = render + invoice;\n",
  "utf8"
);
fs.writeFileSync(
  path.join(topologyRoot, "features", "story", "view", "render.ts"),
  "export function render() { return 'ok'; }\n",
  "utf8"
);
fs.writeFileSync(
  path.join(topologyRoot, "features", "story", "domain", "title-parser.ts"),
  "export const titleParser = true;\n",
  "utf8"
);
fs.writeFileSync(
  path.join(topologyRoot, "features", "story", "view", "chapter-parser.ts"),
  "export const chapterParser = true;\n",
  "utf8"
);
fs.writeFileSync(
  path.join(topologyRoot, "features", "billing", "domain", "invoice.ts"),
  "export const invoice = 'invoice';\n",
  "utf8"
);
fs.writeFileSync(
  path.join(topologyRoot, "scripts", "loose.ts"),
  "export const loose = true;\n",
  "utf8"
);
spawnSync(gitCommand, ["add", "."], { cwd: topologyRoot, encoding: "utf8" });

const topologyResult = spawnSync(
  process.execPath,
  [path.join(gatesDir, "structural-laws-gate.mjs"), "--mode", "staged", "--repo-root", topologyRoot],
  { encoding: "utf8" }
);
const topologyParsed = JSON.parse(topologyResult.stdout);
assert.notEqual(topologyResult.status, 0, "topology scan should exit non-zero for layer violations");
assert.equal(topologyParsed.verdict, "block", "topology scan should block layer violations");
assert.ok(topologyParsed.errors.some((error) => error.includes("domain cannot import view")), "topology scan should report import direction violation");
assert.ok(topologyParsed.errors.some((error) => error.includes("missing required child application")), "topology scan should report missing required child");
assert.ok(topologyParsed.errors.some((error) => error.includes("outside topology.allowedRoots")), "topology scan should report disallowed root");
assert.ok(topologyParsed.errors.some((error) => error.includes("owner story cannot import owner billing")), "topology scan should report owner boundary violation");
assert.ok(topologyParsed.errors.some((error) => error.includes("duplicate capability story:parser")), "topology scan should report duplicate capability");
assert.ok(topologyParsed.facts.structuralDiff.addedFiles.includes("features/story/domain/model.ts"), "topology scan should expose structural diff added files");

process.stdout.write("structural-laws-gate test passed\n");
