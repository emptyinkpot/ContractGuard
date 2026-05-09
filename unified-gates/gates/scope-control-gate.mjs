import { execSync } from "node:child_process";
import fs from "node:fs";

function fail(reason, details = {}) {
  console.error("\n❌ GATE-SCOPE BLOCKED");
  console.error("REASON:", reason);
  console.error("DETAILS:", JSON.stringify(details, null, 2));
  process.exit(1);
}

function pass() {
  console.log("✅ GATE-SCOPE PASSED");
  process.exit(0);
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function jsonEnv(name, fallback) {
  try {
    return JSON.parse(process.env[name] || "");
  } catch {
    return fallback;
  }
}

function normalizeGitPath(file) {
  return String(file).replace(/\\/g, "/");
}

function getStagedFiles() {
  const out = sh("git diff --cached --name-only");
  return out ? out.split(/\r?\n/).filter(Boolean).map(normalizeGitPath) : [];
}

function getStagedDiff() {
  return sh("git diff --cached --unified=0");
}

function getFileBefore(file) {
  try {
    return sh(`git show :0:${normalizeGitPath(file)}`);
  } catch {
    return "";
  }
}

function getFileAfter(file) {
  const normalized = normalizeGitPath(file);
  return fs.existsSync(normalized) ? fs.readFileSync(normalized, "utf8") : "";
}

function countChangedLines(diff) {
  return diff.split(/\r?\n/).filter((line) => {
    return (line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"));
  }).length;
}

function extractFunctionNames(src) {
  const names = new Set();
  const patterns = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*function\b/g,
    /(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g
  ];

  for (const re of patterns) {
    let match;
    while ((match = re.exec(src))) {
      names.add(match[1]);
    }
  }

  return names;
}

function extractApiSurface(src) {
  const hits = [];
  const patterns = [
    /\baxios\.(get|post|put|patch|delete)\s*\(/g,
    /\bfetch\s*\(/g,
    /\bapi\.[A-Za-z_$][\w$]*\s*\(/g,
    /\brequest\.[A-Za-z_$][\w$]*\s*\(/g
  ];

  for (const re of patterns) {
    let match;
    while ((match = re.exec(src))) {
      hits.push(match[0]);
    }
  }

  return hits;
}

function extractTypeSurface(src) {
  const hits = [];
  const patterns = [
    /\binterface\s+([A-Za-z_$][\w$]*)/g,
    /\btype\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\benum\s+([A-Za-z_$][\w$]*)/g
  ];

  for (const re of patterns) {
    let match;
    while ((match = re.exec(src))) {
      hits.push(match[0]);
    }
  }

  return hits;
}

function diffRemovedSignatures(before, after, extractor) {
  const prior = new Set(extractor(before));
  const next = new Set(extractor(after));
  return [...prior].filter((entry) => !next.has(entry));
}

function main() {
  const scope = jsonEnv("TASK_SCOPE", null);

  if (!scope) {
    fail("Missing TASK_SCOPE. Fail-closed.");
  }

  const {
    allowedFiles = [],
    maxDiffLines = 50,
    allowDelete = false,
    allowApiChange = false,
    allowTypeChange = false,
    allowFunctionDelete = false,
    allowMultipleFiles = false,
    primaryObjective = null,
    allowExpansion = false,
    noParallelThinking = true
  } = scope;

  const normalizedAllowedFiles = allowedFiles.map(normalizeGitPath);
  const changedFiles = getStagedFiles();
  const diff = getStagedDiff();

  if (changedFiles.length === 0) {
    fail("No staged files detected. Refusing ambiguous execution.");
  }

  if (!primaryObjective || typeof primaryObjective !== "string" || primaryObjective.trim().length === 0) {
    fail("Primary objective missing.", {
      primaryObjective
    });
  }

  if (allowExpansion !== false) {
    fail("Expansion requires explicit authorization.", {
      allowExpansion
    });
  }

  if (noParallelThinking !== true) {
    fail("Parallel thinking / multi-track execution not allowed.", {
      noParallelThinking
    });
  }

  if (!allowMultipleFiles && changedFiles.length > 1) {
    fail("Multiple files modified without authorization.", { changedFiles });
  }

  for (const file of changedFiles) {
    if (!normalizedAllowedFiles.includes(file)) {
      fail("File outside allowed scope.", { file, allowedFiles: normalizedAllowedFiles });
    }
  }

  const changedLines = countChangedLines(diff);
  if (changedLines > maxDiffLines) {
    fail("Diff budget exceeded.", { changedLines, maxDiffLines });
  }

  if (!allowDelete) {
    const deletedLines = diff.split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---"));
    if (deletedLines.length > 0) {
      fail("Deletion detected without authorization.", {
        deletedLineCount: deletedLines.length
      });
    }
  }

  for (const file of changedFiles) {
    const before = getFileBefore(file);
    const after = getFileAfter(file);

    if (!allowFunctionDelete) {
      const removedFns = diffRemovedSignatures(before, after, extractFunctionNames);
      if (removedFns.length > 0) {
        fail("Function deletion detected.", { file, removedFns });
      }
    }

    if (!allowApiChange) {
      const beforeApi = extractApiSurface(before);
      const afterApi = extractApiSurface(after);

      if (JSON.stringify(beforeApi) !== JSON.stringify(afterApi)) {
        fail("API call surface changed without authorization.", {
          file,
          beforeApi,
          afterApi
        });
      }
    }

    if (!allowTypeChange) {
      const beforeTypes = extractTypeSurface(before);
      const afterTypes = extractTypeSurface(after);

      if (JSON.stringify(beforeTypes) !== JSON.stringify(afterTypes)) {
        fail("Type surface changed without authorization.", {
          file,
          beforeTypes,
          afterTypes
        });
      }
    }
  }

  pass();
}

main();
