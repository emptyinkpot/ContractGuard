import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_FIELDS = [
  "projectName",
  "canonicalDoc",
  "machineReadableEntry",
  "githubRepo",
  "repositoryRole",
  "status",
];

const VALID_STATUSES = new Set([
  "active",
  "active-remote-first-source",
  "remote-first-worktree",
  "legacy",
  "legacy-source-record",
  "watch-mirror",
  "reference-fork",
  "research",
  "archived",
  "paused",
]);

function parseArgs(argv) {
  const args = { repoRoot: ".", strict: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo-root") {
      args.repoRoot = argv[i + 1];
      i += 1;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      args.repoRoot = arg;
    }
  }
  return args;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON ${filePath}: ${error.message}`);
  }
}

function exists(repoRoot, relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function includesIdentityCard(readme, project) {
  return readme.includes("Repository Identity")
    || readme.includes("Identity Card")
    || readme.includes("项目说明入口")
    || readme.includes(`projectName: ${project.projectName}`);
}

function hasAny(obj, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function roleText(project) {
  return `${project.repositoryRole || ""} ${project.status || ""} ${project.projectName || ""}`.toLowerCase();
}

function checkProject(repoRoot, strict) {
  const errors = [];
  const warnings = [];
  const projectPath = path.join(repoRoot, "project.json");

  if (!fs.existsSync(projectPath)) {
    return { ok: false, repoRoot, errors: ["project.json is required"], warnings };
  }

  const project = readJson(projectPath);

  for (const field of REQUIRED_FIELDS) {
    if (project[field] === undefined || project[field] === null || project[field] === "") {
      errors.push(`${field} is required`);
    }
  }

  if (project.canonicalDoc && project.canonicalDoc !== "README.md") {
    errors.push("canonicalDoc must be README.md");
  }
  if (project.machineReadableEntry && project.machineReadableEntry !== "project.json") {
    errors.push("machineReadableEntry must be project.json");
  }
  if (project.githubRepo && !/^(https:\/\/github\.com\/[^/]+\/[^/]+|local-only)$/.test(project.githubRepo)) {
    errors.push("githubRepo must be a GitHub repository URL or local-only");
  }
  if (project.status && !VALID_STATUSES.has(project.status)) {
    warnings.push(`status '${project.status}' is not in the known vocabulary`);
  }

  if (!exists(repoRoot, "README.md")) {
    errors.push("README.md is required");
  } else {
    const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
    if (!includesIdentityCard(readme, project)) {
      errors.push("README.md must contain a top-level identity card");
    }
  }

  const role = roleText(project);
  const isLegacy = role.includes("legacy");
  const isWatch = role.includes("watch") || role.includes("mirror");
  const isProduction = Boolean(project.runtimeSurface || project.publicAppUrl || project.openAiCompatibleBaseUrl || project.homepage);

  if ((isLegacy || isWatch) && project.preferredSource === true) {
    errors.push("legacy/watch/mirror repositories must not set preferredSource=true");
  }
  if (isWatch && project.deployFromHere !== false) {
    errors.push("watch/mirror repositories must set deployFromHere=false");
  }
  if (isLegacy && !hasAny(project, ["activeForwardSource", "relatedRepositories"])) {
    errors.push("legacy repositories must point to an active forward source");
  }
  if (project.githubForkRelation === false && !project.manualUpstreamRepo && !project.upstreamRepo && !project.activeForwardSource) {
    warnings.push("githubForkRelation=false should declare manualUpstreamRepo, upstreamRepo, or activeForwardSource");
  }
  if (project.githubForkRelation === true && !project.upstreamRepo && !project.upstreamRuntimeFoundationRepo) {
    warnings.push("githubForkRelation=true should declare upstreamRepo or upstreamRuntimeFoundationRepo");
  }

  if (isProduction && !isWatch && !isLegacy && !exists(repoRoot, "docs/runtime/production-runbook.md")) {
    const hasAlternativeRunbook = project.productionRunbook || project.privateDeploymentNotes || project.selfHostingGuide;
    const message = "production-facing repositories should have docs/runtime/production-runbook.md or a declared runbook alternative";
    if (hasAlternativeRunbook) warnings.push(message);
    else errors.push(message);
  }

  if (strict) {
    for (const file of ["SECURITY.md", "SUPPORT.md", "CONTRIBUTING.md"]) {
      if (!exists(repoRoot, file)) errors.push(`${file} is required in strict mode`);
    }
    if ((isLegacy || isWatch) && !project.doNotUseAs) {
      errors.push("legacy/watch repositories must declare doNotUseAs in strict mode");
    }
    if (!project.supplyRelationships && !project.consumes && !project.supplies && !isLegacy && !isWatch) {
      warnings.push("active repositories should declare supplyRelationships, consumes, or supplies");
    }
  }

  return {
    ok: errors.length === 0,
    repoRoot,
    projectName: project.projectName,
    repositoryRole: project.repositoryRole,
    status: project.status,
    errors,
    warnings,
  };
}

const args = parseArgs(process.argv);

if (args.help) {
  console.log("Usage: node tools/check-project-json.mjs [--repo-root <path>] [--strict]");
  process.exit(0);
}

try {
  const result = checkProject(path.resolve(args.repoRoot), args.strict);
  const output = JSON.stringify(result, null, 2);
  if (result.ok) {
    console.log(output);
    process.exit(0);
  }
  console.error(output);
  process.exit(1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
