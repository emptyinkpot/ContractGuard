import { execSync } from "node:child_process";
import fs from "node:fs";

const PLAN_PATH = process.env.TASK_PLAN_PATH || ".codex/task-plan.json";

function fail(reason, details = {}) {
  console.error("\n❌ PLAN-DIFF BLOCKED");
  console.error("REASON:", reason);
  console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function readPlan() {
  if (!fs.existsSync(PLAN_PATH)) {
    fail("Missing task plan", { PLAN_PATH });
  }

  try {
    return JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
  } catch (err) {
    fail("Invalid task plan JSON", { error: String(err) });
  }
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

function stagedFiles() {
  const out = sh("git diff --cached --name-status");
  if (!out) {
    fail("No staged diff found");
  }

  return out.split(/\r?\n/).map((line) => {
    const [status, file] = line.split(/\s+/);
    return { status, file };
  });
}

function stagedDiff() {
  return sh("git diff --cached --unified=0");
}

function parseUnifiedDiffByFile(diff) {
  const files = new Map();
  let currentFile = null;
  let currentHunk = null;

  for (const rawLine of diff.split(/\r?\n/)) {
    if (rawLine.startsWith("+++ b/")) {
      currentFile = rawLine.slice("+++ b/".length).trim();
      if (!files.has(currentFile)) {
        files.set(currentFile, []);
      }
      currentHunk = null;
      continue;
    }

    if (rawLine.startsWith("@@")) {
      currentHunk = rawLine.trim();
      if (currentFile && !files.has(currentFile)) {
        files.set(currentFile, []);
      }
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      files.get(currentFile).push({
        op: "add",
        hunk: currentHunk,
        text: rawLine.slice(1)
      });
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      files.get(currentFile).push({
        op: "remove",
        hunk: currentHunk,
        text: rawLine.slice(1)
      });
    }
  }

  return files;
}

function normalizeExactSpec(exactSpec) {
  if (!exactSpec) {
    return null;
  }

  if (Array.isArray(exactSpec)) {
    const normalized = {};
    for (const item of exactSpec) {
      if (!item || typeof item !== "object" || typeof item.file !== "string") {
        continue;
      }
      normalized[item.file] = Array.isArray(item.ops) ? item.ops : [];
    }
    return normalized;
  }

  if (typeof exactSpec === "object") {
    if (exactSpec.diff && typeof exactSpec.diff === "object") {
      return normalizeExactSpec(exactSpec.diff);
    }

    if (exactSpec.fileDiffs && typeof exactSpec.fileDiffs === "object") {
      if (Array.isArray(exactSpec.fileDiffs)) {
        return normalizeExactSpec(exactSpec.fileDiffs);
      }

      const normalized = {};
      for (const [file, value] of Object.entries(exactSpec.fileDiffs)) {
        if (Array.isArray(value)) {
          normalized[file] = value;
          continue;
        }

        if (value && typeof value === "object" && Array.isArray(value.ops)) {
          normalized[file] = value.ops;
        }
      }
      return normalized;
    }

    if (exactSpec.patch && typeof exactSpec.patch === "string") {
      return { __patch__: exactSpec.patch };
    }
  }

  return null;
}

function compareExactOps(actualMap, expectedMap) {
  if (expectedMap.__patch__) {
    return null;
  }

  const actualFiles = [...actualMap.keys()].sort();
  const expectedFiles = Object.keys(expectedMap).sort();

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    return {
      reason: "file-set-mismatch",
      actualFiles,
      expectedFiles
    };
  }

  for (const file of expectedFiles) {
    const actualOps = actualMap.get(file) || [];
    const expectedOps = expectedMap[file] || [];
    const actualComparable = actualOps.map((op) => ({
      op: op.op,
      hunk: op.hunk || null,
      text: op.text
    }));
    const expectedComparable = expectedOps.map((op) => ({
      op: op.op,
      hunk: op.hunk || null,
      text: op.text
    }));

    if (JSON.stringify(actualComparable) !== JSON.stringify(expectedComparable)) {
      return {
        reason: "ops-mismatch",
        file,
        actualOps: actualComparable,
        expectedOps: expectedComparable
      };
    }
  }

  return { reason: null };
}

function hasExactSpec(expectedMap) {
  if (!expectedMap || typeof expectedMap !== "object") {
    return false;
  }

  if (expectedMap.__patch__) {
    return true;
  }

  return Object.keys(expectedMap).length > 0;
}

function compareUnifiedPatch(actualDiff, expectedPatch) {
  const normalize = (value) => value.replace(/\r\n/g, "\n").trim();
  if (normalize(actualDiff) !== normalize(expectedPatch)) {
    return {
      reason: "patch-mismatch"
    };
  }

  return { reason: null };
}

function changedLines(diff) {
  return diff.split(/\r?\n/).filter((line) => {
    return (line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"));
  });
}

function addedLines(diff) {
  return diff.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++"));
}

function removedLines(diff) {
  return diff.split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---"));
}

function detectChangeType(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed === "+" || trimmed === "-" || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
    return null;
  }

  if (
    trimmed.includes("class=") ||
    trimmed.includes('className=') ||
    trimmed.includes("style=") ||
    trimmed.includes("style.") ||
    /^\.[A-Za-z0-9_-]+\s*[\{:]/.test(trimmed) ||
    /^\#[A-Za-z0-9_-]+\s*[\{:]/.test(trimmed) ||
    /@media\b/.test(trimmed) ||
    /:[A-Za-z-]+\s*[:{]/.test(trimmed)
  ) {
    return "css";
  }

  if (
    trimmed.startsWith("<") ||
    trimmed.includes("<template") ||
    trimmed.includes("</") ||
    /^\w[\w-]*(\s+[\w-:]+(=|>|$)|>)/.test(trimmed)
  ) {
    return "template";
  }

  if (
    trimmed.includes("function ") ||
    trimmed.includes("=>") ||
    trimmed.includes("fetch(") ||
    trimmed.includes("axios.") ||
    trimmed.includes("api.") ||
    trimmed.includes("request.") ||
    /\b(const|let|var)\b/.test(trimmed) ||
    /\b(if|for|while|switch|return|try|catch|throw)\b/.test(trimmed) ||
    /\b(import|export)\b/.test(trimmed)
  ) {
    return "logic";
  }

  if (trimmed.includes("interface ") || trimmed.includes("type ") || trimmed.includes("enum ")) {
    return "type";
  }

  return "unknown";
}

function enforceAllowedTypes(diff, allowedTypes) {
  const added = addedLines(diff);

  for (const line of added) {
    const detectedType = detectChangeType(line);

    if (detectedType === null) {
      continue;
    }

    if (detectedType === "unknown") {
      fail("Unknown change line type detected under exact-match policy", {
        line,
        allowedTypes
      });
    }

    if (!allowedTypes.includes(detectedType)) {
      fail("Change type not allowed by plan", {
        line,
        detectedType,
        allowedTypes
      });
    }
  }
}

function main() {
  const plan = readPlan();
  const files = stagedFiles();
  const diff = stagedDiff();

  const allowedFiles = plan.allowedFiles || [];
  const allowedTypes = plan.allowedChangeTypes || [];
  const exactDiffMatch = plan.exactDiffMatch !== false;
  const exactDiffFilePath = plan.exactDiffFilePath || process.env.TASK_APPROVED_DIFF_PATH || null;
  const maxDiffLines = plan.maxDiffLines ?? 50;
  const forbiddenPatterns = plan.forbiddenPatterns || [];

  for (const { status, file } of files) {
    if (!allowedFiles.includes(file)) {
      fail("File not allowed by plan", { file, allowedFiles });
    }

    if (status === "A" && plan.allowNewFiles !== true) {
      fail("New file not allowed by plan", { file });
    }

    if (status === "D") {
      fail("File deletion not allowed", { file });
    }
  }

  const lines = changedLines(diff);
  if (lines.length > maxDiffLines) {
    fail("Diff exceeds plan budget", {
      changedLines: lines.length,
      maxDiffLines
    });
  }

  if (plan.allowDelete !== true && removedLines(diff).length > 0) {
    fail("Deletion not allowed by plan", {
      removedLineCount: removedLines(diff).length
    });
  }

  if (exactDiffMatch && (!Array.isArray(allowedTypes) || allowedTypes.length === 0)) {
    fail("Exact diff match requires allowedChangeTypes", {
      allowedTypes
    });
  }

  const exactSpecText = readTextIfExists(exactDiffFilePath);
  if (exactDiffMatch && exactDiffFilePath && !exactSpecText) {
    fail("Exact diff file not found", {
      exactDiffFilePath
    });
  }

  if (exactDiffMatch && exactSpecText) {
    let exactSpec = null;
    try {
      exactSpec = normalizeExactSpec(JSON.parse(exactSpecText));
    } catch {
      exactSpec = normalizeExactSpec({ patch: exactSpecText });
    }

    if (!exactSpec) {
      fail("Invalid exact diff spec", { exactDiffFilePath });
    }

    if (exactSpec.__patch__) {
      const mismatch = compareUnifiedPatch(diff, exactSpec.__patch__);
      if (mismatch) {
        fail("Exact patch mismatch", {
          exactDiffFilePath,
          ...mismatch
        });
      }
    } else {
      const actualMap = parseUnifiedDiffByFile(diff);
      const normalizedSpec = {};
      for (const [file, ops] of Object.entries(exactSpec)) {
        normalizedSpec[file] = Array.isArray(ops) ? ops : [];
      }
      if (Object.keys(normalizedSpec).length === 0) {
        fail("Exact diff spec requires fileDiffs or patch", {
          exactDiffFilePath
        });
      }
      const mismatch = compareExactOps(actualMap, normalizedSpec);
      if (mismatch) {
        fail("Exact diff mismatch", {
          exactDiffFilePath,
          ...mismatch
        });
      }
    }
  }

  if (Array.isArray(allowedTypes) && allowedTypes.length > 0 && !allowedTypes.includes("patch")) {
    enforceAllowedTypes(diff, allowedTypes);
  }

  for (const pattern of forbiddenPatterns) {
    const hit = addedLines(diff).find((line) => line.includes(pattern));
    if (hit) {
      fail("Forbidden pattern added", {
        pattern,
        line: hit
      });
    }
  }

  console.log("✅ PLAN-DIFF PASSED");
  process.exit(0);
}

main();
