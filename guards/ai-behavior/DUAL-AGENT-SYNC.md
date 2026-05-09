# Dual-Agent Sync Enforcement in ContractGuard

## 概述

ContractGuard 门禁系统现在强制执行 Codex 和 Claude 的同步维护规则。

## 新增硬阻断规则

### hard_single_agent_rule_change

- **ID**: `hard_single_agent_rule_change`
- **类别**: governance
- **严重级别**: critical
- **触发模式**:
  - `only codex` / `only claude`
  - `仅 codex` / `仅 claude`
  - `单独修改 codex` / `单独更新 claude`
  - `不同步 codex` / `不同步 claude`

- **阻断消息**: "检测到单智能体规则变更。Codex 和 Claude 必须同步维护，一个变动另一个也需要变动。"

## 同步目标

### 1. 全局规则文件
- **Codex**: `C:\Users\ASUS-KL\.codex\AGENTS.md`
- **Claude**: `C:\Users\ASUS-KL\CLAUDE.md`
- **同步要求**: 必须
- **类型**: global-rules

### 2. 共享内存
- **Codex**: `C:\Users\ASUS-KL\.codex\MEMORY.md`
- **Claude**: `C:\Users\ASUS-KL\.claude\projects\C--Users-ASUS-KL\memory`
- **同步要求**: 必须
- **类型**: shared-memory

### 3. 门禁策略
- **共享文件**: `E:\My Project\ContractGuard\guards\ai-behavior\policy\ai-behavior-guard.json`
- **同步要求**: 必须
- **类型**: gate-policy
- **注意**: 本文件是共享门禁策略，任何变更都影响两个智能体

## 同步协议

### 规则变更时 (onRuleChange)
必须在同一任务中同步更新 Codex 和 Claude 的规则文件

### 能力新增时 (onCapabilityAdd)
评估新能力对两个智能体的适用性，更新能力注册表

### 工具新增时 (onToolAdd)
确定工具的适用智能体（codex/claude/both），同步配置

### 内存更新时 (onMemoryUpdate)
更新共享内存层，保持知识格式一致性

### 验证 (verification)
使用 `C:\Users\ASUS-KL\.codex\orchestrator\sync-agents.ps1` 验证同步状态

## 违规类型

### 1. unsync_rule_change (未同步的规则变更)
- **严重级别**: critical
- **动作**: block
- **消息**: "规则变更未同步到另一个智能体"

### 2. single_agent_optimization (单智能体优化)
- **严重级别**: high
- **动作**: review
- **消息**: "仅优化单个智能体，未评估对另一个智能体的影响"

### 3. divergent_behavior (行为分歧)
- **严重级别**: high
- **动作**: review
- **消息**: "两个智能体的行为出现分歧，需要协调统一"

## 使用示例

### 正确做法 ✓

```markdown
## Plan: 更新全局规则

1. 同时修改 Codex 和 Claude 的规则文件
2. 更新能力注册表
3. 运行同步验证脚本
4. 确认两边规则一致

AI Behavior Gate: allow
- 同步更新两个智能体
- 使用标准同步协议
- 包含验证步骤
```

### 错误做法 ✗

```markdown
## Plan: 仅更新 Codex 规则

1. 修改 C:\Users\ASUS-KL\.codex\AGENTS.md
2. 不修改 Claude 规则

AI Behavior Gate: BLOCK
- 检测到单智能体规则变更
- 违反同步维护要求
```

## 验证命令

```powershell
# 检查同步状态
C:\Users\ASUS-KL\.codex\orchestrator\sync-agents.ps1 -Action check

# 验证一致性
C:\Users\ASUS-KL\.codex\orchestrator\sync-agents.ps1 -Action verify

# 生成同步报告
C:\Users\ASUS-KL\.codex\orchestrator\sync-agents.ps1 -Action report
```

## 集成到现有工作流

### Claude Hooks
- `C:\Users\ASUS-KL\.claude\hooks\plan-gate.ps1` - 计划阶段检查
- `C:\Users\ASUS-KL\.claude\hooks\diff-gate.ps1` - 变更阶段检查

### Codex Gateway
- `C:\Users\ASUS-KL\.codex\gateway.ps1` - 每次命令执行前检查

### 共享引擎
- `E:\My Project\ContractGuard\guards\ai-behavior\core\check-ai-behavior.mjs` - 统一检查逻辑

## 更新日志

- **2026-04-26**: 添加双智能体同步维护规则
  - 新增 `hard_single_agent_rule_change` 硬阻断规则
  - 添加 `dualAgentSyncRules` 配置节
  - 定义同步目标、协议和违规类型
