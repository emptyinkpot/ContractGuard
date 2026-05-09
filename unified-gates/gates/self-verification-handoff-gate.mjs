import fs from "node:fs";

const INPUT_PATH = process.argv[2];

function readInput() {
  if (INPUT_PATH) {
    return fs.readFileSync(INPUT_PATH, "utf8");
  }

  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, "utf8");
  }

  throw new Error("usage: node self-verification-handoff-gate.mjs <input.json> or pipe JSON via stdin");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasBlockedEvidence(message) {
  const normalized = message.toLowerCase();
  return [
    "blocked",
    "unavailable",
    "cannot",
    "can't",
    "failed to run",
    "permission",
    "network",
    "auth",
    "timeout",
    "sandbox",
    "no access",
    "??",
    "??",
    "???",
    "???",
    "??"
  ].some((token) => normalized.includes(token));
}

function mentionsPrematureHandoff(message) {
  const patterns = [
    /\byou(?:\s+can|\s+should|\s+need\s+to)?\s+test\b/i,
    /\bplease\s+test\b/i,
    /\bplease\s+verify\b/i,
    /\bcan\s+you\s+verify\b/i,
    /\brun\s+it\s+and\s+see\b/i,
    /\blet\s+me\s+know\s+if\s+it\s+works\b/i,
    /????/,
    /?????/,
    /????/,
    /?????/,
    /?????/
  ];

  return patterns.some((pattern) => pattern.test(message));
}

function main() {
  const payload = JSON.parse(readInput());
  const errors = [];

  if (!isObject(payload)) {
    throw new Error("input must be a JSON object");
  }

  if (!isNonEmptyString(payload.finalMessage)) {
    errors.push("finalMessage must be a non-empty string");
  }

  if (typeof payload.verificationPathStillAvailable !== "boolean") {
    errors.push("verificationPathStillAvailable must be a boolean");
  }

  if (typeof payload.userOptOut !== "boolean") {
    errors.push("userOptOut must be a boolean");
  }

  if (
    errors.length === 0 &&
    payload.verificationPathStillAvailable === true &&
    payload.userOptOut !== true &&
    mentionsPrematureHandoff(payload.finalMessage) &&
    !hasBlockedEvidence(payload.finalMessage)
  ) {
    errors.push("finalMessage hands testing back to the user even though self-verification is still available");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: errors.length === 0,
        gateFamily: "self-verification-handoff",
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
