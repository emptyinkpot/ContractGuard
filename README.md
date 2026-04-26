# ContractGuard
## 通用项目合同与 AI 行为门禁手册

> 版本定位：本文件是 ContractGuard 的唯一人类入口、项目说明入口与工程手册主文档。  
> 项目使命：把 `README.md + project.json + behavior gate` 这套治理基线做成可被任意工程仓复用的独立项目，而不是继续附着在某个业务仓内部。  
> 冲突处理：若本文件与派生说明冲突，以本文件为准；派生文档只允许补充，不允许重定义项目边界。

## 0. 项目说明入口

```yaml
projectName: ContractGuard
canonicalDoc: README.md
machineReadableEntry: project.json
localSourceRoot: E:\My Project\ContractGuard
codexCompatRoot: codex
githubRepo: local-only
defaultBranch: main
guardRoot: guards/ai-behavior
schemaRoot: templates/project-contract
validationTool: tools/validate-project-contract.mjs
primaryCli: guards/ai-behavior/core/check-ai-behavior.mjs
planGateHook: guards/ai-behavior/hooks/invoke-plan-gate.ps1
diffGateHook: guards/ai-behavior/hooks/invoke-diff-gate.ps1
```

- 这是一个独立治理项目，不再隶属于 `Atramenti-Console` 的 repo 语义。
- 人类优先读取 `README.md`；自动化优先读取 `project.json`。
- 当前目标不是提供业务功能，而是提供一套可复用的项目合同、schema、行为评分与拦截能力。

### 0.1 对外简介

ContractGuard 是一个面向通用工程仓的治理项目。它负责两件事：

- 定义 repo-root `project.json` 的 machine-readable 项目合同
- 提供 plan/diff 级别的 AI behavior gate，对高风险行为给出 `allow / review / block`

它适合作为其他项目引用、复制或二次接入的上游治理仓，而不是作为某一个业务系统的内嵌目录继续演化。

### 0.2 快速开始

- 项目名：`ContractGuard`
- 本机目录：`E:\My Project\ContractGuard`
- 行为门禁 CLI：`guards/ai-behavior/core/check-ai-behavior.mjs`
- task pipeline CLI：`tools/task-pipeline/run-task-pipeline.mjs`
- task pipeline policy：`tools/task-pipeline/policy/task-pipeline-policy.json`
- codex compatibility root：`codex`
- global gateway contract：`C:\Users\ASUS-KL\.codex\rules\contractguard-gateway.json`
- gateway root setter：`C:\Users\ASUS-KL\.codex\automations\set-contractguard-gateway-root.ps1`
- gateway toggle script：`C:\Users\ASUS-KL\.codex\automations\toggle-contractguard-gateway.ps1`
- plan gate hook：`guards/ai-behavior/hooks/invoke-plan-gate.ps1`
- diff gate hook：`guards/ai-behavior/hooks/invoke-diff-gate.ps1`
- project contract schema：`templates/project-contract/project.schema.json`
- schema validator：`tools/validate-project-contract.mjs`

### 0.3 仓库信息卡

| 项目 | 值 |
| --- | --- |
| 本机目录 | `E:\My Project\ContractGuard` |
| 项目定位 | 通用治理仓 / 可复用 contract + behavior gate |
| 人类入口 | `README.md` |
| 机器入口 | `project.json` |
| codex 兼容根 | `codex` |
| 全局 gateway machine contract | `C:\Users\ASUS-KL\.codex\rules\contractguard-gateway.json` |
| gateway root setter | `C:\Users\ASUS-KL\.codex\automations\set-contractguard-gateway-root.ps1` |
| gateway toggle script | `C:\Users\ASUS-KL\.codex\automations\toggle-contractguard-gateway.ps1` |
| 主 gate 根 | `guards/ai-behavior` |
| task pipeline 入口 | `tools/task-pipeline/run-task-pipeline.mjs` |
| task pipeline policy | `tools/task-pipeline/policy/task-pipeline-policy.json` |
| 主 schema 根 | `templates/project-contract` |
| 默认运行环境 | `node` + `PowerShell` |

## 1. Truth Layer

### 1.1 Current Topology

```text
consumer repo
  ├─ reads ContractGuard project schema
  ├─ adopts repo-root project.json
  └─ invokes behavior gate for plan/diff checks
            ↓
        ContractGuard
          ├─ templates/project-contract
          └─ guards/ai-behavior
```

- ContractGuard 当前是一个本地独立项目目录。
- 它提供模板、schema、validator 与行为门禁逻辑。
- 它不再把 `Atramenti-Console` 当作自己的 canonical source root。
- 它现在还提供 `codex/` 兼容层，作为 Codex execution gateway 的统一 fallback gate root。

### 1.2 Public Contract

- `project.json` 是 machine-readable 项目入口。
- `README.md` 是 human-readable 项目入口。
- `templates/project-contract/project.schema.json` 是 contract schema。
- `guards/ai-behavior/core/check-ai-behavior.mjs` 是 canonical behavior gate CLI。
- `tools/task-pipeline/run-task-pipeline.mjs` 是 canonical task pipeline CLI。
- `tools/task-pipeline/policy/task-pipeline-policy.json` 是 canonical task pipeline policy。
- `codex/` 是面向 Codex execution gateway 的兼容入口根。
- `C:\Users\ASUS-KL\.codex\rules\contractguard-gateway.json` 是全局 Codex gateway 指向 `ContractGuard` 的 machine contract。

### 1.3 Directory Map

| 路径 | 作用 |
| --- | --- |
| `guards/ai-behavior` | AI 行为分析、评分、plan/diff gate hook |
| `codex` | Codex execution gateway 的兼容入口、统一 fallback gate root 与 plan/context 兼容层 |
| `tools/task-pipeline` | goal -> compile -> plan -> safe-check -> execute 的本地安全执行 pipeline |
| `templates/project-contract` | `project.json` 合同模板与 schema |
| `tools` | 本地 validator 与辅助工具 |
| `docs` | 接入说明、迁移说明与 consumer 指南 |

## 2. Constraint Layer

### 2.1 Forbidden Actions

- 不把任意 consumer repo 的业务上下文写回 ContractGuard 作为真相。
- 不让某个业务仓的私有目录结构决定 ContractGuard 的公开 contract。
- 不在 wrapper 层复制平行 gate 逻辑，canonical gate 只维护在 `guards/ai-behavior`。
- 不把单个项目的临时路径、端口、部署细节硬编码为通用 schema 的必填事实。

### 2.2 System Invariants

- `README.md` 是人类入口。
- `project.json` 是机器入口。
- `templates/project-contract/project.schema.json` 是 contract schema 真源。
- `guards/ai-behavior` 是 behavior gate 真源。

### 2.3 文档与替换忠实性

- 当任务目标是“直接吸收”“原样替换”“不要修正”时，优先服从用户字面指令，不先切换到优化、润色或重组模式。
- 当用户只允许格式清理时，变更范围仅限 Markdown 结构、代码块、标题层级、列表格式与明显排版问题；不得改变句意、语气、顺序或章节结构。
- 当存在多个候选草稿时，以用户最后一次明确确认的版本为唯一替换源。
- 对替换型任务，先执行替换，再根据用户后续要求决定是否进入建议或评审流程。

## 3. Strategy Layer

### 3.1 Reuse Strategy

1. 先复制或引用 `templates/project-contract/project.schema.json`。
2. 再为 consumer repo 落 `project.json`。
3. 然后把 `guards/ai-behavior` 的 CLI/hook 接入该仓的 plan/diff 流程。
4. 最后再根据该仓的 canonical docs 微调 policy，而不是先改 wrapper。

### 3.1.1 Unified Gate Entry Strategy

ContractGuard 现在承担 Codex 的统一 gate 入口角色：

- 对于已经提供完整 repo-local `codex/` gateway layout 的项目，Codex 继续读取该项目自己的 context 与 plan ledger。
- 对于未提供完整 repo-local gateway layout 的项目，`C:\\Users\\ASUS-KL\\.codex\\gateway.ps1` 会在 machine contract `enabled=true` 时回退到 `E:\\My Project\\ContractGuard\\codex`。
- gate 脚本、plan bootstrap 与 gateway 兼容入口统一集中在 `ContractGuard`，避免同类门槛程序分散在多个 repo。
- `.codex` 通过 machine contract 显式指向 `ContractGuard`，避免未来因为 repo-local 漂移或脚本硬编码回退而失去统一入口。
- machine contract 现在包含 `enabled`、`contractGuardRoot` 与 `contractGuardCodexRoot`；关闭统一根时，gateway 会回退到 repo-local gate chain，不再强制使用 `ContractGuard` fallback。
- 本地切换统一 gate 根时，不直接手改 JSON；使用：

```powershell
& 'C:\Users\ASUS-KL\.codex\automations\toggle-contractguard-gateway.ps1' -Status
& 'C:\Users\ASUS-KL\.codex\automations\toggle-contractguard-gateway.ps1' -Disable
& 'C:\Users\ASUS-KL\.codex\automations\set-contractguard-gateway-root.ps1' -ContractGuardRoot 'E:\My Project\ContractGuard'
& 'C:\Users\ASUS-KL\.codex\automations\toggle-contractguard-gateway.ps1' -Enable
```
- 这层集中的是“门槛程序与兼容入口”，不是把业务 repo 的源代码真相迁入 `ContractGuard`。

### 3.2 Validation Strategy

- 先做 `project.json` schema 校验。
- 再做 `check-ai-behavior.mjs --self-test`。
- 再做 docs example diff 验证，确认 `README.md` / `docs/*.md` 里的演示命令不会被误判成真实高风险改动。
- 再做 plan gate safe/risky 样例。
- 若 consumer repo 已 git 化，再补 diff gate 验证。

### 3.3 任务编译层与安全执行 Pipeline

ContractGuard 对“将高层目标直接交给 AI 一步完成”的执行方式持谨慎态度。推荐采用结构化的任务编译与分阶段执行流程，将用户目标转化为可审计、可验证、边界清晰的子任务序列，以提升工程质量、可追溯性与风险可控性。

推荐的 canonical 执行流程如下：

```text
Goal
  -> Task Compiler
  -> Task Planner
  -> Plan Gate (含 Safety Verifier)
  -> Staged Executor
  -> Diff Gate
  -> Trace Auditor
  -> Result + Audit Log
```

Task Compiler：将用户高层目标重写并分解为结构化的子任务（例如：需求分析、架构设计、接口合同定义、状态机描述、伪代码或代码骨架）。优先使用中性、专业术语，确保每个子任务聚焦于设计与规划层面。
Task Planner：为每个子任务补充执行顺序、依赖关系、边界条件、预期输出格式和成功准则，形成完整、可执行的计划。
Plan Gate (含 Safety Verifier)：在执行前进行多维度审查，包括风险评估、合规检查和意图一致性验证。若检测到潜在高风险元素（真实外部操作、敏感权限使用等），则触发进一步细化或标记为需人工介入。支持有限轮次迭代（推荐上限 3 轮），以确保计划既忠实于用户意图，又处于安全边界内。
Staged Executor：按计划分阶段执行，优先在 AI 可控区（分析、设计、生成伪代码/骨架、模拟实现、本地验证）内完成，并生成完整的执行 trace。
Diff Gate：执行完成后对照原始用户要求与计划，验证结果的一致性与合规性。
Trace Auditor：生成结构化审计记录，保留计划、执行过程、验证结果与交接证据，支持事后复盘与持续改进。

该流程的核心目标是通过工程化分解与多层守门（gates），使任务自然符合安全策略，同时提升可审计性和可维护性。ContractGuard 负责定义清晰的边界、统一的评分标准，并确保整个链路可重复验证。

### 3.4 分阶段执行原则

对于涉及外部系统、真实账户、敏感凭据、批量操作或高不确定性的目标，推荐采用以下默认四阶段拆分：

分析与需求澄清：解释问题、收集上下文、识别风险点与约束条件。
架构与合同设计：定义模块结构、接口合同、状态机、数据流与依赖关系。
受限实现生成：输出伪代码、代码骨架、模拟实现、本地测试脚本或沙箱验证代码。
敏感操作 handoff：真实外部调用、密钥注入、部署、账号操作等高风险步骤，明确标记为“需人工确认”或“受控执行器接管”，并提供完整的 handover checklist 与风险评估报告。

默认将前三阶段视为 AI 安全参与区，第四阶段视为 显式受控区（推荐 human-in-the-loop 或 sandboxed executor）。此拆分能显著降低不可审计执行、权限越界和意外副作用，同时保持合理的工程推进效率。

### 3.5 执行边界

在 ContractGuard 语义下，安全执行 pipeline 应明确以下边界，以实现 defense-in-depth：
允许的操作（AI 可安全参与区）：

需求分析、架构设计、接口与合同定义、状态机描述
伪代码生成、代码骨架构建、局部实现与重构
模拟环境下的测试样例、mock 调用与本地验证
完整 trace 记录、风险评估报告和 handover checklist 生成

默认不允许自动完成的操作（需剥离或人工接管）：

真实账号注册、验证码处理、敏感凭据注入或直接使用
未授权的外部 API 调用、生产环境部署
批量自动化操作（尤其是涉及真实用户数据或平台规则的场景）
任何可能绕过平台限制或违反服务条款的行为

边界处理规则：

若任务必须触达真实系统，必须将对应动作从 AI 子任务中完全剥离，并转为人工确认流程或专用受控执行器。
任一 Gate 若判定为 block 或 high-risk，应停止当前执行链路，并提供清晰的理由、边界说明与后续 handoff 建议，而非尝试通过措辞调整继续推进。
所有输出必须附带结构化 trace，支持事后审计与合规审查。
对需要进一步细化的步骤，应设置明确的轮次上限（推荐不超过 3 轮）、退出条件与人工接管机制，避免无界迭代。

通过上述设计，ContractGuard 将 AI 辅助开发转化为一种可信、可审计的企业级工程实践，在保障安全边界的同时，帮助用户以可控的方式高效达成目标。

### 3.6 推荐的最小模块切分

对于接入 ContractGuard 的 consumer repo，可把任务编译与安全执行能力收敛到以下最小模块：

- `context`：保存 goal、steps、results、trace。
- `compiler`：把高层目标编译为分析、设计、实现等子任务。
- `planner`：补齐顺序、状态、依赖和预期输出。
- `plan-gate`：对计划做规则级检查，并在需要时递归细分。
- `safety-verifier`：在计划通过后补充受控执行条件、handoff 标记与人工确认要求。
- `staged-executor`：按 phase 分阶段执行通过 gate 的步骤，并保留阶段级 trace。
- `diff-gate`：对照目标与执行结果检查偏离。
- `trace-auditor`：审计阶段闭环、结果覆盖率与 trace 完整性。
- `actions/*`：承载分析、设计、codegen 等具体执行单元。

### 3.6.1 Plan Gate Policy

当前仓库把 Plan Gate 的细分策略抽成独立 policy 文件：`tools/task-pipeline/policy/task-pipeline-policy.json`。

- `maxRefinementDepth`：限制单步最大细分深度。
- `manualHandoffOnMaxDepth`：达到最大细分深度后，是否自动生成人工接管步骤。
- `refinementRules`：按 `analysis`、`design`、`codegen`、`default` 定义细分模板。
- `manualHandoffTemplate`：定义最大细分深度后的接管模板。
- `traceStagesRequired`：定义 Diff Gate 认为必须出现的 trace 阶段。
- `goalKeywordPolicy`：定义“用户目标 vs 执行结果”偏离检查所需的关键词覆盖阈值与忽略词。

这意味着 Plan Gate 的行为不再硬编码在实现里，而是由 policy 驱动；consumer repo 或后续版本可以在不改核心执行器的情况下微调细分策略。

这组模块的价值在于把“不可直接执行的目标”转换成“可验证的安全步骤”，并把行为门禁放到执行链前后，而不是只在最后对结果补救。

### 3.7 当前仓库内置落地

本仓当前已经内置一个最小可运行的 task pipeline 垂直切片：

- 入口：`tools/task-pipeline/run-task-pipeline.mjs`
- 模块：`context.mjs`、`compiler.mjs`、`planner.mjs`、`plan-gate.mjs`、`safety-verifier.mjs`、`full-executor.mjs`（导出 staged executor）、`diff-gate.mjs`、`trace-auditor.mjs`、`safe-guard.mjs`、`actions/*`
- 默认输出：JSON 结果，包含 `goal`、`policyPath`、`compiledSteps`、`plannedSteps`、`planGate`、`safetyVerifier`、`steps`、`results`、`diffGate`、`auditLog`、`trace`
- 目标：演示如何把高层目标先编译为结构化步骤，经 Plan Gate 细分与 Safety Verifier 复核后交给阶段化执行器，再由 Diff Gate 与 Trace Auditor 检查偏离与审计闭环

### 3.8 Codex Gateway Compatibility Layer

当前仓库还内置了 `codex/` 兼容层，用于成为 Codex execution gateway 的统一 fallback gate root：

- `codex/PROJECT-CONTEXT.md`
- `codex/SESSION-HANDOFF.md`
- `codex/guards/ai-behavior/hooks/invoke-plan-gate.ps1`
- `codex/guards/ai-behavior/hooks/invoke-diff-gate.ps1`
- `codex/skills/plan-history-recall/scripts/*`
- `codex/plugins/obsidian/data/docs/agent/plan.md`

这层兼容入口的设计目标是：

- 集中门槛程序与 gateway 入口
- 保留对 repo-local context / plan ledger 的兼容能力
- 在目标 repo 缺少完整 `codex/` gateway layout 且 machine contract `enabled=true` 时，为 Codex 提供稳定 fallback

与之配套的 `.codex` 控制层约定如下：

- `C:\Users\ASUS-KL\.codex\rules\contractguard-gateway.json` 是唯一 machine contract 写入点
- `C:\Users\ASUS-KL\.codex\automations\set-contractguard-gateway-root.ps1` 负责原子更新 `contractGuardRoot` / `contractGuardCodexRoot`
- `C:\Users\ASUS-KL\.codex\automations\toggle-contractguard-gateway.ps1` 负责 `-Enable` / `-Disable` / `-Status`
- 回滚方式不是手工删配置，而是 `-Disable` 回退到 repo-local chain，或 `-Enable` 恢复统一 gate 根

本实现刻意保持为本地、安全、可审计的最小切片，不触达真实账号、真实密钥、外部服务调用或部署流程。

## 4. Canonical Files

- `README.md`
- `project.json`
- `docs/quickstart.md`
- `docs/consumer-integration.md`
- `templates/project-contract/README.md`
- `templates/project-contract/project.schema.json`
- `guards/ai-behavior/core/check-ai-behavior.mjs`
- `guards/ai-behavior/hooks/invoke-plan-gate.ps1`
- `guards/ai-behavior/hooks/invoke-diff-gate.ps1`
- `guards/ai-behavior/policy/ai-behavior-guard.json`
- `tools/task-pipeline/policy/task-pipeline-policy.json`
- `tools/task-pipeline/run-task-pipeline.mjs`
- `tools/task-pipeline/safety-verifier.mjs`
- `tools/task-pipeline/trace-auditor.mjs`
- `codex/PROJECT-CONTEXT.md`
- `codex/SESSION-HANDOFF.md`
- `codex/guards/ai-behavior/hooks/invoke-plan-gate.ps1`
- `codex/guards/ai-behavior/hooks/invoke-diff-gate.ps1`
- `codex/skills/plan-history-recall/scripts/invoke-plan-preflight.ps1`
- `codex/skills/plan-history-recall/scripts/append-plan.ps1`
- `tools/validate-project-contract.mjs`
