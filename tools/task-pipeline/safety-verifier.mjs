const CONTROLLED_PATTERNS = [
  /handoff/i,
  /manual/i,
  /human-in-the-loop/i,
  /sandbox/i,
  /deploy/i,
  /production/i,
  /真实外部/i,
  /真实系统/i,
  /密钥/i,
  /账号/i,
];

function inferExecutionMode(step) {
  if (step.phase === "sensitive-handoff") {
    return "manual-handoff";
  }

  if (CONTROLLED_PATTERNS.some((pattern) => pattern.test(step.prompt))) {
    return "controlled-local";
  }

  return "staged-local";
}

function inferConditions(step) {
  const conditions = [];

  if (step.executionMode === "manual-handoff") {
    conditions.push("human-confirmation-required");
    conditions.push("no-direct-external-execution");
  }

  if (step.executionMode === "controlled-local") {
    conditions.push("sandbox-preferred");
  }

  if (step.safetyZone === "ai-safe-zone") {
    conditions.push("local-trace-required");
  }

  return conditions;
}

export function runSafetyVerifier(steps) {
  const verifiedSteps = steps.map((step) => {
    const executionMode = inferExecutionMode(step);
    const safetyVerdict = executionMode === "manual-handoff" ? "review" : "allow";
    const conditions = inferConditions({
      ...step,
      executionMode,
    });

    return {
      ...step,
      executionMode,
      safetyVerdict,
      conditions,
      requiresHumanApproval: executionMode === "manual-handoff",
    };
  });

  const controlledSteps = verifiedSteps.filter((step) => step.executionMode !== "staged-local");
  const reviewSteps = verifiedSteps
    .filter((step) => step.safetyVerdict !== "allow")
    .map((step) => step.id);

  return {
    verdict: reviewSteps.length === 0 ? "allow" : "review",
    reviewSteps,
    controlledSteps: controlledSteps.map((step) => ({
      step: step.id,
      executionMode: step.executionMode,
      conditions: step.conditions,
    })),
    verifiedSteps,
    checkedAt: new Date().toISOString(),
  };
}
