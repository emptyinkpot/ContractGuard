import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildDecisionResult } from "../../shared/decision-result.mjs";

function parseArgs(argv) {
  const args = {
    repoRoot: ".",
    policyPath: null,
    docs: [],
    inputFiles: [],
    responseFile: null,
    planFile: null,
    diffFile: null,
    commandsFile: null,
    changedFilesFile: null,
    jsonOut: null,
    selfTest: false,
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
        args.repoRoot = nextValue(token, index);
        index += 1;
        break;
      case "--policy":
        args.policyPath = nextValue(token, index);
        index += 1;
        break;
      case "--doc":
        args.docs.push(nextValue(token, index));
        index += 1;
        break;
      case "--input":
        args.inputFiles.push(nextValue(token, index));
        index += 1;
        break;
      case "--response-file":
        args.responseFile = nextValue(token, index);
        index += 1;
        break;
      case "--plan-file":
        args.planFile = nextValue(token, index);
        index += 1;
        break;
      case "--diff-file":
        args.diffFile = nextValue(token, index);
        index += 1;
        break;
      case "--commands-file":
        args.commandsFile = nextValue(token, index);
        index += 1;
        break;
      case "--changed-files-file":
        args.changedFilesFile = nextValue(token, index);
        index += 1;
        break;
      case "--json-out":
        args.jsonOut = nextValue(token, index);
        index += 1;
        break;
      case "--self-test":
        args.selfTest = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function resolveAbsolute(root, candidate) {
  return path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseListText(text) {
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

const RESPONSE_FORMAT_MARKERS = ["STEP", "WHY", "ACTION", "RESULT"];

function validateResponseFormat(text, sourceLabel) {
  const lines = text.split(/\r?\n/);
  const contentCounts = new Map(RESPONSE_FORMAT_MARKERS.map((marker) => [marker, 0]));
  const seenMarkers = new Set();
  let expectedIndex = 0;
  let currentMarker = null;
  let sawMarker = false;

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    const match = trimmedLine.match(/^\[(STEP|WHY|ACTION|RESULT)\]\s*(.*)$/i);
    if (match) {
      const marker = match[1].toUpperCase();
      const markerIndex = RESPONSE_FORMAT_MARKERS.indexOf(marker);
      if (markerIndex !== expectedIndex) {
        return {
          ok: false,
          reason: `expected [${RESPONSE_FORMAT_MARKERS[expectedIndex]}] but found [${marker}]`,
          evidence: [`${sourceLabel}: ${trimmedLine}`],
        };
      }

      if (seenMarkers.has(marker)) {
        return {
          ok: false,
          reason: `duplicate [${marker}] section`,
          evidence: [`${sourceLabel}: ${trimmedLine}`],
        };
      }

      seenMarkers.add(marker);
      currentMarker = marker;
      sawMarker = true;
      expectedIndex += 1;

      if (match[2].trim().length > 0) {
        contentCounts.set(marker, contentCounts.get(marker) + 1);
      }

      continue;
    }

    if (!sawMarker) {
      return {
        ok: false,
        reason: "content appears before [STEP]",
        evidence: [`${sourceLabel}: ${trimmedLine}`],
      };
    }

    if (currentMarker === null) {
      return {
        ok: false,
        reason: "content appears outside the required sections",
        evidence: [`${sourceLabel}: ${trimmedLine}`],
      };
    }

    contentCounts.set(currentMarker, contentCounts.get(currentMarker) + 1);
  }

  for (const marker of RESPONSE_FORMAT_MARKERS) {
    if (!seenMarkers.has(marker)) {
      return {
        ok: false,
        reason: `missing [${marker}] section`,
        evidence: [`${sourceLabel}: [${marker}]`],
      };
    }
  }

  for (const marker of RESPONSE_FORMAT_MARKERS) {
    if ((contentCounts.get(marker) ?? 0) === 0) {
      return {
        ok: false,
        reason: `[${marker}] section is empty`,
        evidence: [`${sourceLabel}: [${marker}]`],
      };
    }
  }

  return {
    ok: true,
    reason: "response format is valid",
    evidence: [],
  };
}

function evaluateResponseFormat(responseEntries) {
  if (!Array.isArray(responseEntries) || responseEntries.length === 0) {
    return {
      checked: false,
      ok: true,
      findings: [],
    };
  }

  const findings = [];
  let ok = true;

  for (const entry of responseEntries) {
    const validation = validateResponseFormat(entry.text, entry.path ?? entry.label ?? "response");
    if (validation.ok) {
      continue;
    }

    ok = false;
    findings.push({
      id: "invalid_progress_format",
      category: "format",
      severity: "critical",
      penalty: 60,
      message: `响应必须按 [STEP]/[WHY]/[ACTION]/[RESULT] 顺序输出：${validation.reason}`,
      evidence: validation.evidence,
      source: entry.path ?? entry.label ?? "response",
    });
  }

  return {
    checked: true,
    ok,
    findings,
  };
}

function collectDocCandidates(repoRoot, policy, explicitDocs) {
  const resolved = [];
  for (const item of [...policy.defaultDocCandidates, ...explicitDocs]) {
    if (!item) {
      continue;
    }

    const absolutePath = resolveAbsolute(repoRoot, item);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      resolved.push(absolutePath);
    }
  }

  return unique(resolved);
}

function collectInputs(repoRoot, args) {
  const entries = [];
  const inputFiles = args.inputFiles.length > 0
    ? args.inputFiles
    : (process.env.OUTPUT_GUARD_INPUT_FILE || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
  const responseFile = args.responseFile || process.env.OUTPUT_GUARD_RESPONSE_FILE || null;
  const planFile = args.planFile || process.env.OUTPUT_GUARD_PLAN_FILE || null;
  const diffFile = args.diffFile || process.env.OUTPUT_GUARD_DIFF_FILE || null;
  const commandsFile = args.commandsFile || process.env.OUTPUT_GUARD_COMMANDS_FILE || null;
  const changedFilesFile = args.changedFilesFile || process.env.OUTPUT_GUARD_CHANGED_FILES_FILE || null;

  function pushEntry(label, candidatePath) {
    if (!candidatePath) {
      return;
    }

    const absolutePath = resolveAbsolute(repoRoot, candidatePath);
    const text = readTextIfExists(absolutePath);
    if (text === null) {
      return;
    }

    entries.push({
      label,
      path: absolutePath,
      text,
    });
  }

  for (const item of inputFiles) {
    pushEntry("input", item);
  }

  pushEntry("response", responseFile);
  pushEntry("plan", planFile);
  pushEntry("diff", diffFile);
  pushEntry("commands", commandsFile);
  pushEntry("changed_files", changedFilesFile);

  return entries;
}

function extractCanonicalBaseUrls(source) {
  const results = [];
  const lines = source.text.split(/\r?\n/);
  const urlRegex = /https?:\/\/[^\s`"'<>]+/g;
  const signalRegex = /(canonical|base\s*url|public entry|internal target|public path|入口|真源)/i;

  for (const line of lines) {
    if (!signalRegex.test(line)) {
      continue;
    }

    const matches = line.match(urlRegex) || [];
    for (const match of matches) {
      const cleaned = match.replace(/[),.;]+$/, "");
      if (/(base\s*url|base_url)/i.test(line)) {
        results.push(cleaned);
        continue;
      }

      if (/(openai\/v1|\/v1\b|\/api\/|gateway\b)/i.test(cleaned)) {
        results.push(cleaned);
      }
    }
  }

  return results;
}

function extractRequiredChecks(source, policy) {
  const results = [...policy.requiredCheckPatterns];
  const lines = source.text.split(/\r?\n/);
  const signalRegex = /(health|debug|models|requestid|traceid|upstreams|routes|status)/i;
  const routeRegex = /\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+/g;

  for (const line of lines) {
    if (!signalRegex.test(line)) {
      continue;
    }

    const backtickMatches = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    const routeMatches = line.match(routeRegex) || [];
    for (const match of [...backtickMatches, ...routeMatches]) {
      if (
        /health|debug|models|requestid|traceid|upstreams|routes|status/i.test(match)
      ) {
        results.push(match);
      }
    }
  }

  return unique(results);
}

function extractProtectedKeywords(source) {
  const candidates = [];
  const lines = source.text.split(/\r?\n/);
  const signalRegex = /(canonical|pool|gateway|provider|base[_\s-]*url|entrypoint|endpoint|routing)/i;

  for (const line of lines) {
    if (!signalRegex.test(line)) {
      continue;
    }

    const tokens = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    for (const token of tokens) {
      if (/canonical|pool|gateway|provider|base[_\s-]*url|entrypoint|endpoint|routing/i.test(token)) {
        candidates.push(token);
      }
    }
  }

  return unique(candidates);
}

function buildRules(docSources, policy) {
  const canonicalBaseUrls = [];
  const requiredCheckPatterns = [];
  const protectedKeywords = [];

  for (const source of docSources) {
    canonicalBaseUrls.push(...extractCanonicalBaseUrls(source));
    requiredCheckPatterns.push(...extractRequiredChecks(source, policy));
    protectedKeywords.push(...extractProtectedKeywords(source));
  }

  const apiLikeBaseUrls = unique(canonicalBaseUrls).filter((item) =>
    /(openai\/v1|\/api\/key-guard\/gateway|\/v1\b)/i.test(item),
  );

  return {
    canonicalBaseUrls: apiLikeBaseUrls,
    requiredCheckPatterns: unique(requiredCheckPatterns),
    protectedKeywords: unique(protectedKeywords),
  };
}

function compilePolicy(policy) {
  return {
    ...policy,
    rules: policy.rules.map((rule) => ({
      ...rule,
      regex: new RegExp(rule.pattern, "i"),
    })),
    hardBlockRules: policy.hardBlockRules.map((rule) => ({
      ...rule,
      regex: new RegExp(rule.pattern, "i"),
    })),
    boundaryFilePatterns: policy.boundaryFilePatterns.map((value) => value.toLowerCase()),
    documentationFilePatterns: (policy.documentationFilePatterns || []).map((value) => value.toLowerCase()),
    documentationExampleLinePatterns: (policy.documentationExampleLinePatterns || []).map(
      (pattern) => new RegExp(pattern, "i"),
    ),
  };
}

function isDocumentationFile(filePath, compiledPolicy) {
  const normalized = normalizeSlashes(filePath).toLowerCase();
  return compiledPolicy.documentationFilePatterns.some((pattern) => normalized.includes(pattern));
}

function isDocumentationExampleLine(line, facts, compiledPolicy) {
  if (!facts.hasDocumentationChanges) {
    return false;
  }

  const trimmed = line.trim();
  return compiledPolicy.documentationExampleLinePatterns.some((regex) => regex.test(trimmed));
}

function evidenceForPattern(text, regex, facts, compiledPolicy) {
  const lines = text.split(/\r?\n/);
  const evidence = [];

  for (const line of lines) {
    if (regex.test(line)) {
      if (isDocumentationExampleLine(line, facts, compiledPolicy)) {
        continue;
      }
      evidence.push(line.trim());
      if (evidence.length >= 3) {
        break;
      }
    }
  }

  return evidence;
}

function summarizeFacts(inputEntries, compiledPolicy, rules) {
  const combinedText = inputEntries
    .map((entry) => `# ${entry.label}\n${entry.text}`)
    .join("\n\n");
  const changedFilesEntry = inputEntries.find((entry) => entry.label === "changed_files");
  const changedFiles = changedFilesEntry ? parseListText(changedFilesEntry.text) : [];
  const responseEntries = inputEntries.filter((entry) => entry.label === "response");
  const normalizedFiles = changedFiles.map((item) => normalizeSlashes(item).toLowerCase());
  const hasDocumentationChanges = normalizedFiles.some((item) => isDocumentationFile(item, compiledPolicy));
  const docsOnlyChanges = normalizedFiles.length > 0
    && normalizedFiles.every((item) => isDocumentationFile(item, compiledPolicy));
  const touchesBoundaryFiles = normalizedFiles.some((item) =>
    compiledPolicy.boundaryFilePatterns.some((pattern) => item.includes(pattern)),
  );
  const touchesBoundaryText = /(routing|ingress|proxy|provider|base[_\s-]*url|endpoint|entrypoint|gateway|pool)/i.test(combinedText);
  const verificationSignals = unique(
    rules.requiredCheckPatterns.filter((pattern) => pattern && combinedText.includes(pattern)),
  );

  return {
    combinedText,
    changedFiles,
    hasDocumentationChanges,
    docsOnlyChanges,
    hasResponseInput: responseEntries.length > 0,
    touchesBoundary: touchesBoundaryFiles || touchesBoundaryText,
    verificationSignals,
    hasAnyInput: combinedText.trim().length > 0,
  };
}

function createFinding(base, evidence) {
  return {
    id: base.id,
    category: base.category,
    severity: base.severity,
    penalty: base.penalty ?? 0,
    message: base.message,
    evidence,
  };
}

function evaluateBehavior(inputEntries, compiledPolicy, rules) {
  const facts = summarizeFacts(inputEntries, compiledPolicy, rules);
  const findings = [];
  let score = 100;

  if (!facts.hasAnyInput) {
    findings.push({
      id: "missing_ai_input",
      category: "process",
      severity: "medium",
      penalty: 30,
      message: "未提供 AI plan/diff/commands/changed-files 输入，本次仅能做 readiness 级检查。",
      evidence: [],
    });
    return {
      score: 70,
      verdict: "review",
      findings,
      facts,
      hardBlockMatched: false,
    };
  }

  let hardBlockMatched = false;
  for (const rule of compiledPolicy.hardBlockRules) {
    const evidence = evidenceForPattern(facts.combinedText, rule.regex, facts, compiledPolicy);
    if (evidence.length === 0) {
      continue;
    }

    findings.push(createFinding(rule, evidence));
    hardBlockMatched = true;
  }

  const responseEntries = inputEntries.filter((entry) => entry.label === "response");
  const responseFormatEvaluation = evaluateResponseFormat(responseEntries);
  if (responseFormatEvaluation.checked && !responseFormatEvaluation.ok) {
    for (const finding of responseFormatEvaluation.findings) {
      findings.push(finding);
    }
    hardBlockMatched = true;
    score -= 60;
  }

  for (const rule of compiledPolicy.rules) {
    const evidence = evidenceForPattern(facts.combinedText, rule.regex, facts, compiledPolicy);
    if (evidence.length === 0) {
      continue;
    }

    findings.push(createFinding(rule, evidence));
    score -= rule.penalty;
  }

  const baseUrlRegex = /\bbase_url\b|\bbaseUrl\b|https?:\/\/[^\s`"'<>]+/i;
  const mentionedUrls = unique(
    facts.combinedText
      .split(/\r?\n/)
      .filter((line) => !isDocumentationExampleLine(line, facts, compiledPolicy))
      .flatMap((line) => [...line.matchAll(/https?:\/\/[^\s`"'<>]+/g)].map((match) =>
        match[0].replace(/[),.;]+$/, ""))),
  );
  if (baseUrlRegex.test(facts.combinedText) && rules.canonicalBaseUrls.length > 0) {
    const nonCanonicalUrls = mentionedUrls.filter((item) => !rules.canonicalBaseUrls.includes(item));
    if (nonCanonicalUrls.length > 0) {
      findings.push({
        id: "noncanonical_base_url",
        category: "path",
        severity: "critical",
        penalty: 40,
        message: `检测到可能偏离 canonical base URL 的语义；当前 canonical 候选为 ${rules.canonicalBaseUrls.join(", ")}`,
        evidence: nonCanonicalUrls.slice(0, 3),
      });
      score -= 40;
      hardBlockMatched = true;
    }
  }

  if (facts.touchesBoundary && facts.verificationSignals.length === 0 && !facts.docsOnlyChanges) {
    findings.push({
      id: "missing_required_checks",
      category: "observability",
      severity: "high",
      penalty: 20,
      message: "触及高风险边界但没有体现 health/debug/models/request tracing 级验证。",
      evidence: rules.requiredCheckPatterns.slice(0, 5),
    });
    score -= 20;
  }

  if (facts.verificationSignals.length > 0) {
    score = Math.min(100, score + 5);
  }

  let verdict = "allow";
  if (hardBlockMatched || score < 65) {
    verdict = "block";
  } else if (score < 85) {
    verdict = "review";
  }

  return {
    score,
    verdict,
    findings,
    facts,
    hardBlockMatched,
    responseFormatEvaluation,
  };
}

function buildResult(args, policy, docSources, inputEntries, evaluation) {
  return buildDecisionResult({
    gateId: "GATE-AI-BEHAVIOR-001",
    tool: "ai-behavior-gate",
    verdict: evaluation.verdict,
    reason: evaluation.findings[0]?.message ?? "ai behavior policy evaluation completed",
    status: evaluation.verdict === "block" ? "failed" : "ok",
    violations: evaluation.findings.map((finding) => ({
      code: finding.id,
      severity: finding.severity,
      detail: finding.message,
      evidence: finding.evidence,
      source: finding.source,
      category: finding.category,
    })),
    extra: {
      mcp: "output-guard",
      repoRoot: args.repoRoot,
      score: evaluation.score,
      findings: evaluation.findings,
      facts: {
        touchesBoundary: evaluation.facts.touchesBoundary,
        verificationSignals: evaluation.facts.verificationSignals,
        changedFiles: evaluation.facts.changedFiles,
        hasResponseInput: evaluation.facts.hasResponseInput,
        hardBlockMatched: evaluation.hardBlockMatched,
        responseFormatChecked: evaluation.responseFormatEvaluation?.checked ?? false,
        responseFormatValid: evaluation.responseFormatEvaluation?.ok ?? true,
      },
      sources: {
        docs: docSources.map((source) => source.path),
        inputs: inputEntries.map((entry) => ({
          label: entry.label,
          path: entry.path,
        })),
      },
      policySummary: {
        docCandidates: policy.defaultDocCandidates,
        requiredCheckPatterns: policy.requiredCheckPatterns,
        hardBlockRuleIds: policy.hardBlockRules.map((rule) => rule.id),
      },
    },
  });
}

function writeJsonIfRequested(filePath, value) {
  if (!filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runSelfTest(policy) {
  const docs = [
    {
      path: "SELFTEST:AGENTS.md",
      text: [
        "Canonical public entry: `https://key.example.com/openai/v1`",
        "Do not bypass pool or gateway.",
        "Health contract: `/health`, `/debug/routes`, `/v1/models`",
      ].join("\n"),
    },
  ];
  const rules = buildRules(docs, policy);
  const riskyDiffInput = [
    {
      label: "diff",
      path: "SELFTEST:risky.diff",
      text: [
        "diff --git a/src/gateway.js b/src/gateway.js",
        "index 0000000..1111111 100644",
        "--- a/src/gateway.js",
        "+++ b/src/gateway.js",
        "@@ -1,0 +1,2 @@",
        "+const base_url = \"http://127.0.0.1:3001/openai/v1\";",
        "+// bypass pool with direct provider",
      ].join("\n"),
    },
  ];
  const safeDiffInput = [
    {
      label: "diff",
      path: "SELFTEST:safe.diff",
      text: [
        "diff --git a/docs/quickstart.md b/docs/quickstart.md",
        "index 0000000..1111111 100644",
        "--- a/docs/quickstart.md",
        "+++ b/docs/quickstart.md",
        "@@ -72,0 +73,4 @@",
        "+```powershell",
        "+powershell -File guards/ai-behavior/hooks/invoke-plan-gate.ps1 -ProjectRoot . -Query \"Repair canonical route and verify /health before closeout\"",
        "+```",
      ].join("\n"),
    },
  ];
  const riskyResponseInput = [
    {
      label: "response",
      path: "SELFTEST:response.txt",
      text: [
        "This response skips the required format and should be blocked.",
      ].join("\n"),
    },
  ];
  const safeResponseInput = [
    {
      label: "response",
      path: "SELFTEST:safe-response.txt",
      text: [
        "[STEP] Review the current gate wiring.",
        "[WHY] We need to make the format rule executable.",
        "[ACTION] Add a response-format validator and bind it to the output guard.",
        "[RESULT] The guard now blocks missing STEP/WHY/ACTION/RESULT outputs.",
      ].join("\n"),
    },
  ];
  const compiledPolicy = compilePolicy(policy);
  const risky = evaluateBehavior(riskyDiffInput, compiledPolicy, rules);
  const safe = evaluateBehavior(safeDiffInput, compiledPolicy, rules);
  const riskyResponse = evaluateBehavior(riskyResponseInput, compiledPolicy, rules);
  const safeResponse = evaluateBehavior(safeResponseInput, compiledPolicy, rules);

  if (risky.verdict !== "block") {
    throw new Error("Self-test failed: risky input should block.");
  }

  if (safe.verdict === "block") {
    throw new Error("Self-test failed: safe input should not block.");
  }

  if (riskyResponse.verdict !== "block") {
    throw new Error("Self-test failed: risky response should block.");
  }

  if (safeResponse.verdict === "block") {
    throw new Error("Self-test failed: safe response should not block.");
  }

  return buildDecisionResult({
    gateId: "GATE-AI-BEHAVIOR-001",
    tool: "ai-behavior-gate",
    verdict: "allow",
    reason: "self-test passed",
    status: "ok",
    violations: [],
    extra: {
      mcp: "output-guard",
      selfTest: true,
      riskyVerdict: risky.verdict,
      safeVerdict: safe.verdict,
      riskyResponseVerdict: riskyResponse.verdict,
      safeResponseVerdict: safeResponse.verdict,
    },
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(args.repoRoot);
  const policyPath = args.policyPath
    ? path.resolve(args.policyPath)
    : path.join(scriptRoot, "..", "policy", "ai-behavior-guard.json");
  const policy = readJson(policyPath);

  if (args.selfTest) {
    const result = runSelfTest(policy);
    writeJsonIfRequested(args.jsonOut, result);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const explicitDocs = args.docs.length > 0
    ? args.docs
    : (process.env.OUTPUT_GUARD_DOCS || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);

  const docPaths = collectDocCandidates(repoRoot, policy, explicitDocs);
  const docSources = docPaths.map((docPath) => ({
    path: docPath,
    text: fs.readFileSync(docPath, "utf8"),
  }));
  const inputEntries = collectInputs(repoRoot, args);
  const compiledPolicy = compilePolicy(policy);
  const rules = buildRules(docSources, policy);
  const evaluation = evaluateBehavior(inputEntries, compiledPolicy, rules);
  const result = buildResult(
    { ...args, repoRoot },
    policy,
    docSources,
    inputEntries,
    evaluation,
  );

  writeJsonIfRequested(args.jsonOut, result);
  console.log(JSON.stringify(result, null, 2));

  if (result.verdict === "block") {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    mcp: "output-guard",
    tool: "ai-behavior-gate",
    status: "failed",
    error: message,
    timestampUtc: new Date().toISOString(),
  };
  if (process.argv.includes("--json-out")) {
    const index = process.argv.indexOf("--json-out");
    const outputPath = process.argv[index + 1];
    if (outputPath) {
      writeJsonIfRequested(outputPath, payload);
    }
  }
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

