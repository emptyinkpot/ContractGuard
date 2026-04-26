export async function run(step, context) {
  return {
    summary: "任务被拆分为分析、设计、代码骨架三个安全阶段。",
    guidance: [
      "先确认目标是否只需要本地分析与合同设计。",
      "把真实外部调用和敏感执行剥离到人工或受控执行器。",
      "在进入实现前保留 trace 与审计点。",
    ],
    goal: context.goal,
    prompt: step.prompt,
  };
}
