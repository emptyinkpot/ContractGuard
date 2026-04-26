# Unified Gates - 统一行为门禁系统

**版本**: 1.0.0  
**最后更新**: 2026-04-26  
**父项目**: ContractGuard  
**维护者**: Codex & Claude 双智能体系统

---

## 🎯 定位

Unified Gates 是 ContractGuard 的子系统，专注于统一管理 Codex 和 Claude 的**执行行为控制**，包括：

- 自动提交/推送控制
- GitHub 交付策略
- CI/CD 触发与验证
- 行为模式切换

与 ContractGuard 主系统的关系：
- **ContractGuard 主系统**：AI 行为门禁（plan/diff gate）、项目合同、任务编译
- **Unified Gates**：执行行为控制（commit/push/cicd）、GitHub 交付、行为模式

---

## 📖 快速导航

- [为什么需要 Unified Gates](#为什么需要-unified-gates)
- [核心概念](#核心概念)
- [快速开始](#快速开始)
- [架构概览](#架构概览)
- [配置指南](#配置指南)
- [使用场景](#使用场景)
- [与 ContractGuard 主系统的集成](#与-contractguard-主系统的集成)

---

## 🤔 为什么需要 Unified Gates？

### 问题背景

在 ContractGuard 主系统解决了"AI 应该做什么"（plan gate）和"AI 做了什么"（diff gate）之后，仍然存在一个问题：

**"AI 做完之后应该如何交付？"**

具体来说：
- 代码修改后，是否自动 commit？
- commit 后，是否自动 push 到 GitHub？
- push 后，是否自动检查 CI/CD？
- 如何在不同场景下切换这些行为？

这些行为控制之前分散在：
- `C:\Users\ASUS-KL\.codex\config.toml` - MCP 能力配置
- `C:\Users\ASUS-KL\.codex\AGENTS.md` - 行为规则
- `E:\My Project\Atramenti-Console\codex\mcps\github-delivery-mcp\server.mjs` - 代码中的默认值

### Unified Gates 的解决方案

将所有执行行为控制统一到一个地方：

```
E:\My Project\ContractGuard\unified-gates\
├── MASTER-CONTROL.json          # 总开关
├── policies/                    # 策略层
├── config/                      # 配置层
├── rules/                       # 规则层
├── gates/                       # 门禁层
└── adapters/                    # 适配器层
```

---

## 🧠 核心概念

### 主控文件

`MASTER-CONTROL.json` 是所有行为的总开关：

```json
{
  "global_switches": {
    "auto_commit": { "enabled": true },
    "auto_push": { "enabled": true },
    "auto_cicd_check": { "enabled": true },
    "auto_deploy_verify": { "enabled": true },
    "require_approval": { "enabled": false }
  },
  "behavior_modes": {
    "current_mode": "autonomous"
  }
}
```

### 三种行为模式

| 模式 | auto_commit | auto_push | auto_cicd_check | require_approval |
|------|-------------|-----------|-----------------|------------------|
| **autonomous** | ✅ | ✅ | ✅ | ❌ |
| **semi_autonomous** | ✅ | ❌ | ✅ | ✅ |
| **manual** | ❌ | ❌ | ❌ | ✅ |

### 五层架构

```
策略层 (policies/)   → 决定"允许什么"
配置层 (config/)     → 决定"怎么做"
规则层 (rules/)      → 决定"什么时候做"
门禁层 (gates/)      → 执行检查
适配器层 (adapters/) → 连接现有系统
```

---

## 🚀 快速开始

### 1. 查看当前配置

```powershell
# 查看当前行为模式
node "E:\My Project\ContractGuard\unified-gates\tools\get-current-mode.mjs"

# 查看所有开关状态
node "E:\My Project\ContractGuard\unified-gates\tools\get-switches.mjs"
```

### 2. 切换行为模式

```powershell
# 切换到半自主模式
node "E:\My Project\ContractGuard\unified-gates\tools\set-mode.mjs" semi_autonomous

# 切换到手动模式
node "E:\My Project\ContractGuard\unified-gates\tools\set-mode.mjs" manual

# 切换回自主模式
node "E:\My Project\ContractGuard\unified-gates\tools\set-mode.mjs" autonomous
```

### 3. 单独控制开关

```powershell
# 禁用自动推送
node "E:\My Project\ContractGuard\unified-gates\tools\set-switch.mjs" auto_push false

# 启用审批要求
node "E:\My Project\ContractGuard\unified-gates\tools\set-switch.mjs" require_approval true
```

### 4. 同步到 Codex/Claude

```powershell
# 同步到 Codex
node "E:\My Project\ContractGuard\unified-gates\tools\sync-to-codex.mjs"

# 同步到 Claude
node "E:\My Project\ContractGuard\unified-gates\tools\sync-to-claude.mjs"

# 同步到所有系统
node "E:\My Project\ContractGuard\unified-gates\tools\sync-all.mjs"
```

---

## 🏗️ 架构概览

### 完整目录树状图

```
E:\My Project\ContractGuard\unified-gates\
│
├── 📋 核心文件
│   ├── MASTER-CONTROL.json              # 主控文件（总开关）✅
│   ├── README.md                        # 本文档 ✅
│   └── SETUP-COMPLETE.md                # 创建完成总结 ✅
│
├── 📋 策略层 (policies/) - 决定"允许什么"
│   ├── global-behavior-policy.json      # 全局行为策略 ✅
│   │   ├── execution_policy             # 执行策略（approval_policy, sandbox_mode）
│   │   ├── task_completion_gates        # 任务完成门禁
│   │   ├── git_behavior                 # Git 行为配置
│   │   ├── deploy_behavior              # 部署行为配置
│   │   ├── verification_requirements    # 验证要求
│   │   └── auto_commit                  # 自动提交配置
│   │
│   ├── github-delivery-policy.json      # GitHub 交付策略 ✅
│   │   ├── auto_push                    # 自动推送配置
│   │   ├── delivery_state_requirement   # 交付状态要求
│   │   ├── commit_behavior              # 提交行为
│   │   ├── push_behavior                # 推送行为
│   │   ├── pr_behavior                  # PR 行为
│   │   ├── allowed_roots                # 允许的根目录
│   │   └── source_of_truth              # 真相源定义
│   │
│   ├── cicd-trigger-policy.json         # CI/CD 触发策略 ✅
│   │   ├── auto_check                   # 自动检查配置
│   │   ├── auto_verify                  # 自动验证配置
│   │   ├── workflow_detection           # Workflow 检测
│   │   ├── reporting                    # 报告配置
│   │   ├── failure_handling             # 失败处理
│   │   └── push_vs_deploy_distinction   # Push vs Deploy 区分
│   │
│   └── approval-policy.json             # 审批策略 ✅
│       ├── require_approval             # 审批要求
│       ├── conditional_approval         # 条件审批
│       ├── approval_workflow            # 审批流程
│       └── notification                 # 通知配置
│
├── 🔧 配置层 (config/) - 决定"怎么做"
│   ├── repo-ownership.json              # 仓库所有权配置 ✅
│   │   ├── repos[]                      # 仓库列表（7个仓库）
│   │   │   ├── .codex                   # Codex 配置仓
│   │   │   ├── Atramenti-Console        # 控制台项目
│   │   │   ├── Mortis                   # Mortis 项目
│   │   │   ├── MyBlog                   # 博客项目
│   │   │   ├── Token Pool               # Token Pool 项目
│   │   │   ├── ContractGuard            # 本项目
│   │   │   └── My Project               # Umbrella 仓库
│   │   ├── default_rules                # 默认规则
│   │   └── sync_strategy                # 同步策略
│   │
│   ├── execution-gates.json             # 执行门禁配置 ✅
│   │   ├── gates                        # 门禁定义
│   │   │   ├── pre_commit               # 提交前门禁
│   │   │   ├── pre_push                 # 推送前门禁
│   │   │   ├── post_push                # 推送后门禁
│   │   │   └── pre_deploy               # 部署前门禁
│   │   ├── gate_execution_order         # 执行顺序
│   │   ├── audit                        # 审计配置
│   │   └── error_handling               # 错误处理
│   │
│   ├── github-delivery.json             # GitHub 交付配置 ⏳
│   └── github-workflow.json             # GitHub Workflow 配置 ⏳
│
├── 🎯 规则层 (rules/) - 决定"什么时候做"
│   ├── commit-rules.md                  # 提交规则 ✅
│   │   ├── 识别 Owning Repo
│   │   ├── 只 Stage Intended Change Boundary
│   │   ├── Delivery State Requirement
│   │   ├── Commit Message 规范
│   │   ├── 验证 No Conflicts
│   │   ├── 非平凡工作需要 Plan
│   │   └── Runtime State 不进 Git
│   │
│   ├── push-rules.md                    # 推送规则 ✅
│   │   ├── 默认 Commit + Push
│   │   ├── 验证 Branch State
│   │   ├── 最终答复前验证
│   │   ├── 不要把 Push 说成 Deployed
│   │   ├── Multi-Repo Estate 按 Owning Repo 闭环
│   │   ├── 仅当本地工作真需要时才 Clone
│   │   ├── 在 Server 上优先做 Deploy
│   │   └── Repo 内并发工作的处理
│   │
│   ├── deploy-rules.md                  # 部署规则 ✅
│   │   ├── Deploy Decision Requirement
│   │   ├── 默认以 Deploy 完成为目标
│   │   ├── 区分 Push 和 Deploy
│   │   ├── Verify Deploy Success
│   │   ├── Runtime-Touching Repair 优先检查 Canonical Path
│   │   └── Repo-Managed Source Change 同时触及 Deployed Server
│   │
│   └── verification-rules.md            # 验证规则 ✅
│       ├── User-Visible 变更需要 Live Verification
│       ├── 验证强度要匹配风险
│       ├── 验证要求按变更类型
│       ├── 没有 Verification，任务不算完成
│       ├── Frontend / User-Visible UI 验证
│       └── 本地验证后仍有未推送改动
│
├── 🚪 门禁层 (gates/) - 执行检查
│   ├── pre-commit.mjs                   # 提交前门禁 ⏳
│   ├── pre-push.mjs                     # 推送前门禁 ⏳
│   ├── post-push.mjs                    # 推送后门禁 ⏳
│   └── pre-deploy.mjs                   # 部署前门禁 ⏳
│
├── 🔌 适配器层 (adapters/) - 连接现有系统
│   ├── codex-adapter.mjs                # Codex 适配器 ⏳
│   ├── claude-adapter.mjs               # Claude 适配器 ⏳
│   └── mcp-adapter.mjs                  # MCP 适配器 ⏳
│
├── 📊 Schema 层 (schemas/) - 验证配置
│   ├── master-control.schema.json       # 主控文件 Schema ⏳
│   ├── global-behavior-policy.schema.json ⏳
│   ├── github-delivery-policy.schema.json ⏳
│   ├── cicd-trigger-policy.schema.json  ⏳
│   ├── repo-ownership.schema.json       ⏳
│   └── execution-gates.schema.json      ⏳
│
├── 🛠️ 工具层 (tools/) - 辅助脚本
│   ├── get-current-mode.mjs             # 查看当前模式 ⏳
│   ├── get-switches.mjs                 # 查看所有开关 ⏳
│   ├── set-mode.mjs                     # 切换模式 ⏳
│   ├── set-switch.mjs                   # 设置单个开关 ⏳
│   ├── validate-policies.mjs            # 验证策略 ⏳
│   ├── sync-to-codex.mjs                # 同步到 Codex ⏳
│   ├── sync-to-claude.mjs               # 同步到 Claude ⏳
│   └── sync-all.mjs                     # 同步到所有系统 ⏳
│
├── 📚 文档层 (docs/)
│   ├── INTEGRATION.md                   # 集成指南 ⏳
│   ├── POLICY-REFERENCE.md              # 策略参考 ⏳
│   └── TROUBLESHOOTING.md               # 故障排查 ⏳
│
├── 🧪 测试层 (tests/)
│   ├── test-commit-gate.mjs             # 提交门禁测试 ⏳
│   ├── test-push-gate.mjs               # 推送门禁测试 ⏳
│   └── test-integration.mjs             # 集成测试 ⏳
│
└── 📝 日志层 (logs/)
    └── gate-audit.log                   # 门禁审计日志 ⏳

图例：
✅ 已完成
⏳ 待实现
```

### 文件统计

| 层级 | 已完成 | 待实现 | 总计 |
|------|--------|--------|------|
| 核心文件 | 3 | 0 | 3 |
| 策略层 | 4 | 0 | 4 |
| 配置层 | 2 | 2 | 4 |
| 规则层 | 4 | 0 | 4 |
| 门禁层 | 0 | 4 | 4 |
| 适配器层 | 0 | 3 | 3 |
| Schema 层 | 0 | 6 | 6 |
| 工具层 | 0 | 8 | 8 |
| 文档层 | 0 | 3 | 3 |
| 测试层 | 0 | 3 | 3 |
| 日志层 | 0 | 1 | 1 |
| **总计** | **13** | **30** | **43** |

**当前完成度**: 30.2% (13/43)

### 执行流程

```
用户发起任务
    ↓
Codex/Claude 读取 MASTER-CONTROL.json
    ↓
代码修改完成
    ↓
gates/pre-commit.mjs 检查
    ↓ (通过)
执行 git commit
    ↓
gates/pre-push.mjs 检查
    ↓ (通过)
执行 git push
    ↓
gates/post-push.mjs 检查 CI/CD
    ↓
等待 CI/CD 完成
    ↓
报告结果 + 记录审计日志
```

---

## ⚙️ 配置指南

### 主控文件配置

编辑 `MASTER-CONTROL.json`：

```json
{
  "version": "1.0.0",
  "enabled": true,
  
  "global_switches": {
    "auto_commit": {
      "enabled": true,
      "description": "是否允许自动提交",
      "policy_ref": "policies/global-behavior-policy.json#auto_commit"
    },
    "auto_push": {
      "enabled": true,
      "description": "是否允许自动推送",
      "policy_ref": "policies/github-delivery-policy.json#auto_push"
    },
    "auto_cicd_check": {
      "enabled": true,
      "description": "推送后是否自动检查 CI/CD",
      "policy_ref": "policies/cicd-trigger-policy.json#auto_check"
    },
    "auto_deploy_verify": {
      "enabled": true,
      "description": "是否自动验证部署结果",
      "policy_ref": "policies/cicd-trigger-policy.json#auto_verify"
    },
    "require_approval": {
      "enabled": false,
      "description": "是否需要用户审批",
      "policy_ref": "policies/approval-policy.json#require_approval"
    }
  },
  
  "behavior_modes": {
    "current_mode": "autonomous",
    "available_modes": {
      "autonomous": {
        "description": "完全自主：自动 commit/push/check CI",
        "auto_commit": true,
        "auto_push": true,
        "auto_cicd_check": true,
        "require_approval": false
      },
      "semi_autonomous": {
        "description": "半自主：自动 commit，推送前询问",
        "auto_commit": true,
        "auto_push": false,
        "auto_cicd_check": true,
        "require_approval": true
      },
      "manual": {
        "description": "手动模式：所有操作都需要确认",
        "auto_commit": false,
        "auto_push": false,
        "auto_cicd_check": false,
        "require_approval": true
      }
    }
  },
  
  "integration": {
    "codex_config_path": "C:\\Users\\ASUS-KL\\.codex\\config.toml",
    "claude_config_path": "C:\\Users\\ASUS-KL\\CLAUDE.md",
    "contractguard_root": "E:\\My Project\\ContractGuard",
    "sync_on_change": true
  },
  
  "audit": {
    "enabled": true,
    "log_path": "./logs/gate-audit.log",
    "retention_days": 30
  }
}
```

---

## 💡 使用场景

### 场景 1: 完全自主开发

```powershell
node "E:\My Project\ContractGuard\unified-gates\tools\set-mode.mjs" autonomous
```

效果：
- ✅ 代码修改后自动 commit
- ✅ 自动 push 到 GitHub
- ✅ 自动检查 CI/CD 状态

### 场景 2: 谨慎推送

```powershell
node "E:\My Project\ContractGuard\unified-gates\tools\set-mode.mjs" semi_autonomous
```

效果：
- ✅ 代码修改后自动 commit
- ⏸️ 推送前询问用户
- ✅ 推送后自动检查 CI/CD

### 场景 3: 完全手动控制

```powershell
node "E:\My Project\ContractGuard\unified-gates\tools\set-mode.mjs" manual
```

效果：
- ⏸️ commit 前询问
- ⏸️ push 前询问
- ⏸️ 所有操作需确认

---

## 🔗 与 ContractGuard 主系统的集成

### 集成点

Unified Gates 与 ContractGuard 主系统在以下点集成：

1. **Plan Gate 之后**
   - ContractGuard 的 plan gate 通过后
   - Unified Gates 的 pre-commit gate 检查是否允许 commit

2. **Diff Gate 之后**
   - ContractGuard 的 diff gate 通过后
   - Unified Gates 的 pre-push gate 检查是否允许 push

3. **共享审计日志**
   - 两个系统的审计日志可以合并查看

### 执行流程

```
用户发起任务
    ↓
ContractGuard: Task Compiler
    ↓
ContractGuard: Task Planner
    ↓
ContractGuard: Plan Gate ← Unified Gates: 读取 auto_commit 配置
    ↓ (通过)
ContractGuard: Staged Executor
    ↓
ContractGuard: Diff Gate
    ↓ (通过)
Unified Gates: pre-commit gate
    ↓ (通过)
执行 git commit
    ↓
Unified Gates: pre-push gate
    ↓ (通过)
执行 git push
    ↓
Unified Gates: post-push gate (检查 CI/CD)
    ↓
ContractGuard: Trace Auditor
    ↓
完成 + 审计日志
```

---

## 📚 相关文档

- [ContractGuard 主文档](../README.md)
- [架构设计](../ARCHITECTURE.md)
- [集成指南](./docs/INTEGRATION.md)
- [策略参考](./docs/POLICY-REFERENCE.md)
- [故障排查](./docs/TROUBLESHOOTING.md)

---

## 📝 更新日志

### v1.0.0 (2026-04-26)

**新增**：
- ✨ 初始版本发布
- ✨ 五层架构设计
- ✨ 主控文件系统
- ✨ 三种行为模式
- ✨ 与 ContractGuard 主系统集成

---

**最后更新**: 2026-04-26  
**版本**: 1.0.0  
**父项目**: ContractGuard
