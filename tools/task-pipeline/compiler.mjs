function buildPrompt(goal, stepType) {
  switch (stepType) {
    case "analysis":
      return `分析这个目标需要哪些工程步骤，仅输出分析，不执行真实操作：\n${goal}`;
    case "design":
      return "基于分析结果，设计模块结构、接口边界与状态流，不触达真实外部系统。";
    case "codegen":
      return "根据设计输出代码骨架、接口定义与测试占位，只保留本地占位实现，不触达敏感凭据、账号流程或外部系统。";
    default:
      return goal;
  }
}

export function compileGoal(goal) {
  return [
    {
      id: "analyze",
      type: "analysis",
      prompt: buildPrompt(goal, "analysis"),
    },
    {
      id: "design",
      type: "design",
      prompt: buildPrompt(goal, "design"),
    },
    {
      id: "codegen",
      type: "codegen",
      prompt: buildPrompt(goal, "codegen"),
    },
  ];
}
