import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    repoRoot: ".",
    policyPath: null,
    docs: [],
    inputFiles: [],
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
  };
}

function evidenceForPattern(text, regex) {
  const lines = text.split(/\r?\n/);
  const evidence = [];

  for (const line of lines) {
    if (regex.test(line)) {
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
  const normalizedFiles = changedFiles.map((item) => normalizeSlashes(item).toLowerCase());
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
    const evidence = evidenceForPattern(facts.combinedText, rule.regex);
    if (evidence.length === 0) {
      continue;
    }

    findings.push(createFinding(rule, evidence));
    hardBlockMatched = true;
  }

  for (const rule of compiledPolicy.rules) {
    const evidence = evidenceForPattern(facts.combinedText, rule.regex);
    if (evidence.length === 0) {
      continue;
    }

    findings.push(createFinding(rule, evidence));
    score -= rule.penalty;
  }

  const baseUrlRegex = /\bbase_url\b|\bbaseUrl\b|https?:\/\/[^\s`"'<>]+/i;
  const mentionedUrls = unique(
    [...facts.combinedText.matchAll(/https?:\/\/[^\s`"'<>]+/g)].map((match) =>
      match[0].replace(/[),.;]+$/, ""),
    ),
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

  if (facts.touchesBoundary && facts.verificationSignals.length === 0) {
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
  };
}

function buildResult(args, policy, docSources, inputEntries, evaluation) {
  return {
    mcp: "output-guard",
    tool: "ai-behavior-gate",
    status: evaluation.verdict === "block" ? "failed" : "ok",
    repoRoot: args.repoRoot,
    score: evaluation.score,
    verdict: evaluation.verdict,
    findings: evaluation.findings,
    facts: {
      touchesBoundary: evaluation.facts.touchesBoundary,
      verificationSignals: evaluation.facts.verificationSignals,
      changedFiles: evaluation.facts.changedFiles,
      hardBlockMatched: evaluation.hardBlockMatched,
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
    timestampUtc: new Date().toISOString(),
  };
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
  const riskyInput = [
    {
      label: "plan",
      path: "SELFTEST:plan.txt",
      text: [
        "Change base_url to http://127.0.0.1:3001/openai/v1",
        "Bypass pool and call direct provider",
      ].join("\n"),
    },
  ];
  const safeInput = [
    {
      label: "plan",
      path: "SELFTEST:safe-plan.txt",
      text: [
        "Repair canonical gateway route",
        "Verify /health and /v1/models before closeout",
      ].join("\n"),
    },
  ];
  const compiledPolicy = compilePolicy(policy);
  const risky = evaluateBehavior(riskyInput, compiledPolicy, rules);
  const safe = evaluateBehavior(safeInput, compiledPolicy, rules);

  if (risky.verdict !== "block") {
    throw new Error("Self-test failed: risky input should block.");
  }

  if (safe.verdict === "block") {
    throw new Error("Self-test failed: safe input should not block.");
  }

  return {
    mcp: "output-guard",
    tool: "ai-behavior-gate",
    status: "ok",
    selfTest: true,
    riskyVerdict: risky.verdict,
    safeVerdict: safe.verdict,
    timestampUtc: new Date().toISOString(),
  };
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

