import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const GIT = process.platform === "win32" ? "git.exe" : "git";

const FORBIDDEN_SURFACE_TERMS = [
  "adapter",
  "bridge",
  "compat",
  "fallback",
  "helper",
  "legacy",
  "misc",
  "normalize",
  "normalizer",
  "shim",
  "temp",
  "wrapper"
];

const FORBIDDEN_CODE_PATTERNS = [
  {
    id: "silent-catch",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    message: "empty catch block hides illegal state"
  },
  {
    id: "catch-ignore",
    pattern: /catch\s*\([^)]*\)\s*\{[^}]*\b(ignore|ignored|noop)\b[^}]*\}/i,
    message: "catch-and-ignore is forbidden"
  },
  {
    id: "default-empty-array",
    pattern: /\breturn\s+\[\s*\]\s*;/,
    message: "return [] as structural survival is forbidden"
  },
  {
    id: "default-empty-object",
    pattern: /\breturn\s+\{\s*\}\s*;/,
    message: "return {} as structural survival is forbidden"
  },
  {
    id: "nullish-empty-array",
    pattern: /\?\?\s*\[\s*\]/,
    message: "implicit [] fallback is forbidden"
  },
  {
    id: "nullish-empty-object",
    pattern: /\?\?\s*\{\s*\}/,
    message: "implicit {} fallback is forbidden"
  },
  {
    id: "fallback-identifier",
    pattern: /\b(fallback|compat|legacy|shim)\b/i,
    message: "fallback/compat/legacy/shim code surface is forbidden"
  }
];

const IMPORT_PATTERN = /\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']|(?:import|export)\s*\([^"']*["']([^"']+)["'][^)]*\)|\bexport\s+[^'"]*\s+from\s+["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

const DUPLICATE_CAPABILITY_TERMS = [
  "parser",
  "publisher",
  "resolver",
  "scheduler",
  "scanner",
  "transform",
  "validator"
];

function parseArgs(argv) {
  const args = {
    inputPath: null,
    repoRoot: null,
    mode: "proof"
  };

  function nextValue(flagName, index) {
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Missing value for ${flagName}`);
    }
    return value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--repo-root":
        args.repoRoot = path.resolve(nextValue(token, index));
        index += 1;
        break;
      case "--mode":
        args.mode = nextValue(token, index);
        index += 1;
        break;
      default:
        if (token.startsWith("--")) {
          throw new Error(`Unknown argument: ${token}`);
        }
        if (args.inputPath !== null) {
          throw new Error(`Unexpected positional argument: ${token}`);
        }
        args.inputPath = token;
        break;
    }
  }

  if (!["proof", "staged", "tracked"].includes(args.mode)) {
    throw new Error("--mode must be proof, staged, or tracked");
  }

  if (args.mode !== "proof" && !args.repoRoot) {
    throw new Error("--repo-root is required for staged or tracked mode");
  }

  return args;
}

function readInput() {
  if (ARGS.inputPath) {
    return fs.readFileSync(ARGS.inputPath, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node structural-laws-gate.mjs <input.json> or pipe JSON via stdin");
}

const ARGS = parseArgs(process.argv.slice(2));

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function requireObject(errors, value, path) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function requireString(errors, value, path) {
  if (!isNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function requireArray(errors, value, path) {
  if (!isNonEmptyArray(value)) {
    errors.push(`${path} must be a non-empty array`);
  }
}

function requireNonNegativeNumber(errors, value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${path} must be a non-negative number`);
  }
}

function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
    return out;
  }

  if (isObject(value)) {
    for (const item of Object.values(value)) {
      collectStrings(item, out);
    }
  }

  return out;
}

function containsForbiddenSurface(value) {
  const haystack = collectStrings(value).join("\n").toLowerCase();
  return FORBIDDEN_SURFACE_TERMS.filter((term) => haystack.includes(term));
}

function runGit(repoRoot, args) {
  const result = spawnSync(GIT, args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout || result.error?.message || "unknown error"}`);
  }

  return (result.stdout ?? "").trim();
}

function splitLines(text) {
  return String(text || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function isTextLikeFile(filePath) {
  return /\.(cjs|css|html|js|json|jsx|md|mjs|ps1|ts|tsx|txt|yml|yaml)$/i.test(filePath);
}

function readRepoFile(repoRoot, relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (!absolutePath.startsWith(rootWithSep)) {
    throw new Error(`path escapes repo root: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function buildRepoScanPayload(repoRoot, mode) {
  const topology = readTopology(repoRoot);
  const files = mode === "tracked"
    ? splitLines(runGit(repoRoot, ["ls-files"]))
    : splitLines(runGit(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]));

  const deletedFiles = mode === "tracked"
    ? []
    : splitLines(runGit(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=D"]));

  return {
    repoScan: {
      mode,
      repoRoot,
      topology,
      files: files.map((filePath) => {
        if (!isTextLikeFile(filePath)) {
          return { path: filePath, textScanned: false };
        }

        return {
          path: filePath,
          textScanned: true,
          content: readRepoFile(repoRoot, filePath)
        };
      }),
      entropyDelta: {
        newFiles: mode === "staged" ? splitLines(runGit(repoRoot, ["diff", "--cached", "--name-only", "--diff-filter=A"])).length : 0,
        deletedFiles: deletedFiles.length
      },
      structuralDiff: mode === "staged" ? buildStructuralDiff(repoRoot, topology) : null
    }
  };
}

function readTopology(repoRoot) {
  const topologyPath = path.join(repoRoot, "structural-topology.json");
  if (!fs.existsSync(topologyPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(topologyPath, "utf8"));
}

function buildStructuralDiff(repoRoot, topology) {
  const nameStatusLines = splitLines(runGit(repoRoot, ["diff", "--cached", "--name-status"]));
  const addedFiles = [];
  const modifiedFiles = [];
  const deletedFiles = [];

  for (const line of nameStatusLines) {
    const [status, ...paths] = line.split(/\s+/).filter(Boolean);
    const filePath = normalizePath(paths.at(-1) ?? "");
    if (!filePath) {
      continue;
    }
    if (status.startsWith("A")) {
      addedFiles.push(filePath);
    } else if (status.startsWith("D")) {
      deletedFiles.push(filePath);
    } else if (status.startsWith("M") || status.startsWith("R") || status.startsWith("C")) {
      modifiedFiles.push(filePath);
    }
  }

  const layers = Array.isArray(topology?.layers) ? topology.layers : [];
  const owners = topology?.owners ?? {};
  const addedDirectories = [...new Set(addedFiles.flatMap((filePath) => parentDirectories(filePath)))].sort();
  const addedLayerRoots = addedDirectories.filter((dirPath) => layerForPath(dirPath, layers) !== null);
  const addedOwnerRoots = addedDirectories.filter((dirPath) => ownerForPath(dirPath, compileOwnerRules(owners)) !== null);

  return {
    addedFiles,
    modifiedFiles,
    deletedFiles,
    addedDirectories,
    addedLayerRoots,
    addedOwnerRoots
  };
}

function parentDirectories(filePath) {
  const parts = normalizePath(filePath).split("/").filter(Boolean);
  const dirs = [];
  for (let index = 1; index < parts.length; index += 1) {
    dirs.push(parts.slice(0, index).join("/"));
  }
  return dirs;
}

function validateCanonicalPath(errors, payload) {
  if (!requireObject(errors, payload.canonicalPath, "canonicalPath")) {
    return;
  }

  requireString(errors, payload.canonicalPath.realOwner, "canonicalPath.realOwner");
  requireString(errors, payload.canonicalPath.realEntry, "canonicalPath.realEntry");
  requireArray(errors, payload.canonicalPath.dataFlow, "canonicalPath.dataFlow");
}

function validateRootCause(errors, payload) {
  if (!requireObject(errors, payload.rootCause, "rootCause")) {
    return;
  }

  requireString(errors, payload.rootCause.producingLayer, "rootCause.producingLayer");
  requireArray(errors, payload.rootCause.propagationPath, "rootCause.propagationPath");

  if (payload.rootCause.fixedAtProducingLayer !== true) {
    errors.push("rootCause.fixedAtProducingLayer must be true");
  }
}

function validateMinimalChange(errors, payload) {
  if (!requireObject(errors, payload.minimalChangeProof, "minimalChangeProof")) {
    return;
  }

  const proof = payload.minimalChangeProof;
  requireString(errors, proof.whyNoHelper, "minimalChangeProof.whyNoHelper");
  requireString(errors, proof.whyNoAdapter, "minimalChangeProof.whyNoAdapter");
  requireString(errors, proof.whyNoFallback, "minimalChangeProof.whyNoFallback");
  requireString(errors, proof.whyNoWrapper, "minimalChangeProof.whyNoWrapper");

  if (proof.deleteOrCollapseConsidered !== true) {
    errors.push("minimalChangeProof.deleteOrCollapseConsidered must be true");
  }
}

function validateEntropy(errors, payload) {
  if (!requireObject(errors, payload.entropyDelta, "entropyDelta")) {
    return;
  }

  const delta = payload.entropyDelta;
  for (const field of [
    "newFiles",
    "newPaths",
    "newAbstractions",
    "newIndirections",
    "newStateOwners",
    "newDependencies",
    "newNormalizationSurfaces",
    "deletedFiles",
    "collapsedPaths"
  ]) {
    requireNonNegativeNumber(errors, delta[field], `entropyDelta.${field}`);
  }

  const addedEntropy =
    (delta.newFiles ?? 0) +
    (delta.newPaths ?? 0) +
    (delta.newAbstractions ?? 0) +
    (delta.newIndirections ?? 0) +
    (delta.newStateOwners ?? 0) +
    (delta.newDependencies ?? 0) +
    (delta.newNormalizationSurfaces ?? 0);

  const removedEntropy = (delta.deletedFiles ?? 0) + (delta.collapsedPaths ?? 0);

  if (addedEntropy > 0 && removedEntropy === 0 && payload.architectureUpgradeAuthorized !== true) {
    errors.push("entropyDelta adds structure without deletion/collapse evidence or architectureUpgradeAuthorized");
  }

  if ((delta.newNormalizationSurfaces ?? 0) > 0) {
    errors.push("entropyDelta.newNormalizationSurfaces must be 0");
  }
}

function validateForbiddenSurfaces(errors, payload) {
  if (!requireObject(errors, payload.forbiddenSurfaces, "forbiddenSurfaces")) {
    return;
  }

  for (const field of [
    "helperPatch",
    "adapterPatch",
    "fallbackPath",
    "wrapperChain",
    "compatibilityShim",
    "silentTolerance",
    "hiddenState",
    "hardcoding"
  ]) {
    if (payload.forbiddenSurfaces[field] !== false) {
      errors.push(`forbiddenSurfaces.${field} must be false`);
    }
  }
}

function validateTouchedPaths(errors, payload) {
  const touchedPaths = payload.touchedPaths ?? [];
  if (!Array.isArray(touchedPaths)) {
    errors.push("touchedPaths must be an array when provided");
    return;
  }

  const matches = containsForbiddenSurface(touchedPaths);
  if (matches.length > 0 && payload.architectureUpgradeAuthorized !== true) {
    errors.push(`touchedPaths contain forbidden structural surfaces: ${matches.join(", ")}`);
  }
}

function validateRepoScan(errors, payload) {
  if (!payload.repoScan) {
    return;
  }

  if (!requireObject(errors, payload.repoScan, "repoScan")) {
    return;
  }

  const files = payload.repoScan.files;
  if (!Array.isArray(files)) {
    errors.push("repoScan.files must be an array");
    return;
  }

  const filePaths = files.map((file) => isObject(file) ? file.path : null).filter(Boolean);
  const pathMatches = containsForbiddenSurface(filePaths);
  if (pathMatches.length > 0 && payload.architectureUpgradeAuthorized !== true) {
    errors.push(`repoScan paths contain forbidden structural surfaces: ${pathMatches.join(", ")}`);
  }

  for (const file of files) {
    if (!isObject(file)) {
      errors.push("repoScan.files entries must be objects");
      continue;
    }
    requireString(errors, file.path, "repoScan.files[].path");

    if (typeof file.content !== "string") {
      continue;
    }

    for (const rule of FORBIDDEN_CODE_PATTERNS) {
      if (rule.pattern.test(file.content)) {
        errors.push(`${file.path}: ${rule.message} (${rule.id})`);
      }
    }
  }

  const delta = payload.repoScan.entropyDelta;
  if (isObject(delta)) {
    const newFiles = delta.newFiles ?? 0;
    const deletedFiles = delta.deletedFiles ?? 0;
    requireNonNegativeNumber(errors, newFiles, "repoScan.entropyDelta.newFiles");
    requireNonNegativeNumber(errors, deletedFiles, "repoScan.entropyDelta.deletedFiles");
    if (newFiles > 0 && deletedFiles === 0 && payload.architectureUpgradeAuthorized !== true) {
      errors.push("repoScan adds files without deletion evidence or architectureUpgradeAuthorized");
    }
  }

  validateStructuralDiff(errors, payload.repoScan);
  validateTopology(errors, payload.repoScan);
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

function stripKnownExtension(value) {
  return value.replace(/\.(cjs|js|jsx|mjs|ts|tsx|json)$/i, "");
}

function dirname(value) {
  const normalized = normalizePath(value);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  return stripKnownExtension(normalizePath(path.posix.normalize(path.posix.join(dirname(fromFile), specifier))));
}

function layerForPath(filePath, layers) {
  const normalized = normalizePath(filePath);
  for (const layer of layers) {
    const root = normalizePath(layer.root);
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      return layer.name;
    }
  }
  return null;
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  for (const match of content.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (specifier) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function validateTopology(errors, repoScan) {
  const topology = repoScan.topology;
  if (topology === null || topology === undefined) {
    return;
  }

  if (!requireObject(errors, topology, "repoScan.topology")) {
    return;
  }

  const layers = Array.isArray(topology.layers) ? topology.layers : [];
  const layerNames = new Set(layers.map((layer) => layer?.name).filter(Boolean));
  const allowedImports = isObject(topology.allowedImports) ? topology.allowedImports : {};
  const files = repoScan.files.filter((file) => isObject(file) && typeof file.content === "string");
  const dependencyEdges = buildDependencyEdges(files, layers, topology.owners ?? {});

  if (layers.length === 0) {
    errors.push("repoScan.topology.layers must be a non-empty array when topology is provided");
  }

  for (const layer of layers) {
    if (!isObject(layer)) {
      errors.push("repoScan.topology.layers entries must be objects");
      continue;
    }
    requireString(errors, layer.name, "repoScan.topology.layers[].name");
    requireString(errors, layer.root, "repoScan.topology.layers[].root");
  }

  for (const [fromLayer, allowed] of Object.entries(allowedImports)) {
    if (!layerNames.has(fromLayer)) {
      errors.push(`repoScan.topology.allowedImports.${fromLayer} references unknown layer`);
    }
    if (!Array.isArray(allowed)) {
      errors.push(`repoScan.topology.allowedImports.${fromLayer} must be an array`);
      continue;
    }
    for (const targetLayer of allowed) {
      if (!layerNames.has(targetLayer)) {
        errors.push(`repoScan.topology.allowedImports.${fromLayer} references unknown target layer ${targetLayer}`);
      }
    }
  }

  validateRequiredChildren(errors, repoScan, topology);
  validateAllowedRoots(errors, repoScan, topology);
  validatePublicEntrypoints(errors, dependencyEdges, topology);
  validateLayerImports(errors, dependencyEdges, allowedImports);
  validateOwnerBoundaries(errors, dependencyEdges, topology);
  validateDuplicateCapabilities(errors, repoScan, dependencyEdges, topology);
}

function validateStructuralDiff(errors, repoScan) {
  const structuralDiff = repoScan.structuralDiff;
  if (!structuralDiff) {
    return;
  }

  if (!requireObject(errors, structuralDiff, "repoScan.structuralDiff")) {
    return;
  }

  for (const field of ["addedFiles", "modifiedFiles", "deletedFiles", "addedDirectories", "addedLayerRoots", "addedOwnerRoots"]) {
    if (!Array.isArray(structuralDiff[field])) {
      errors.push(`repoScan.structuralDiff.${field} must be an array`);
    }
  }
}

function buildDependencyEdges(files, layers, owners) {
  const ownerRules = compileOwnerRules(owners);
  const edges = [];

  for (const file of files) {
    const fromPath = normalizePath(file.path);
    const fromLayer = layerForPath(fromPath, layers);
    const fromOwner = ownerForPath(fromPath, ownerRules);

    for (const specifier of extractImportSpecifiers(file.content)) {
      const resolved = resolveRelativeImport(fromPath, specifier);
      const targetPath = resolved ?? specifier;
      edges.push({
        fromPath,
        fromLayer,
        fromOwner,
        specifier,
        targetPath,
        targetLayer: resolved ? layerForPath(resolved, layers) : null,
        targetOwner: resolved ? ownerForPath(resolved, ownerRules) : null,
        relative: resolved !== null
      });
    }
  }

  return edges;
}

function compileOwnerRules(owners) {
  if (!isObject(owners)) {
    return [];
  }

  return Object.entries(owners).map(([glob, owner]) => ({
    glob: normalizePath(glob),
    owner: String(owner)
  }));
}

function ownerForPath(filePath, ownerRules) {
  const normalized = normalizePath(filePath);
  for (const rule of ownerRules) {
    if (globMatches(rule.glob, normalized)) {
      return rule.owner;
    }
  }
  return null;
}

function globMatches(glob, filePath) {
  const normalizedGlob = normalizePath(glob);
  if (normalizedGlob.endsWith("/**")) {
    const prefix = normalizedGlob.slice(0, -3);
    return filePath === prefix || filePath.startsWith(`${prefix}/`);
  }
  if (normalizedGlob.endsWith("/*")) {
    const prefix = normalizedGlob.slice(0, -2);
    const rest = filePath.startsWith(`${prefix}/`) ? filePath.slice(prefix.length + 1) : null;
    return rest !== null && rest.length > 0 && !rest.includes("/");
  }
  return filePath === normalizedGlob || filePath.startsWith(`${normalizedGlob}/`);
}

function validateRequiredChildren(errors, repoScan, topology) {
  const requiredChildren = Array.isArray(topology.requiredChildren) ? topology.requiredChildren : [];
  if (requiredChildren.length === 0) {
    return;
  }

  const filePaths = repoScan.files.map((file) => normalizePath(file.path ?? ""));
  for (const rule of requiredChildren) {
    if (!isObject(rule)) {
      errors.push("repoScan.topology.requiredChildren entries must be objects");
      continue;
    }
    requireString(errors, rule.parentGlob, "repoScan.topology.requiredChildren[].parentGlob");
    requireArray(errors, rule.children, "repoScan.topology.requiredChildren[].children");

    const prefix = normalizePath(rule.parentGlob).replace(/\*$/, "");
    const parents = new Set();
    for (const filePath of filePaths) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }
      const rest = filePath.slice(prefix.length);
      const segment = rest.split("/").filter(Boolean)[0];
      if (segment) {
        parents.add(`${prefix}${segment}`);
      }
    }

    for (const parent of parents) {
      for (const child of rule.children) {
        const childPrefix = `${parent}/${normalizePath(child)}`;
        if (!filePaths.some((filePath) => filePath === childPrefix || filePath.startsWith(`${childPrefix}/`))) {
          errors.push(`${parent} missing required child ${child}`);
        }
      }
    }
  }
}

function validatePublicEntrypoints(errors, dependencyEdges, topology) {
  const publicEntrypoints = Array.isArray(topology.publicEntrypoints) ? topology.publicEntrypoints : [];
  if (publicEntrypoints.length === 0) {
    return;
  }

  const entrySet = new Set(publicEntrypoints.map(normalizePath).map(stripKnownExtension));

  for (const edge of dependencyEdges) {
    if (edge.relative && edge.targetPath.includes("/internal/") && !entrySet.has(edge.targetPath)) {
      errors.push(`${edge.fromPath}: imports internal path ${edge.specifier} instead of a public entrypoint`);
    }
  }
}

function validateLayerImports(errors, dependencyEdges, allowedImports) {
  for (const edge of dependencyEdges) {
    if (!edge.fromLayer || !edge.targetLayer) {
      continue;
    }

    const allowed = new Set(allowedImports[edge.fromLayer] ?? []);
    allowed.add(edge.fromLayer);
    if (!allowed.has(edge.targetLayer)) {
      errors.push(`${edge.fromPath}: ${edge.fromLayer} cannot import ${edge.targetLayer} via ${edge.specifier}`);
    }
  }
}

function validateAllowedRoots(errors, repoScan, topology) {
  const allowedRoots = Array.isArray(topology.allowedRoots) ? topology.allowedRoots.map(normalizePath) : [];
  if (allowedRoots.length === 0) {
    return;
  }

  for (const file of repoScan.files) {
    const filePath = normalizePath(file.path ?? "");
    if (!allowedRoots.some((root) => filePath === root || filePath.startsWith(`${root}/`))) {
      errors.push(`${filePath}: path is outside topology.allowedRoots`);
    }
  }
}

function validateOwnerBoundaries(errors, dependencyEdges, topology) {
  const owners = topology.owners;
  if (!isObject(owners)) {
    return;
  }

  const allowedOwnerImports = isObject(topology.allowedOwnerImports) ? topology.allowedOwnerImports : {};
  for (const edge of dependencyEdges) {
    if (!edge.fromOwner || !edge.targetOwner || edge.fromOwner === edge.targetOwner) {
      continue;
    }

    const allowed = new Set(allowedOwnerImports[edge.fromOwner] ?? []);
    if (!allowed.has(edge.targetOwner)) {
      errors.push(`${edge.fromPath}: owner ${edge.fromOwner} cannot import owner ${edge.targetOwner} via ${edge.specifier}`);
    }
  }
}

function validateDuplicateCapabilities(errors, repoScan, dependencyEdges, topology) {
  if (topology.duplicateCapabilities === false) {
    return;
  }

  const ownerRules = compileOwnerRules(topology.owners ?? {});
  const groups = new Map();

  for (const file of repoScan.files) {
    if (!isObject(file)) {
      continue;
    }

    const filePath = normalizePath(file.path ?? "");
    const owner = ownerForPath(filePath, ownerRules) ?? "unowned";
    const capability = capabilityForPath(filePath);
    if (!capability) {
      continue;
    }

    const key = `${owner}:${capability}`;
    const current = groups.get(key) ?? [];
    current.push(filePath);
    groups.set(key, current);
  }

  for (const [key, paths] of groups.entries()) {
    if (paths.length > 1) {
      errors.push(`duplicate capability ${key} appears in ${paths.join(", ")}`);
    }
  }
}

function capabilityForPath(filePath) {
  const baseName = path.posix.basename(normalizePath(filePath)).toLowerCase();
  for (const term of DUPLICATE_CAPABILITY_TERMS) {
    if (baseName.includes(term)) {
      return term;
    }
  }
  return null;
}

function main() {
  const payload = ARGS.mode === "proof"
    ? JSON.parse(readInput())
    : buildRepoScanPayload(ARGS.repoRoot, ARGS.mode);
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  if (ARGS.mode === "proof") {
    validateCanonicalPath(errors, payload);
    validateRootCause(errors, payload);
    validateMinimalChange(errors, payload);
    validateEntropy(errors, payload);
    validateForbiddenSurfaces(errors, payload);
    validateTouchedPaths(errors, payload);
  }
  validateRepoScan(errors, payload);

  const output = {
    ok: errors.length === 0,
    verdict: errors.length === 0 ? "allow" : "block",
    gateFamily: "structural-laws",
    mode: ARGS.mode,
    enforcedPolicy: [
      "GATE-TRUTH-002",
      "GATE-TRUTH-003",
      "GATE-TRUTH-004",
      "GATE-ROOT-CAUSE-002",
      "GATE-STRUCTURE-001",
      "GATE-STRUCTURAL-ABSOLUTISM-001",
      "GATE-STRUCTURAL-ABSOLUTISM-002",
      "GATE-STRUCTURAL-ABSOLUTISM-003",
      "GATE-STRUCTURAL-ABSOLUTISM-004",
      "GATE-STRUCTURAL-ABSOLUTISM-005",
      "GATE-STRUCTURAL-ABSOLUTISM-006",
      "GATE-STRUCTURAL-ABSOLUTISM-007"
    ],
    facts: {
      structuralDiff: payload.repoScan?.structuralDiff ?? null
    },
    errors
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
