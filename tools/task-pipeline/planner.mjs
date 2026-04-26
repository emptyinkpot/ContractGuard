function inferPhase(step) {
  if (step.id.endsWith("manual-handoff") || /handoff/i.test(step.prompt)) {
    return "sensitive-handoff";
  }

  if (step.type === "analysis") {
    return "analysis-and-clarification";
  }

  if (step.type === "design") {
    return "architecture-and-contracts";
  }

  if (step.type === "codegen") {
    return "restricted-implementation";
  }

  return "analysis-and-clarification";
}

function inferSafetyZone(phase) {
  return phase === "sensitive-handoff" ? "controlled-zone" : "ai-safe-zone";
}

function inferSuccessCriteria(step, phase) {
  if (phase === "analysis-and-clarification") {
    return "capture-risks-and-boundaries";
  }

  if (phase === "architecture-and-contracts") {
    return "produce-contracts-and-handoff-shape";
  }

  if (phase === "restricted-implementation") {
    return "produce-local-safe-artifacts";
  }

  return `handoff-${step.type}-artifacts`;
}

export function planTasks(compiledSteps) {
  return compiledSteps.map((step, index) => ({
    ...step,
    phase: inferPhase(step),
    safetyZone: inferSafetyZone(inferPhase(step)),
    ...step,
    order: index + 1,
    status: "pending",
    boundary: "local-execution",
    expectedOutput: `${step.type}-result`,
    successCriteria: inferSuccessCriteria(step, inferPhase(step)),
    refinementDepth: 0,
  }));
}
