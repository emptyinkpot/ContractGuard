import fs from "node:fs";

const INPUT_PATH = process.argv[2];
const ALLOWED_TASK_TYPES = ["frontend-redesign", "frontend-refactor", "console-redesign", "ui-refresh"];
const ALLOWED_REFERENCE_KINDS = ["open-source", "product", "internal"];
const ALLOWED_ANTI_PATTERN_STATUS = ["removed", "reduced", "kept-with-justification"];
const GENERIC_DIRECTION_WORDS = ["modern", "clean", "simple", "sleek", "nice", "better"];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node frontend-design-gate.mjs <input.json> or pipe JSON via stdin");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isHttpLike(value) {
  return /^https?:\/\//i.test(value);
}

function hasConcreteLanguage(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 12) {
    return false;
  }

  const lowered = trimmed.toLowerCase();
  return !GENERIC_DIRECTION_WORDS.some((word) => lowered === word);
}

function validateReferenceSet(referenceSet, blockErrors, reviewWarnings) {
  if (!hasNonEmptyArray(referenceSet)) {
    blockErrors.push("referenceSet must be a non-empty array");
    return;
  }

  let hasExternalReference = false;

  referenceSet.forEach((entry, index) => {
    if (!isObject(entry)) {
      blockErrors.push(`referenceSet[${index}] must be an object`);
      return;
    }

    if (!ALLOWED_REFERENCE_KINDS.includes(entry.kind)) {
      blockErrors.push(`referenceSet[${index}].kind must be open-source, product, or internal`);
    }
    if (!isNonEmptyString(entry.name)) {
      blockErrors.push(`referenceSet[${index}].name must be a non-empty string`);
    }
    if (!isNonEmptyString(entry.why)) {
      blockErrors.push(`referenceSet[${index}].why must be a non-empty string`);
    }

    if (entry.kind === "open-source" || entry.kind === "product") {
      hasExternalReference = true;
    }
  });

  if (!hasExternalReference) {
    reviewWarnings.push("referenceSet should include at least one open-source or product reference, not only internal references");
  }
}

function validateVisualDirection(visualDirection, blockErrors, reviewWarnings) {
  if (!isObject(visualDirection)) {
    blockErrors.push("visualDirection must be an object");
    return;
  }

  if (!hasConcreteLanguage(visualDirection.theme)) {
    blockErrors.push("visualDirection.theme must be a concrete non-empty string");
  }
  if (!hasConcreteLanguage(visualDirection.typeStrategy)) {
    blockErrors.push("visualDirection.typeStrategy must be a concrete non-empty string");
  }
  if (!hasConcreteLanguage(visualDirection.colorStrategy)) {
    blockErrors.push("visualDirection.colorStrategy must be a concrete non-empty string");
  }
  if (!hasNonEmptyArray(visualDirection.antiPatternsToAvoid)) {
    blockErrors.push("visualDirection.antiPatternsToAvoid must be a non-empty array");
  }

  if (hasNonEmptyArray(visualDirection.antiPatternsToAvoid)) {
    const joined = visualDirection.antiPatternsToAvoid
      .filter((item) => typeof item === "string")
      .map((item) => item.toLowerCase())
      .join(" ");

    if (!joined.includes("card")) {
      reviewWarnings.push("visualDirection.antiPatternsToAvoid should explicitly mention card-on-card or boxed-dashboard avoidance when that is part of the active frontend rule set");
    }
  }
}

function validateInformationArchitecture(informationArchitecture, blockErrors, reviewWarnings) {
  if (!isObject(informationArchitecture)) {
    blockErrors.push("informationArchitecture must be an object");
    return;
  }

  const requiredArrays = ["desktopPriority", "mobilePriority", "primaryActions", "secondaryEvidence"];
  for (const key of requiredArrays) {
    if (!hasNonEmptyArray(informationArchitecture[key])) {
      blockErrors.push(`informationArchitecture.${key} must be a non-empty array`);
    }
  }

  const desktop = JSON.stringify(informationArchitecture.desktopPriority ?? []);
  const mobile = JSON.stringify(informationArchitecture.mobilePriority ?? []);
  if (desktop === mobile) {
    reviewWarnings.push("desktopPriority and mobilePriority are identical; prove that mobile flows were reorganized rather than merely stacked");
  }
}

function validateAntiPatternCleanup(antiPatternCleanup, blockErrors, reviewWarnings) {
  if (!hasNonEmptyArray(antiPatternCleanup)) {
    blockErrors.push("antiPatternCleanup must be a non-empty array");
    return;
  }

  let hasCardEntry = false;

  antiPatternCleanup.forEach((entry, index) => {
    if (!isObject(entry)) {
      blockErrors.push(`antiPatternCleanup[${index}] must be an object`);
      return;
    }

    if (!isNonEmptyString(entry.pattern)) {
      blockErrors.push(`antiPatternCleanup[${index}].pattern must be a non-empty string`);
    }
    if (!ALLOWED_ANTI_PATTERN_STATUS.includes(entry.status)) {
      blockErrors.push(`antiPatternCleanup[${index}].status must be removed, reduced, or kept-with-justification`);
    }
    if (!isNonEmptyString(entry.note)) {
      blockErrors.push(`antiPatternCleanup[${index}].note must be a non-empty string`);
    }

    const normalizedPattern = typeof entry.pattern === "string" ? entry.pattern.toLowerCase() : "";
    if (normalizedPattern.includes("card")) {
      hasCardEntry = true;
      if (entry.status === "kept-with-justification") {
        reviewWarnings.push("card-on-card remains in the declared anti-pattern cleanup; keep only with strong functional justification");
      }
    }
  });

  if (!hasCardEntry) {
    reviewWarnings.push("antiPatternCleanup should explicitly account for card-on-card or boxed-dashboard cleanup");
  }
}

function validateArtifacts(artifacts, blockErrors) {
  if (!isObject(artifacts)) {
    blockErrors.push("artifacts must be an object");
    return;
  }

  for (const [fieldName, label] of [
    ["desktopScreenshot", "desktop screenshot"],
    ["mobileScreenshot", "mobile screenshot"]
  ]) {
    const value = artifacts[fieldName];
    if (!isNonEmptyString(value)) {
      blockErrors.push(`artifacts.${fieldName} must be a non-empty string`);
      continue;
    }

    if (!isHttpLike(value) && !fs.existsSync(value)) {
      blockErrors.push(`artifacts.${fieldName} must point to an existing local file or an http(s) URL`);
    }

    if (value === artifacts.desktopScreenshot && fieldName === "mobileScreenshot") {
      blockErrors.push("artifacts.mobileScreenshot must be different from artifacts.desktopScreenshot");
    }
  }
}

function main() {
  const payload = JSON.parse(readInput());
  const blockErrors = [];
  const reviewWarnings = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  if (payload.taskIsNonTrivial !== true) {
    blockErrors.push("taskIsNonTrivial must be true");
  }

  if (!ALLOWED_TASK_TYPES.includes(payload.taskType)) {
    blockErrors.push("taskType must be frontend-redesign, frontend-refactor, console-redesign, or ui-refresh");
  }

  if (!hasNonEmptyArray(payload.userRules)) {
    blockErrors.push("userRules must be a non-empty array");
  }

  validateReferenceSet(payload.referenceSet, blockErrors, reviewWarnings);
  validateVisualDirection(payload.visualDirection, blockErrors, reviewWarnings);
  validateInformationArchitecture(payload.informationArchitecture, blockErrors, reviewWarnings);
  validateAntiPatternCleanup(payload.antiPatternCleanup, blockErrors, reviewWarnings);
  validateArtifacts(payload.artifacts, blockErrors);

  const verdict =
    blockErrors.length > 0 ? "block" :
    reviewWarnings.length > 0 ? "review" :
    "allow";

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: verdict === "allow",
        gateFamily: "frontend-design",
        verdict,
        errors: blockErrors,
        warnings: reviewWarnings
      },
      null,
      2
    )}\n`
  );

  if (verdict !== "allow") {
    process.exitCode = 1;
  }
}

main();
