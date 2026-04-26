export async function run(step, context) {
  return {
    summary: "推荐采用 compiler -> planner -> plan-gate -> safety-verifier -> staged-executor -> diff-gate -> trace-auditor 的最小模块切分。",
    modules: [
      "context: 保存 goal、steps、results、trace",
      "compiler: 把目标编译为安全子任务",
      "planner: 补齐顺序、状态与边界",
      "plan-gate: 检查计划并在需要时继续细分",
      "safety-verifier: 标记受控执行与 handoff 条件",
      "staged-executor: 按 phase 分阶段执行通过 gate 的步骤",
      "diff-gate: 对照用户目标检查执行偏离",
      "trace-auditor: 审核 trace 完整性与阶段闭环",
    ],
    stateModel: [
      "pending",
      "running",
      "success",
      "refined",
      "failed",
    ],
    phase: step.phase,
    prompt: step.prompt,
    basedOnGoal: context.goal,
  };
}
