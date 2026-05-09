import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masterControlPath = path.join(repoRoot, "MASTER-CONTROL.json");
const executionGatesConfigPath = path.join(repoRoot, "config", "execution-gates.json");
const ruleFiles = [
  path.join(repoRoot, "rules", "commit-rules.md"),
  path.join(repoRoot, "rules", "push-rules.md"),
  path.join(repoRoot, "rules", "verification-rules.md"),
  path.join(repoRoot, "rules", "deploy-rules.md")
];
const policyRoot = path.resolve("C:\\Users\\ASUS-KL\\.codex\\policy");
const gateRegistryPath = path.join(policyRoot, "gate-registry.json");
const policyMapPath = path.join(policyRoot, "policy-map.json");
const syncReportSchemaPath = path.join(repoRoot, "schemas", "sync-report.schema.json");
const syncValidationSchemaPath = path.join(repoRoot, "schemas", "sync-validation-result.schema.json");
const cliArgs = new Set(process.argv.slice(2));
const dryRun = cliArgs.has("--dry-run") || cliArgs.has("--report");
const reportMode = cliArgs.has("--report");
const printSchemaPathOnly = cliArgs.has("--schema");
const validateReportMode = cliArgs.has("--validate-report");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function previewJson(before, after) {
  const beforeText = JSON.stringify(before, null, 2);
  const afterText = JSON.stringify(after, null, 2);
  return {
    beforeBytes: Buffer.byteLength(beforeText, "utf8"),
    afterBytes: Buffer.byteLength(afterText, "utf8"),
    changed: beforeText !== afterText
  };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSyncReport(report) {
  const errors = [];

  if (report?.ok !== true) {
    errors.push("ok must be true");
  }

  if (report?.schemaVersion !== "1.0.0") {
    errors.push("schemaVersion must be 1.0.0");
  }

  if (!["write", "dry-run", "report"].includes(report?.mode)) {
    errors.push("mode must be one of write, dry-run, report");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(report?.derivedDate ?? "")) {
    errors.push("derivedDate must match YYYY-MM-DD");
  }

  if (!isObject(report?.counts)) {
    errors.push("counts must be an object");
  } else {
    for (const key of ["generatedGates", "preservedGates", "totalBefore", "totalAfter"]) {
      if (!Number.isInteger(report.counts[key]) || report.counts[key] < 0) {
        errors.push(`counts.${key} must be a non-negative integer`);
      }
    }
  }

  if (!isObject(report?.derivedGroups)) {
    errors.push("derivedGroups must be an object");
  } else {
    for (const key of ["executionGates", "commitRules", "pushRules", "verifyRules", "deployRules"]) {
      if (!Array.isArray(report.derivedGroups[key])) {
        errors.push(`derivedGroups.${key} must be an array`);
        continue;
      }
      for (const gateId of report.derivedGroups[key]) {
        if (!/^GATE-[A-Z0-9-]+$/.test(gateId)) {
          errors.push(`derivedGroups.${key} contains invalid gate id: ${gateId}`);
        }
      }
    }
  }

  if (!isObject(report?.artifacts)) {
    errors.push("artifacts must be an object");
  } else {
    for (const key of ["masterControlSha256", "executionGatesSha256"]) {
      if (!/^[a-f0-9]{64}$/.test(report.artifacts[key] ?? "")) {
        errors.push(`artifacts.${key} must be a 64-char lowercase sha256`);
      }
    }
    if (!Array.isArray(report.artifacts.ruleSources) || report.artifacts.ruleSources.length === 0) {
      errors.push("artifacts.ruleSources must be a non-empty array");
    }
  }

  if (!isObject(report?.preview)) {
    errors.push("preview must be an object");
  } else {
    for (const key of ["gateRegistry", "policyMap"]) {
      const entry = report.preview[key];
      if (!isObject(entry)) {
        errors.push(`preview.${key} must be an object`);
        continue;
      }
      for (const field of ["beforeBytes", "afterBytes"]) {
        if (!Number.isInteger(entry[field]) || entry[field] < 0) {
          errors.push(`preview.${key}.${field} must be a non-negative integer`);
        }
      }
      if (typeof entry.changed !== "boolean") {
        errors.push(`preview.${key}.changed must be a boolean`);
      }
    }
  }

  if (!isObject(report?.pathExistenceValidation)) {
    errors.push("pathExistenceValidation must be an object");
  } else {
    if (typeof report.pathExistenceValidation.ok !== "boolean") {
      errors.push("pathExistenceValidation.ok must be a boolean");
    }
    if (!Number.isInteger(report.pathExistenceValidation.checkedTargets) || report.pathExistenceValidation.checkedTargets < 0) {
      errors.push("pathExistenceValidation.checkedTargets must be a non-negative integer");
    }
    if (!Array.isArray(report.pathExistenceValidation.missingTargets)) {
      errors.push("pathExistenceValidation.missingTargets must be an array");
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function validateGateRegistry(value) {
  const errors = [];

  if (!isObject(value)) {
    return { ok: false, errors: ["gateRegistry must be an object"] };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.lastUpdated ?? "")) {
    errors.push("gateRegistry.lastUpdated must match YYYY-MM-DD");
  }

  if (!["draft", "active", "deprecated"].includes(value.status)) {
    errors.push("gateRegistry.status must be draft, active, or deprecated");
  }

  if (!Array.isArray(value.precedence) || value.precedence.length === 0) {
    errors.push("gateRegistry.precedence must be a non-empty array");
  }

  if (!isObject(value.owners)) {
    errors.push("gateRegistry.owners must be an object");
  } else {
    if (typeof value.owners.policyDocs !== "string" || !value.owners.policyDocs) {
      errors.push("gateRegistry.owners.policyDocs must be a non-empty string");
    }
    if (!Array.isArray(value.owners.executableGateRoots) || value.owners.executableGateRoots.length === 0) {
      errors.push("gateRegistry.owners.executableGateRoots must be a non-empty array");
    }
    if (typeof value.owners.executionControlSource !== "string" || !value.owners.executionControlSource) {
      errors.push("gateRegistry.owners.executionControlSource must be a non-empty string");
    }
    if (!["authoritative", "mirror", "derived-registry"].includes(value.owners.registryRole)) {
      errors.push("gateRegistry.owners.registryRole must be authoritative, mirror, or derived-registry");
    }
  }

  if (!Array.isArray(value.gates) || value.gates.length === 0) {
    errors.push("gateRegistry.gates must be a non-empty array");
  } else {
    for (const [index, gate] of value.gates.entries()) {
      if (!isObject(gate)) {
        errors.push(`gateRegistry.gates[${index}] must be an object`);
        continue;
      }
      if (!/^(GATE|DEFAULT)-[A-Z0-9-]+$/.test(gate.id ?? "")) {
        errors.push(`gateRegistry.gates[${index}].id is invalid`);
      }
      if (!["hard", "default", "runtime-derived"].includes(gate.class)) {
        errors.push(`gateRegistry.gates[${index}].class is invalid`);
      }
      if (!Array.isArray(gate.appliesTo) || gate.appliesTo.length === 0) {
        errors.push(`gateRegistry.gates[${index}].appliesTo must be a non-empty array`);
      }
      if (!Array.isArray(gate.enforcedBy)) {
        errors.push(`gateRegistry.gates[${index}].enforcedBy must be an array`);
      }
    }
  }

  if (!isObject(value.derivedFrom)) {
    errors.push("gateRegistry.derivedFrom must be an object");
  }

  return { ok: errors.length === 0, errors };
}

function validatePolicyMap(value) {
  const errors = [];

  if (!isObject(value)) {
    return { ok: false, errors: ["policyMap must be an object"] };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.lastUpdated ?? "")) {
    errors.push("policyMap.lastUpdated must match YYYY-MM-DD");
  }

  if (!["draft", "active", "deprecated"].includes(value.status)) {
    errors.push("policyMap.status must be draft, active, or deprecated");
  }

  if (!isObject(value.layers) || Object.keys(value.layers).length === 0) {
    errors.push("policyMap.layers must be a non-empty object");
  }

  if (!isObject(value.agentEntries)) {
    errors.push("policyMap.agentEntries must be an object");
  } else {
    for (const entryName of ["codex", "claude"]) {
      const entry = value.agentEntries[entryName];
      if (!isObject(entry)) {
        errors.push(`policyMap.agentEntries.${entryName} must be an object`);
        continue;
      }
      if (typeof entry.path !== "string" || !entry.path) {
        errors.push(`policyMap.agentEntries.${entryName}.path must be a non-empty string`);
      }
      if (typeof entry.role !== "string" || !entry.role) {
        errors.push(`policyMap.agentEntries.${entryName}.role must be a non-empty string`);
      }
      if (!Array.isArray(entry.reads) || entry.reads.length === 0) {
        errors.push(`policyMap.agentEntries.${entryName}.reads must be a non-empty array`);
      }
    }
  }

  if (!isObject(value.policyFamilies)) {
    errors.push("policyMap.policyFamilies must be an object");
  } else {
    for (const familyName of ["executionModes", "antiOverengineering", "frontendDesign", "executionGraphRuntime", "executionKernel"]) {
      const family = value.policyFamilies[familyName];
      if (!isObject(family)) {
        errors.push(`policyMap.policyFamilies.${familyName} must be an object`);
        continue;
      }
      if (typeof family.sourceDoc !== "string" || !family.sourceDoc) {
        errors.push(`policyMap.policyFamilies.${familyName}.sourceDoc must be a non-empty string`);
      }
      if (!Array.isArray(family.notes) || family.notes.length === 0) {
        errors.push(`policyMap.policyFamilies.${familyName}.notes must be a non-empty array`);
      }
      for (const optionalArray of ["gateIds", "checkers", "schemas"]) {
        if (family[optionalArray] !== undefined && !Array.isArray(family[optionalArray])) {
          errors.push(`policyMap.policyFamilies.${familyName}.${optionalArray} must be an array when present`);
        }
      }
    }
  }

  if (!isObject(value.sharedRuntime)) {
    errors.push("policyMap.sharedRuntime must be an object");
  } else {
    if (typeof value.sharedRuntime.memory !== "string" || !value.sharedRuntime.memory) {
      errors.push("policyMap.sharedRuntime.memory must be a non-empty string");
    }
    if (typeof value.sharedRuntime.orchestrator !== "string" || !value.sharedRuntime.orchestrator) {
      errors.push("policyMap.sharedRuntime.orchestrator must be a non-empty string");
    }
  }

  if (!isObject(value.executableGates)) {
    errors.push("policyMap.executableGates must be an object");
  } else {
    if (!Array.isArray(value.executableGates.roots) || value.executableGates.roots.length === 0) {
      errors.push("policyMap.executableGates.roots must be a non-empty array");
    }
    if (!Array.isArray(value.executableGates.mappingNotes) || value.executableGates.mappingNotes.length === 0) {
      errors.push("policyMap.executableGates.mappingNotes must be a non-empty array");
    }
    if (!isObject(value.executableGates.authority)) {
      errors.push("policyMap.executableGates.authority must be an object");
    } else {
      if (
        typeof value.executableGates.authority.executionBehaviorSource !== "string" ||
        !value.executableGates.authority.executionBehaviorSource
      ) {
        errors.push("policyMap.executableGates.authority.executionBehaviorSource must be a non-empty string");
      }
      if (
        !["authoritative", "mirror", "derived-registry"].includes(
          value.executableGates.authority.policyRegistryRole
        )
      ) {
        errors.push("policyMap.executableGates.authority.policyRegistryRole is invalid");
      }
    }
  }

  if (!isObject(value.governingDocs)) {
    errors.push("policyMap.governingDocs must be an object");
  } else {
    for (const key of ["readme", "project", "index", "executionKernel", "runtimeModel"]) {
      if (typeof value.governingDocs[key] !== "string" || !value.governingDocs[key]) {
        errors.push(`policyMap.governingDocs.${key} must be a non-empty string`);
      }
    }
    for (const optionalKey of ["executionGraphRuntime"]) {
      if (
        value.governingDocs[optionalKey] !== undefined &&
        (typeof value.governingDocs[optionalKey] !== "string" || !value.governingDocs[optionalKey])
      ) {
        errors.push(`policyMap.governingDocs.${optionalKey} must be a non-empty string when present`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateMappedPaths(gateRegistry, policyMap) {
  const missingTargets = [];
  const seen = new Set();

  function record(target, source, kind) {
    if (typeof target !== "string" || !target) {
      return;
    }
    const key = `${kind}::${source}::${target}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    if (!fs.existsSync(target)) {
      missingTargets.push({ kind, source, target });
    }
  }

  for (const gate of gateRegistry.gates ?? []) {
    for (const target of gate.enforcedBy ?? []) {
      record(target, gate.id ?? "unknown-gate", "gateRegistry.enforcedBy");
    }
  }

  for (const [gateId, targets] of Object.entries(policyMap.gateToExecutable ?? {})) {
    if (!Array.isArray(targets)) {
      continue;
    }
    for (const target of targets) {
      record(target, gateId, "policyMap.gateToExecutable");
    }
  }

  return {
    ok: missingTargets.length === 0,
    checkedTargets: seen.size,
    missingTargets
  };
}

function toDateOnly(input) {
  return new Date(input).toISOString().slice(0, 10);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function makeGateId(prefix, index) {
  return `GATE-${prefix}-${String(index).padStart(3, "0")}`;
}

function summarizeChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return "No explicit checks declared.";
  }
  return `Checks: ${checks.join(", ")}.`;
}

function extractMarkdownRules(filePath, prefix) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const items = [];
  let currentTitle = null;
  let currentRule = null;

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+\d+\.\s+(.+)$/);
    if (headingMatch) {
      if (currentTitle && currentRule) {
        items.push({ title: currentTitle, rule: currentRule });
      }
      currentTitle = headingMatch[1].trim();
      currentRule = null;
      continue;
    }

    const ruleMatch = line.match(/^\*\*规则\*\*:\s*(.+)$/);
    if (ruleMatch) {
      currentRule = ruleMatch[1].trim();
    }
  }

  if (currentTitle && currentRule) {
    items.push({ title: currentTitle, rule: currentRule });
  }

  return items.map((item, index) => ({
    id: makeGateId(prefix, index + 1),
    class: "runtime-derived",
    topic: `${prefix.toLowerCase()}-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    appliesTo: ["both"],
    sourceDoc: filePath,
    summary: item.rule,
    enforcedBy: []
  }));
}

function buildExecutionGateEntries(config) {
  const entries = [];
  const gateNames = config.gate_execution_order ?? Object.keys(config.gates ?? {});

  gateNames.forEach((gateName, index) => {
    const gate = config.gates?.[gateName];
    if (!gate) {
      return;
    }

    entries.push({
      id: makeGateId(`EXEC-${gateName.replace(/_/g, "-").toUpperCase()}`, index + 1),
      class: "runtime-derived",
      topic: `execution-gate-${gateName}`,
      appliesTo: ["both"],
      sourceDoc: executionGatesConfigPath,
      summary: `${gate.description} ${summarizeChecks(gate.checks)}`.trim(),
      enforcedBy: [path.resolve(repoRoot, "config", gate.script)]
    });
  });

  return entries;
}

function main() {
  if (printSchemaPathOnly) {
    process.stdout.write(`${syncReportSchemaPath}\n`);
    return;
  }

  const masterControlRaw = fs.readFileSync(masterControlPath, "utf8");
  const masterControl = JSON.parse(masterControlRaw);
  const executionGatesRaw = fs.readFileSync(executionGatesConfigPath, "utf8");
  const executionGates = JSON.parse(executionGatesRaw);
  const gateRegistry = readJson(gateRegistryPath);
  const policyMap = readJson(policyMapPath);

  const derivedDate = masterControl.last_updated
    ? toDateOnly(masterControl.last_updated)
    : new Date().toISOString().slice(0, 10);

  const executionGateEntries = buildExecutionGateEntries(executionGates);
  const commitRuleEntries = extractMarkdownRules(ruleFiles[0], "COMMIT-RULE");
  const pushRuleEntries = extractMarkdownRules(ruleFiles[1], "PUSH-RULE");
  const verifyRuleEntries = extractMarkdownRules(ruleFiles[2], "VERIFY-RULE");
  const deployRuleEntries = extractMarkdownRules(ruleFiles[3], "DEPLOY-RULE");

  const generatedGates = [
    ...executionGateEntries,
    ...commitRuleEntries,
    ...pushRuleEntries,
    ...verifyRuleEntries,
    ...deployRuleEntries
  ];
  const generatedIds = new Set(generatedGates.map((gate) => gate.id));
  const preservedGates = (gateRegistry.gates ?? []).filter((gate) => !generatedIds.has(gate.id));

  const nextGateRegistry = structuredClone(gateRegistry);
  const nextPolicyMap = structuredClone(policyMap);

  nextGateRegistry.lastUpdated = derivedDate;
  nextGateRegistry.status = "active";
  nextGateRegistry.owners = {
    ...nextGateRegistry.owners,
    executionControlSource: masterControlPath,
    registryRole: "derived-registry"
  };
  nextGateRegistry.derivedFrom = {
    source: masterControlPath,
    sourceSha256: sha256Text(masterControlRaw),
    sourceVersion: masterControl.version ?? null,
    sourceUpdatedAt: masterControl.last_updated ?? null,
    currentMode: masterControl.behavior_modes?.current_mode ?? null,
    syncManagedBy: path.join(repoRoot, "tools", "sync-all.mjs"),
    executionGatesSource: executionGatesConfigPath,
    executionGatesSha256: sha256Text(executionGatesRaw),
    ruleSources: ruleFiles
  };
  nextGateRegistry.gates = [...preservedGates, ...generatedGates];

  if (nextPolicyMap.executableGates?.authority) {
    nextPolicyMap.executableGates.authority.executionBehaviorSource = masterControlPath;
    nextPolicyMap.executableGates.authority.policyRegistryRole = "derived-registry";
  }

  if (Array.isArray(nextPolicyMap.executableGates?.mappingNotes)) {
    const requiredNote =
      "registry refresh is performed by unified-gates/tools/sync-all.mjs using MASTER-CONTROL.json as the execution authority";
    if (!nextPolicyMap.executableGates.mappingNotes.includes(requiredNote)) {
      nextPolicyMap.executableGates.mappingNotes.push(requiredNote);
    }
  }

  const report = {
    ok: true,
    schemaVersion: "1.0.0",
    mode: dryRun ? (reportMode ? "report" : "dry-run") : "write",
    masterControlPath,
    gateRegistryPath,
    policyMapPath,
    derivedDate,
    currentMode: nextGateRegistry.derivedFrom.currentMode,
    counts: {
      generatedGates: generatedGates.length,
      preservedGates: preservedGates.length,
      totalBefore: gateRegistry.gates?.length ?? 0,
      totalAfter: nextGateRegistry.gates?.length ?? 0
    },
    derivedGroups: {
      executionGates: executionGateEntries.map((gate) => gate.id),
      commitRules: commitRuleEntries.map((gate) => gate.id),
      pushRules: pushRuleEntries.map((gate) => gate.id),
      verifyRules: verifyRuleEntries.map((gate) => gate.id),
      deployRules: deployRuleEntries.map((gate) => gate.id)
    },
    artifacts: {
      masterControlSha256: sha256Text(masterControlRaw),
      executionGatesSha256: sha256Text(executionGatesRaw),
      ruleSources: ruleFiles
    },
    preview: {
      gateRegistry: previewJson(gateRegistry, nextGateRegistry),
      policyMap: previewJson(policyMap, nextPolicyMap)
    },
    pathExistenceValidation: validateMappedPaths(nextGateRegistry, nextPolicyMap),
    policyArtifactValidation: {
      gateRegistry: validateGateRegistry(nextGateRegistry),
      policyMap: validatePolicyMap(nextPolicyMap)
    }
  };

  if (validateReportMode) {
    const validation = validateSyncReport(report);
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          schemaVersion: "1.0.0",
          mode: "validate-report",
          schemaPath: syncReportSchemaPath,
          validationSchemaPath: syncValidationSchemaPath,
          reportMode: report.mode,
          valid: validation.ok,
          validationErrors: validation.errors,
          pathExistenceValidation: report.pathExistenceValidation,
          policyArtifactValidation: report.policyArtifactValidation
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (!dryRun) {
    writeJson(gateRegistryPath, nextGateRegistry);
    writeJson(policyMapPath, nextPolicyMap);
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
