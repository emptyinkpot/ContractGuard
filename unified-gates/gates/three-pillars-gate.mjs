import fs from "node:fs";

const INPUT_PATH = process.argv[2];

const FOURTH_PILLAR_PATH_PATTERNS = [
  /(^|[/\\])scripts?([/\\]|$)/i,
  /(^|[/\\])ops([/\\]|$)/i,
  /(^|[/\\])deploy([/\\]|$)/i,
  /(^|[/\\])deployments?([/\\]|$)/i,
  /(^|[/\\])registr(y|ies)([/\\]|$)/i,
  /(^|[/\\])metadata([/\\]|$)/i,
  /(^|[/\\])catalogs?([/\\]|$)/i,
  /(^|[/\\])preferences?([/\\]|$)/i
];

const FACT_FILE_PATTERNS = [
  /(^|[/\\])[^/\\]*(config|facts|truth|registry|metadata|catalog|preferences|map|mapping)[^/\\]*\.(json|ya?ml|toml|ts|js|mjs)$/i
];

const RUNTIME_WRAPPER_PATTERNS = [
  /(^|[/\\])(Dockerfile|docker-compose[^/\\]*\.ya?ml|compose[^/\\]*\.ya?ml)$/i,
  /(^|[/\\])infra[/\\](docker|systemd|nginx|runtime|deploy)[/\\]/i,
  /(^|[/\\]).*\.service$/i,
  /(^|[/\\]).*nginx.*\.conf$/i
];

const RUN_ENTRYPOINT_PATTERNS = [
  /(^|[/\\])skills[/\\](?:\.system[/\\])?[^/\\]+[/\\]scripts[/\\][^/\\]+\.(mjs|js|ts|py|ps1|sh)$/i
];

const VERIFY_PATTERNS = [
  /(^|[/\\])(tests?|__tests__|spec|fixtures?)([/\\]|$)/i,
  /(^|[/\\]).*\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|[/\\]).*(validate|check|test|smoke|contract|health).*\.(mjs|js|ts|ps1|sh)$/i
];

function readInput() {
  if (INPUT_PATH) return fs.readFileSync(INPUT_PATH, "utf8");
  if (!process.stdin.isTTY) return fs.readFileSync(0, "utf8");
  throw new Error("usage: node three-pillars-gate.mjs <input.json> or pipe JSON via stdin");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePath(value) {
  return String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
}

function classifyPath(filePath) {
  const normalized = normalizePath(filePath);
  if (!normalized) return null;

  if (VERIFY_PATTERNS.some((pattern) => pattern.test(normalized))) return "verify";
  if (RUNTIME_WRAPPER_PATTERNS.some((pattern) => pattern.test(normalized))) return "run";
  // Skill-owned scripts are canonical run entrypoints, unlike ad-hoc root scripts.
  if (RUN_ENTRYPOINT_PATTERNS.some((pattern) => pattern.test(normalized))) return "run";
  if (FACT_FILE_PATTERNS.some((pattern) => pattern.test(normalized))) return "facts";
  if (FOURTH_PILLAR_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) return "fourth-pillar";
  return null;
}

function extractPathsFromCommand(command) {
  const paths = [];
  const text = String(command || "");
  const patterns = [
    /\b(?:mkdir|md|New-Item|ni)\b(?:\s+-[A-Za-z]+)*\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gi,
    /\b(?:git\s+add|touch|code|notepad|vim|nvim)\b\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gi,
    /\b(?:Set-Content|Add-Content|Out-File)\b[^;\n\r]*?-Path\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gi,
    /\b(?:apply_patch|Update File:|Add File:)\s+([^\n\r]+)/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const value = match.slice(1).find(Boolean);
      if (value) paths.push(value.trim());
    }
  }

  return paths;
}

function validatePayload(payload) {
  const errors = [];
  const warnings = [];
  const files = [...asArray(payload.files), ...extractPathsFromCommand(payload.command)];

  for (const filePath of files) {
    const classification = classifyPath(filePath);
    if (classification === "fourth-pillar") {
      errors.push(`GATE-STRUCTURE-THREE-PILLARS: ${filePath} looks like a fourth pillar. Classify it under run, verify, or facts, or collapse it into an existing entry.`);
    }
  }

  for (const change of asArray(payload.changes)) {
    const pillar = String(change.pillar || "");
    const target = String(change.target || change.path || "change");
    if (!["run", "verify", "facts"].includes(pillar)) {
      errors.push(`GATE-STRUCTURE-THREE-PILLARS: ${target} must declare pillar=run|verify|facts.`);
    }
  }

  const command = String(payload.command || "");
  if (/\b(package\.json|Makefile|\.github[/\\]workflows)\b/i.test(command) && !/\b(run|verify|facts|check|test|main)\b/i.test(command)) {
    warnings.push("GATE-STRUCTURE-THREE-PILLARS: package/Makefile/CI changes should delegate to run, verify, or facts entry.");
  }

  return { errors, warnings, files };
}

const payload = JSON.parse(readInput());
const { errors, warnings, files } = validatePayload(payload);

process.stdout.write(`${JSON.stringify({
  ok: errors.length === 0,
  gateFamily: "three-pillars",
  checkedFiles: files,
  errors,
  warnings
}, null, 2)}\n`);

if (errors.length > 0) process.exitCode = 1;
