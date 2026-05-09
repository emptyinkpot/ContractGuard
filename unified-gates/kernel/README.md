# Execution Kernel v1

最后更新：2026-04-27

## Purpose

- 为 unified-gates 提供可落地的 Agent Runtime Kernel 骨架
- 把 mode classifier、constraint resolver、plan compiler、graph scheduler、checkpoint store 从 policy 概念层推进到 repo 级实现层
- 维持“先有契约、再有执行器”的执行内核设计方式

## Directory Layout

- `core/`
  - `execution-kernel.mjs`
  - `mode-classifier.mjs`
  - `constraint-resolver.mjs`
  - `plan-compiler.mjs`
  - `graph-scheduler.mjs`
  - `checkpoint-store.mjs`
  - `observability-trace.mjs`
- `contracts/`
  - `execution-graph.schema.json`
  - `execution-state.schema.json`
  - `checkpoint.schema.json`
  - `trace-event.schema.json`

## Runtime Pipeline

1. classify mode
2. resolve constraints
3. compile task into execution graph
4. schedule ready nodes
5. execute bounded actions
6. commit outputs deterministically
7. checkpoint graph state
8. emit trace events

## Runnable Demo Surface

- `PlanCompiler.compile()` 现在支持：
  - `task.nodes + task.edges`
  - `task.steps[]` 顺序任务自动编译成最小 DAG
  - 无 step 时自动生成单节点 inspect graph
- `GraphScheduler.execute()` 现在支持：
  - batch 执行 ready nodes
  - 默认 builtin action runner：`inspect / transform / tool / llm`
  - structured result merge：`{ nodeId, status, outputs }`
- `CheckpointStore` 现在支持：
  - JSON checkpoint 持久化
  - `loadLatest(graphId)`
  - `restoreGraph(snapshot)`
- `ExecutionKernel.run()` 现在支持最小闭环：
  - classify -> resolve -> compile -> schedule -> execute -> commit -> checkpoint -> trace
  - node-level trace events: `selected / rejected / committed`
  - `rejected` reason codes: `dependency-wait / already-terminal / not-pending`
  - derived `executionState` artifact per run/commit
  - strict `pathLock` invariant: immutable strategy, same-path-only retry, no fallback
- `ModeClassifier.classify()` 现在支持：
  - 显式 `modeHint`
  - 基于 task evidence 的 `deterministic / probabilistic / resilience` 判定
- `ConstraintResolver.resolve()` 现在支持：
  - `task.constraints` 规范化
  - runtime envelope 约束提取
  - step action capability 提取
- demo entry:
  - `demo-run.mjs`
  - `examples/sequential-task.json`
  - `examples/explicit-graph.json`
  - `validate-demo.mjs`

## Demo Run

- entry:
  - `node demo-run.mjs`
- validation:
  - `node validate-demo.mjs`
- expected behavior:
  - 读取 `examples/sequential-task.json`
  - 编译 3-step sequential task 为最小 control DAG
  - 运行 `examples/explicit-graph.json` 的显式 graph 路径
  - 执行 builtin `inspect -> transform -> llm`
  - 输出 structured result、trace、以及 latest checkpoint
  - 输出独立 `executionState` artifact
  - 校验 `examples/explicit-graph.json` 与 demo runtime 输出是否满足 kernel contracts
  - 显式校验 `emit-report` 先 `dependency-wait` 再 `committed`
  - 校验 `restoreGraph(snapshot)` 是否恢复完整 graph contract，包括 `pathLock`

## Notes

- 这是 v1 skeleton，不是完整生产调度器
- 所有接口先以 deterministic commit / explicit trace / structured output 为约束
- 工具层不得直接写 kernel state；只能返回结构化结果，再由 scheduler commit
