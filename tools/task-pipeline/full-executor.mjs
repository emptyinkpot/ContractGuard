import { run as runAnalyze } from "./actions/analyze.mjs";
import { run as runDesign } from "./actions/design.mjs";
import { run as runCodegen } from "./actions/codegen.mjs";

const ACTIONS = {
  analysis: runAnalyze,
  design: runDesign,
  codegen: runCodegen,
};

function groupStepsByPhase(steps) {
  const groups = [];
  const seen = new Map();

  for (const step of steps) {
    const phase = step.phase || "analysis-and-clarification";
    if (!seen.has(phase)) {
      const entry = {
        phase,
        steps: [],
      };
      seen.set(phase, entry);
      groups.push(entry);
    }

    seen.get(phase).steps.push(step);
  }

  return groups;
}

export async function executeStagedPlan(context) {
  const phaseGroups = groupStepsByPhase(context.steps);

  for (const group of phaseGroups) {
    context.log({
      stage: "start_stage",
      phase: group.phase,
      steps: group.steps.map((step) => step.id),
    });

    for (const step of group.steps) {
    context.log({
      stage: "start_step",
      step: step.id,
      order: step.order,
      phase: group.phase,
    });

    const action = ACTIONS[step.type];
    if (!action) {
      step.status = "failed";
      context.addResult({
        step: step.id,
        status: step.status,
        reason: `missing-action:${step.type}`,
      });
      context.log({
        stage: "failed",
        step: step.id,
        reason: "missing-action",
        phase: group.phase,
      });
      continue;
    }

    try {
      step.status = "running";
      const output = await action(step, context);
      step.status = "success";
      context.addResult({
        step: step.id,
        phase: group.phase,
        status: step.status,
        output,
      });
      context.log({
        stage: "done_step",
        step: step.id,
        status: step.status,
        phase: group.phase,
      });
    } catch (error) {
      step.status = "failed";
      context.addResult({
        step: step.id,
        phase: group.phase,
        status: step.status,
        reason: error instanceof Error ? error.message : String(error),
      });
      context.log({
        stage: "error",
        step: step.id,
        reason: error instanceof Error ? error.message : String(error),
        phase: group.phase,
      });
    }
  }

    context.log({
      stage: "end_stage",
      phase: group.phase,
      steps: group.steps.map((step) => step.id),
    });
  }

  context.log({
    stage: "staged_executor_completed",
    phases: phaseGroups.map((group) => group.phase),
  });

  return context;
}

export async function executeFullPlan(context) {
  return executeStagedPlan(context);
}
