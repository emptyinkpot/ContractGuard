export async function run(step) {
  return {
    summary: "生成最小安全代码骨架示例。",
    snippet: [
      "export async function runSafeTask(goal) {",
      "  const compiled = compileGoal(goal);",
      "  const planned = planTasks(compiled);",
      "  const gated = runPlanGate(planned);",
      "  const verified = runSafetyVerifier(gated.approvedSteps);",
      "  const results = await executeStagedPlan(verified.verifiedSteps);",
      "  const diffGate = runDiffGate({ goal, steps: verified.verifiedSteps, results, trace: [] });",
      "  return runTraceAudit({ goal, steps: verified.verifiedSteps, results, trace: [], diffGate });",
      "}",
    ].join("\n"),
    prompt: step.prompt,
  };
}
