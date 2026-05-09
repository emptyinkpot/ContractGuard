import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node anti-overengineering-gate.mjs <input.json> or pipe JSON via stdin");
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

function sizeToRank(value) {
  return { none: 0, small: 1, medium: 2, large: 3 }[value] ?? null;
}

function main() {
  const payload = JSON.parse(readInput());
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  if (!isObject(payload.currentDriver)) {
    errors.push("currentDriver must be an object");
  } else {
    if (!["verified_bug", "constraint_conflict", "explicit_requirement"].includes(payload.currentDriver.type)) {
      errors.push("currentDriver.type must be verified_bug, constraint_conflict, or explicit_requirement");
    }
    if (!hasNonEmptyArray(payload.currentDriver.evidence)) {
      errors.push("currentDriver.evidence must be a non-empty array");
    }
  }

  if (!isObject(payload.proposedChange)) {
    errors.push("proposedChange must be an object");
  } else {
    if (!hasNonEmptyArray(payload.proposedChange.structuralChanges)) {
      errors.push("proposedChange.structuralChanges must be a non-empty array");
    }

    const futureFacing = payload.proposedChange.futureFacingAdditions ?? [];
    if (futureFacing.length > 0 && !hasNonEmptyArray(payload.currentConsumers)) {
      errors.push("futureFacingAdditions require currentConsumers");
    }
  }

  if (!hasNonEmptyArray(payload.smallerFixesConsidered)) {
    errors.push("smallerFixesConsidered must be a non-empty array");
  } else {
    const allRuledOut = payload.smallerFixesConsidered.every(
      (candidate) => isObject(candidate) && isNonEmptyString(candidate.option) && isNonEmptyString(candidate.ruledOutReason)
    );

    if (!allRuledOut) {
      errors.push("each smallerFixesConsidered entry must include option and ruledOutReason");
    }
  }

  if (!isObject(payload.complexityDelta)) {
    errors.push("complexityDelta must be an object");
  } else {
    const problemRank = sizeToRank(payload.complexityDelta.problemScope);
    const changeRank = sizeToRank(payload.complexityDelta.changeScope);

    if (problemRank === null || changeRank === null) {
      errors.push("complexityDelta.problemScope and changeScope must be none, small, medium, or large");
    } else if (changeRank > problemRank && payload.architectureUpgradeRequested !== true) {
      errors.push("changeScope exceeds problemScope without explicit architecture upgrade request");
    }
  }

  if (!isObject(payload.consumptionProof)) {
    errors.push("consumptionProof must be an object");
  } else {
    if (!hasNonEmptyArray(payload.consumptionProof.currentConsumers)) {
      errors.push("consumptionProof.currentConsumers must be a non-empty array");
    }
    if (!isNonEmptyString(payload.consumptionProof.whyLocalFixInsufficient)) {
      errors.push("consumptionProof.whyLocalFixInsufficient must be a non-empty string");
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: errors.length === 0,
        gateFamily: "anti-overengineering",
        errors
      },
      null,
      2
    )}\n`
  );

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
