const VALID_DECISIONS = new Set(["allow", "review", "block"]);

function sanitizeText(value, fallback) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

function normalizeViolations(violations) {
  if (!Array.isArray(violations)) {
    return [];
  }

  return violations.map((violation, index) => {
    if (typeof violation === "string") {
      return {
        code: `VIOLATION_${index + 1}`,
        severity: "block",
        detail: violation,
      };
    }

    if (violation && typeof violation === "object") {
      return {
        code: sanitizeText(violation.code, `VIOLATION_${index + 1}`),
        severity: sanitizeText(violation.severity, "block"),
        detail: sanitizeText(violation.detail, "violation detail unavailable"),
        evidence: Array.isArray(violation.evidence) ? violation.evidence : [],
        source: typeof violation.source === "string" ? violation.source : undefined,
        category: typeof violation.category === "string" ? violation.category : undefined,
      };
    }

    return {
      code: `VIOLATION_${index + 1}`,
      severity: "block",
      detail: "violation detail unavailable",
    };
  });
}

export function buildDecisionResult({
  gateId,
  tool,
  verdict,
  reason,
  violations,
  status,
  extra = {},
}) {
  const normalizedDecision = VALID_DECISIONS.has(verdict) ? verdict : "review";
  const normalizedViolations = normalizeViolations(violations);
  const normalizedReason = sanitizeText(
    reason,
    normalizedDecision === "allow"
      ? "no policy violation detected"
      : "policy violation detected",
  );

  return {
    ...extra,
    ok: normalizedDecision === "allow",
    gateId: sanitizeText(gateId, "UNKNOWN-GATE"),
    tool: sanitizeText(tool, "unknown-tool"),
    status: sanitizeText(status, normalizedDecision === "block" ? "failed" : "ok"),
    decision: normalizedDecision,
    verdict: normalizedDecision,
    reason: normalizedReason,
    violations: normalizedViolations,
    timestampUtc: new Date().toISOString(),
  };
}
