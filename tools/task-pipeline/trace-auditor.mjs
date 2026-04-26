function auditStageOrdering(trace) {
  const findings = [];
  const startStages = new Set(trace.filter((entry) => entry.stage === "start_stage").map((entry) => entry.phase));
  const endStages = new Set(trace.filter((entry) => entry.stage === "end_stage").map((entry) => entry.phase));

  for (const phase of startStages) {
    if (!endStages.has(phase)) {
      findings.push({
        type: "stage-ordering",
        reason: "phase-started-without-end",
        phase,
      });
    }
  }

  return findings;
}

function auditResultCoverage(steps, results) {
  const findings = [];
  const resultMap = new Map(results.map((result) => [result.step, result.status]));

  for (const step of steps) {
    if (!resultMap.has(step.id)) {
      findings.push({
        type: "result-coverage",
        reason: "missing-result",
        step: step.id,
      });
      continue;
    }

    if (resultMap.get(step.id) !== "success") {
      findings.push({
        type: "result-coverage",
        reason: "non-success-result",
        step: step.id,
        status: resultMap.get(step.id),
      });
    }
  }

  return findings;
}

export function runTraceAudit({ goal, steps, results, trace, diffGate }) {
  const findings = [
    ...auditStageOrdering(trace),
    ...auditResultCoverage(steps, results),
  ];

  if (diffGate.verdict !== "allow") {
    findings.push({
      type: "diff-gate-verdict",
      reason: "diff-gate-requires-review",
      verdict: diffGate.verdict,
    });
  }

  return {
    goal,
    verdict: findings.length === 0 ? "pass" : "review",
    findings,
    traceEntries: trace.length,
    executedSteps: results.length,
    checkedAt: new Date().toISOString(),
  };
}
