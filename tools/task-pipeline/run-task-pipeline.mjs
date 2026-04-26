import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PipelineContext } from "./context.mjs";
import { compileGoal } from "./compiler.mjs";
import { planTasks } from "./planner.mjs";
import { getDefaultPolicyPath, loadTaskPipelinePolicy } from "./policy-loader.mjs";
import { runPlanGate } from "./plan-gate.mjs";
import { runSafetyVerifier } from "./safety-verifier.mjs";
import { executeStagedPlan } from "./full-executor.mjs";
import { runDiffGate } from "./diff-gate.mjs";
import { runTraceAudit } from "./trace-auditor.mjs";

function parseArgs(argv) {
  const args = {
    goal: null,
    jsonOut: null,
    policy: getDefaultPolicyPath(),
    selfTest: false,
  };

  function nextValue(flagName, index) {
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${flagName}`);
    }

    return value;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--goal":
        args.goal = nextValue(token, index);
        index += 1;
        break;
      case "--json-out":
        args.jsonOut = nextValue(token, index);
        index += 1;
        break;
      case "--policy":
        args.policy = nextValue(token, index);
        index += 1;
        break;
      case "--self-test":
        args.selfTest = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

async function runPipeline(goal, options = {}) {
  const context = new PipelineContext(goal);
  const compiled = compileGoal(goal);
  const planned = planTasks(compiled);
  const loadedPolicy = loadTaskPipelinePolicy(options.policyPath);
  const planGate = runPlanGate(
    planned.map((step) => ({ ...step, goal })),
    loadedPolicy.policy,
  );
  const safetyVerifier = runSafetyVerifier(planGate.approvedSteps);
  context.setSafetyVerifier(safetyVerifier);

  for (const step of safetyVerifier.verifiedSteps) {
    context.addStep(step);
  }

  context.log({
    stage: "plan_gate_completed",
    approvedSteps: planGate.approvedSteps.map((step) => step.id),
    policyPath: loadedPolicy.absolutePath,
  });
  context.log({
    stage: "safety_verifier_completed",
    verdict: safetyVerifier.verdict,
    reviewSteps: safetyVerifier.reviewSteps,
  });

  await executeStagedPlan(context);
  const previewTrace = [
    ...context.trace,
    {
      ts: new Date().toISOString(),
      stage: "diff_gate_completed",
      verdict: "pending",
    },
  ];
  const diffGate = runDiffGate({
    goal: context.goal,
    steps: context.steps,
    results: context.results,
    trace: previewTrace,
    policy: loadedPolicy.policy,
  });

  context.log({
    stage: "diff_gate_completed",
    verdict: diffGate.verdict,
  });
  context.log({
    stage: "trace_audit_started",
    verdict: diffGate.verdict,
  });
  const auditLog = runTraceAudit({
    goal: context.goal,
    steps: context.steps,
    results: context.results,
    trace: context.trace,
    diffGate,
  });
  context.setAuditLog(auditLog);
  context.log({
    stage: "trace_audit_completed",
    verdict: auditLog.verdict,
  });

  return {
    goal: context.goal,
    policyPath: loadedPolicy.absolutePath,
    compiledSteps: compiled,
    plannedSteps: planned,
    planGate,
    safetyVerifier,
    steps: context.steps,
    results: context.results,
    trace: context.trace,
    diffGate,
    auditLog,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const goal = args.selfTest
    ? "为一个 consumer repo 设计安全的邮件 SDK 接入方案，只输出分析、设计和代码骨架"
    : args.goal;

  if (!goal) {
    throw new Error("Use --goal <text> or --self-test");
  }

  const result = await runPipeline(goal, {
    policyPath: args.policy,
  });
  const json = JSON.stringify(result, null, 2);

  if (args.jsonOut) {
    const outputPath = path.resolve(process.cwd(), args.jsonOut);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${json}\n`, "utf8");
  }

  process.stdout.write(`${json}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
