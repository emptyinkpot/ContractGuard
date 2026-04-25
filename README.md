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
| 主 gate 根 | `guards/ai-behavior` |
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

### 1.2 Public Contract

- `project.json` 是 machine-readable 项目入口。
- `README.md` 是 human-readable 项目入口。
- `templates/project-contract/project.schema.json` 是 contract schema。
- `guards/ai-behavior/core/check-ai-behavior.mjs` 是 canonical behavior gate CLI。

### 1.3 Directory Map

| 路径 | 作用 |
| --- | --- |
| `guards/ai-behavior` | AI 行为分析、评分、plan/diff gate hook |
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

## 3. Strategy Layer

### 3.1 Reuse Strategy

1. 先复制或引用 `templates/project-contract/project.schema.json`。
2. 再为 consumer repo 落 `project.json`。
3. 然后把 `guards/ai-behavior` 的 CLI/hook 接入该仓的 plan/diff 流程。
4. 最后再根据该仓的 canonical docs 微调 policy，而不是先改 wrapper。

### 3.2 Validation Strategy

- 先做 `project.json` schema 校验。
- 再做 `check-ai-behavior.mjs --self-test`。
- 再做 plan gate safe/risky 样例。
- 若 consumer repo 已 git 化，再补 diff gate 验证。

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
- `tools/validate-project-contract.mjs`
