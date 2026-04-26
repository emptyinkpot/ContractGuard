import { evaluateStepSafety } from "./safe-guard.mjs";

function createRefinedStep(parentStep, suffix, type, prompt) {
  return {
    id: `${parentStep.id}-${suffix}`,
    type,
    prompt,
    status: "pending",
    boundary: parentStep.boundary,
    expectedOutput: `${type}-result`,
    refinementDepth: (parentStep.refinementDepth || 0) + 1,
    parentId: parentStep.id,
    originalId: parentStep.originalId || parentStep.id,
    refinedFrom: parentStep.id,
  };
}

function materializePrompt(template, step) {
  return template
    .replaceAll("{{prompt}}", step.prompt)
    .replaceAll("{{goal}}", step.goal || "")
    .replaceAll("{{type}}", step.type);
}

function refineBlockedStep(step, policy) {
  const templates = policy.refinementRules?.[step.type]
    || policy.refinementRules?.default
    || [];

  return templates.map((template) =>
    createRefinedStep(
      step,
      template.suffix,
      template.type || policy.defaultRefinementType || "analysis",
      materializePrompt(template.prompt, step),
    ));
}

function createManualHandoffStep(step, policy) {
  const template = policy.manualHandoffTemplate;
  return {
    ...createRefinedStep(
      step,
      template.suffix,
      template.type,
      materializePrompt(template.prompt, step),
    ),
    refinementDepth: step.refinementDepth,
  };
}

export function runPlanGate(initialSteps, policy, options = {}) {
  const maxRefinementDepth = options.maxRefinementDepth ?? policy.maxRefinementDepth ?? 3;
  const queue = [...initialSteps];
  const approvedSteps = [];
  const report = [];

  while (queue.length > 0) {
    const step = queue.shift();
    const safety = evaluateStepSafety(step);

    if (safety.safe) {
      approvedSteps.push(step);
      report.push({
        step: step.id,
        verdict: "allow",
        refinementDepth: step.refinementDepth || 0,
      });
      continue;
    }

    if ((step.refinementDepth || 0) >= maxRefinementDepth) {
      if (policy.manualHandoffOnMaxDepth !== false) {
        approvedSteps.push(createManualHandoffStep(step, policy));
      }
      report.push({
        step: step.id,
        verdict: "review",
        refinementDepth: step.refinementDepth || 0,
        reason: "max-refinement-depth-reached",
        matches: safety.matches,
      });
      continue;
    }

    const refinedSteps = refineBlockedStep(step, policy);
    report.push({
      step: step.id,
      verdict: "refine",
      refinementDepth: step.refinementDepth || 0,
      matches: safety.matches,
      produced: refinedSteps.map((item) => item.id),
    });
    queue.unshift(...refinedSteps);
  }

  return {
    approvedSteps: approvedSteps.map((step, index) => ({
      ...step,
      order: index + 1,
    })),
    report,
    policy: {
      maxRefinementDepth,
      manualHandoffOnMaxDepth: policy.manualHandoffOnMaxDepth !== false,
    },
  };
}
