function extractGoalKeywords(goal, policy) {
  const keywordPolicy = policy.goalKeywordPolicy || {};
  const minimumTokenLength = keywordPolicy.minimumTokenLength ?? 2;
  const ignoreTokens = new Set(keywordPolicy.ignoreTokens || []);

  return [...new Set(
    (goal || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}_-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= minimumTokenLength)
      .filter((token) => !ignoreTokens.has(token)),
  )];
}

function collectExecutionText(results) {
  return results
    .map((result) => JSON.stringify(result.output || result))
    .join("\n")
    .toLowerCase();
}

function computeKeywordCoverage(goal, results, policy) {
  const keywords = extractGoalKeywords(goal, policy);
  const executionText = collectExecutionText(results);
  const matchedKeywords = keywords.filter((keyword) => executionText.includes(keyword));
  const missingKeywords = keywords.filter((keyword) => !executionText.includes(keyword));
  const coverageRatio = keywords.length === 0 ? 1 : matchedKeywords.length / keywords.length;

  return {
    keywords,
    matchedKeywords,
    missingKeywords,
    coverageRatio,
  };
}

function computeTraceCoverage(trace, policy) {
  const required = policy.traceStagesRequired || [];
  const observed = new Set(trace.map((entry) => entry.stage));
  const missing = required.filter((item) => !observed.has(item));
  return {
    required,
    missing,
  };
}

export function runDiffGate({ goal, steps, results, trace, policy }) {
  const plannedStepIds = steps.map((step) => step.id);
  const executedStepIds = results.map((result) => result.step);
  const missingResults = plannedStepIds.filter((id) => !executedStepIds.includes(id));
  const failedResults = results
    .filter((result) => result.status !== "success")
    .map((result) => ({
      step: result.step,
      status: result.status,
      reason: result.reason || "non-success-result",
    }));

  const keywordCoverage = computeKeywordCoverage(goal, results, policy);
  const traceCoverage = computeTraceCoverage(trace, policy);
  const goalKeywordPolicy = policy.goalKeywordPolicy || {};
  const minCoverageRatio = goalKeywordPolicy.minCoverageRatio ?? 0.34;
  const maxMissingKeywords = goalKeywordPolicy.maxMissingKeywords ?? 4;

  const driftFindings = [];
  if (keywordCoverage.coverageRatio < minCoverageRatio) {
    driftFindings.push({
      type: "goal-keyword-coverage",
      reason: "coverage-ratio-below-threshold",
      coverageRatio: keywordCoverage.coverageRatio,
      minCoverageRatio,
    });
  }

  if (keywordCoverage.missingKeywords.length > maxMissingKeywords) {
    driftFindings.push({
      type: "goal-keyword-coverage",
      reason: "too-many-missing-keywords",
      missingKeywords: keywordCoverage.missingKeywords,
      maxMissingKeywords,
    });
  }

  if (traceCoverage.missing.length > 0) {
    driftFindings.push({
      type: "trace-coverage",
      reason: "required-trace-stages-missing",
      missingStages: traceCoverage.missing,
    });
  }

  const verdict = missingResults.length === 0
    && failedResults.length === 0
    && driftFindings.length === 0
      ? "allow"
      : "review";

  return {
    verdict,
    goal,
    missingResults,
    failedResults,
    goalKeywordCoverage: keywordCoverage,
    traceCoverage,
    driftFindings,
    traceEntries: trace.length,
    checkedAt: new Date().toISOString(),
  };
}
