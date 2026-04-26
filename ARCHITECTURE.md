# ContractGuard 统一门禁架构设计

最后更新：2026-04-26

## 一、设计目标

将分散在多处的行为控制规则、门禁策略、GitHub 交付配置统一归拢到 `E:\My Project\ContractGuard`，实现：

1. **单一真相源**：所有门禁规则在一个地方维护
2. **清晰分层**：策略、配置、执行分离
3. **易于审计**：一眼看清"什么行为受什么规则控制"
4. **向后兼容**：现有 Codex/Claude 配置通过引用方式接入

---

## 二、架构树状图

```
E:\My Project\ContractGuard\
│
├── 📋 policies/                          # 策略层（决定"允许什么"）
│   ├── global-behavior-policy.json      # 全局行为策略（新增）
│   ├── github-delivery-policy.json      # GitHub 交付策略（新增）
│   ├── cicd-trigger-policy.json         # CI/CD 触发策略（新增）
│   └── approval-policy.json             # 审批策略（新增）
│
├── 🔧 config/                            # 配置层（决定"怎么做"）
│   ├── github-delivery.json             # GitHub 交付配置（整合）
│   ├── github-workflow.json             # GitHub Workflow 配置（整合）
│   ├── repo-ownership.json              # 仓库所有权配置（整合）
│   └── execution-gates.json             # 执行门禁配置（整合）
│
├── 🎯 rules/                             # 规则层（决定"什么时候做"）
│   ├── commit-rules.md                  # 提交规则（提取自 AGENTS.md）
│   ├── push-rules.md                    # 推送规则（提取自 AGENTS.md）
│   ├── deploy-rules.md                  # 部署规则（提取自 AGENTS.md）
│   └── verification-rules.md            # 验证规则（提取自 AGENTS.md）
│
├── 🚪 gates/                             # 门禁层（执行检查）
│   ├── pre-commit.ps1                   # 提交前门禁
│   ├── pre-push.ps1                     # 推送前门禁
│   ├── pre-deploy.ps1                   # 部署前门禁
│   └── post-push.ps1                    # 推送后门禁（检查 CI/CD）
│
├── 🔌 adapters/                          # 适配器层（连接现有系统）
│   ├── codex-adapter.ps1                # Codex 适配器
│   ├── claude-adapter.ps1               # Claude 适配器
│   └── mcp-adapter.ps1                  # MCP 适配器
│
├── 📊 schemas/                           # Schema 层（验证配置）
│   ├── global-behavior-policy.schema.json
│   ├── github-delivery-policy.schema.json
│   ├── cicd-trigger-policy.schema.json
│   └── repo-ownership.schema.json
│
├── 🛠️ tools/                             # 工具层（辅助脚本）
│   ├── validate-policies.ps1            # 验证所有策略
│   ├── sync-to-codex.ps1                # 同步到 Codex
│   ├── sync-to-claude.ps1               # 同步到 Claude
│   └── audit-behavior.ps1               # 审计行为日志
│
├── 📚 docs/                              # 文档层
│   ├── ARCHITECTURE.md                  # 本文档
│   ├── MIGRATION-GUIDE.md               # 迁移指南
│   ├── POLICY-REFERENCE.md              # 策略参考
│   └── TROUBLESHOOTING.md               # 故障排查
│
├── 🧪 tests/                             # 测试层
│   ├── test-commit-gate.ps1
│   ├── test-push-gate.ps1
│   └── test-policy-validation.ps1
│
├── 📝 logs/                              # 日志层
│   └── gate-audit.log                   # 门禁审计日志
│
└── 🎛️ MASTER-CONTROL.json                # 主控文件（总开关）
```

---

## 三、核心文件设计

### 3.1 主控文件：`MASTER-CONTROL.json`

这是整个 ContractGuard 的总开关，所有行为的最高优先级配置。

```json
{
  "$schema": "./schemas/master-control.schema.json",
  "version": "1.0.0",
  "enabled": true,
  "last_updated": "2026-04-26T00:00:00Z",
  
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
    "sync_on_change": true,
    "sync_script": "./tools/sync-to-codex.ps1"
  },
  
  "audit": {
    "enabled": true,
    "log_path": "./logs/gate-audit.log",
    "retention_days": 30
  }
}
```

### 3.2 GitHub 交付策略：`policies/github-delivery-policy.json`

```json
{
  "$schema": "../schemas/github-delivery-policy.schema.json",
  "version": "1.0.0",
  
  "auto_push": {
    "enabled": true,
    "description": "repo-managed work 结束后自动推送",
    "conditions": {
      "require_remote_configured": true,
      "require_changes_verified": true,
      "skip_if_blocked": true
    },
    "exceptions": {
      "paths": [
        "C:\\Users\\ASUS-KL\\.codex\\.tmp\\*"
      ],
      "repos": []
    }
  },
  
  "delivery_state_requirement": {
    "enabled": true,
    "description": "repo-managed work 必须明确 delivery state",
    "valid_states": ["pushed", "local-only by request", "not-needed", "blocked"],
    "default_state": "pushed"
  },
  
  "commit_behavior": {
    "auto_stage_changes": true,
    "require_commit_message": true,
    "commit_message_template": "{type}({scope}): {description}\n\nCo-Authored-By: {agent_name}",
    "allowed_commit_types": ["feat", "fix", "docs", "refactor", "test", "chore"]
  },
  
  "push_behavior": {
    "default_push": true,
    "push_to_remote": "origin",
    "push_branch": "current",
    "force_push_allowed": false,
    "verify_before_push": true
  },
  
  "pr_behavior": {
    "auto_create_pr": false,
    "pr_on_feature_branch": true,
    "pr_template_path": null
  },
  
  "allowed_roots": [
    "C:\\Users\\ASUS-KL\\.codex",
    "E:\\My Project"
  ],
  
  "ownership_map_path": "./config/repo-ownership.json",
  "working_copy_root": "C:\\Users\\ASUS-KL\\.codex\\.tmp\\working-copies"
}
```

### 3.3 CI/CD 触发策略：`policies/cicd-trigger-policy.json`

```json
{
  "$schema": "../schemas/cicd-trigger-policy.schema.json",
  "version": "1.0.0",
  
  "auto_check": {
    "enabled": true,
    "description": "推送后自动检查 CI/CD workflow",
    "check_delay_seconds": 10,
    "max_wait_seconds": 300,
    "poll_interval_seconds": 30
  },
  
  "auto_verify": {
    "enabled": true,
    "description": "自动验证 workflow 是否成功",
    "require_all_checks_pass": true,
    "fail_on_workflow_failure": true
  },
  
  "workflow_detection": {
    "auto_detect_workflows": true,
    "workflow_patterns": [
      "**/.github/workflows/*.yml",
      "**/.github/workflows/*.yaml"
    ],
    "trigger_keywords": ["deploy", "release", "publish", "ci", "cd"]
  },
  
  "reporting": {
    "report_workflow_status": true,
    "report_format": "summary",
    "include_workflow_name": true,
    "include_trigger_scope": true
  },
  
  "failure_handling": {
    "on_workflow_failure": "report",
    "retry_on_transient_failure": false,
    "notify_user": true
  }
}
```

### 3.4 全局行为策略：`policies/global-behavior-policy.json`

```json
{
  "$schema": "../schemas/global-behavior-policy.schema.json",
  "version": "1.0.0",
  
  "execution_policy": {
    "approval_policy": "never",
    "sandbox_mode": "danger-full-access",
    "default_execution_mode": "autonomous"
  },
  
  "task_completion_gates": {
    "require_plan": true,
    "require_verification": true,
    "require_deploy_decision": true,
    "require_delivery_state": true
  },
  
  "git_behavior": {
    "prefer_commit_and_push": true,
    "verify_branch_state": true,
    "check_ahead_behind": true,
    "default_to_owning_repo": true
  },
  
  "deploy_behavior": {
    "default_deploy_on_completion": true,
    "verify_deploy_success": true,
    "distinguish_push_from_deploy": true
  },
  
  "verification_requirements": {
    "user_visible_changes": "live_verification_required",
    "runtime_changes": "behavioral_verification_required",
    "config_changes": "validation_required"
  }
}
```

### 3.5 仓库所有权配置：`config/repo-ownership.json`

```json
{
  "$schema": "../schemas/repo-ownership.schema.json",
  "version": "1.0.0",
  "source": "C:\\Users\\ASUS-KL\\.codex\\REPO-OWNERSHIP-MAP.md",
  
  "repos": [
    {
      "path": "C:\\Users\\ASUS-KL\\.codex",
      "role": "mirror/backup repo",
      "owned_boundaries": ["全局 Codex consumer 层：规则、配置、自动化、本机状态"],
      "first_party_commits": "limited",
      "remote": "asus-kl-codex-home",
      "sync_order": 1
    },
    {
      "path": "E:\\My Project\\Atramenti-Console",
      "role": "owning repo",
      "owned_boundaries": ["console.tengokukk.com 产品代码"],
      "first_party_commits": "yes",
      "remote": "origin",
      "sync_order": 1
    },
    {
      "path": "E:\\My Project\\Mortis",
      "role": "owning repo",
      "owned_boundaries": ["Mortis / multica 主产品源码"],
      "first_party_commits": "yes",
      "remote": "mortis-multica-source",
      "sync_order": 1
    }
  ],
  
  "default_rules": {
    "owning_repo_first": true,
    "umbrella_repo_second": true,
    "mirror_repo_last": true
  }
}
```

---

## 四、执行流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户发起任务                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Codex/Claude 开始执行                           │
│         读取 ContractGuard/MASTER-CONTROL.json              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  代码修改完成                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              gates/pre-commit.ps1                            │
│   检查：commit-rules.md + global-behavior-policy.json       │
│   决定：是否允许 commit                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ (通过)
┌─────────────────────────────────────────────────────────────┐
│                  执行 git commit                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              gates/pre-push.ps1                              │
│   检查：push-rules.md + github-delivery-policy.json         │
│   决定：是否允许 push                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ (通过)
┌─────────────────────────────────────────────────────────────┐
│                  执行 git push                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              gates/post-push.ps1                             │
│   检查：cicd-trigger-policy.json                            │
│   动作：检查 GitHub Actions workflow 是否触发               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              等待 CI/CD 完成                                 │
│   轮询：workflow 状态                                        │
│   超时：max_wait_seconds                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              报告结果                                        │
│   成功：delivery_state = "pushed + CI passed"               │
│   失败：delivery_state = "pushed + CI failed"               │
│   超时：delivery_state = "pushed + CI pending"              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              记录审计日志                                    │
│   logs/gate-audit.log                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、与现有系统的集成

### 5.1 Codex 集成

**现有配置**：`C:\Users\ASUS-KL\.codex\config.toml`

**集成方式**：
1. 在 `config.toml` 中添加 ContractGuard 引用：
   ```toml
   [contractguard]
   enabled = true
   root = "E:\\My Project\\ContractGuard"
   master_control = "E:\\My Project\\ContractGuard\\MASTER-CONTROL.json"
   ```

2. MCP 服务器配置保持不变，但通过 `adapters/mcp-adapter.ps1` 读取 ContractGuard 策略

3. `AGENTS.md` 中添加引用：
   ```markdown
   ## ContractGuard Integration
   
   全局行为门禁由 ContractGuard 统一管理：
   - 主控文件：E:\My Project\ContractGuard\MASTER-CONTROL.json
   - 策略目录：E:\My Project\ContractGuard\policies\
   - 门禁脚本：E:\My Project\ContractGuard\gates\
   
   本文件中的规则与 ContractGuard 策略保持同步。
   ```

### 5.2 Claude 集成

**现有配置**：`C:\Users\ASUS-KL\CLAUDE.md`

**集成方式**：
1. 在 `CLAUDE.md` 中添加引用：
   ```markdown
   # ContractGuard 集成
   
   @E:\My Project\ContractGuard\MASTER-CONTROL.json
   @E:\My Project\ContractGuard\rules\commit-rules.md
   @E:\My Project\ContractGuard\rules\push-rules.md
   ```

2. 通过 `adapters/claude-adapter.ps1` 同步策略

### 5.3 GitHub Delivery MCP 集成

**现有代码**：`E:\My Project\Atramenti-Console\codex\mcps\github-delivery-mcp\server.mjs`

**集成方式**：
1. 在 MCP 启动时读取 `ContractGuard/config/github-delivery.json`
2. 修改 `publish_changes` 函数，从策略文件读取 `push` 默认值：
   ```javascript
   // 原代码：push: { type: "boolean", default: true }
   // 新代码：
   const policy = loadPolicy('github-delivery-policy.json');
   push: { type: "boolean", default: policy.push_behavior.default_push }
   ```

### 5.4 GitHub Workflow MCP 集成

**现有代码**：`E:\My Project\Atramenti-Console\codex\mcps\github-workflow-mcp\server.mjs`

**集成方式**：
1. 在 MCP 启动时读取 `ContractGuard/policies/cicd-trigger-policy.json`
2. 根据策略决定是否自动检查 workflow

---

## 六、迁移步骤

### Phase 1: 创建 ContractGuard 结构（1 天）

1. 创建目录结构
2. 编写主控文件 `MASTER-CONTROL.json`
3. 编写策略文件（4 个 policy JSON）
4. 编写配置文件（4 个 config JSON）
5. 编写 Schema 文件（验证）

### Phase 2: 提取现有规则（1 天）

1. 从 `AGENTS.md` 提取规则到 `rules/*.md`
2. 从 `REPO-OWNERSHIP-MAP.md` 提取到 `config/repo-ownership.json`
3. 从 `config.toml` 提取相关配置

### Phase 3: 编写门禁脚本（2 天）

1. 编写 `gates/pre-commit.ps1`
2. 编写 `gates/pre-push.ps1`
3. 编写 `gates/post-push.ps1`
4. 编写 `gates/pre-deploy.ps1`

### Phase 4: 编写适配器（1 天）

1. 编写 `adapters/codex-adapter.ps1`
2. 编写 `adapters/claude-adapter.ps1`
3. 编写 `adapters/mcp-adapter.ps1`

### Phase 5: 集成测试（2 天）

1. 测试 Codex 集成
2. 测试 Claude 集成
3. 测试 MCP 集成
4. 端到端测试

### Phase 6: 文档和工具（1 天）

1. 编写迁移指南
2. 编写策略参考文档
3. 编写验证工具
4. 编写同步工具

---

## 七、优势分析

### 7.1 单一真相源

**之前**：
- `config.toml` 控制 MCP 能力
- `AGENTS.md` 控制行为倾向
- `github-delivery-mcp` 代码控制 push 默认值
- `REPO-OWNERSHIP-MAP.md` 控制仓库策略

**之后**：
- `ContractGuard/MASTER-CONTROL.json` 是总开关
- 所有策略在 `policies/` 目录
- 所有配置在 `config/` 目录
- 所有规则在 `rules/` 目录

### 7.2 清晰分层

```
策略层 (policies/)     → 决定"允许什么"
配置层 (config/)       → 决定"怎么做"
规则层 (rules/)        → 决定"什么时候做"
门禁层 (gates/)        → 执行检查
适配器层 (adapters/)   → 连接现有系统
```

### 7.3 易于审计

- 所有行为变更都有审计日志：`logs/gate-audit.log`
- 每个门禁执行都记录：时间、策略、结果、原因
- 可以追溯"为什么这次自动 push 了"

### 7.4 灵活切换

通过 `MASTER-CONTROL.json` 的 `behavior_modes`，可以一键切换：
- `autonomous`：完全自主
- `semi_autonomous`：半自主
- `manual`：手动模式

### 7.5 向后兼容

- 现有 Codex/Claude 配置不需要大改
- 通过适配器层渐进式集成
- 可以逐步迁移，不影响现有功能

---

## 八、下一步行动

### 立即可做：

1. **创建目录结构**
   ```powershell
   mkdir E:\My Project\ContractGuard\{policies,config,rules,gates,adapters,schemas,tools,docs,tests,logs}
   ```

2. **编写主控文件**
   - 创建 `MASTER-CONTROL.json`
   - 设置初始开关状态

3. **提取第一批规则**
   - 从 `AGENTS.md` 提取 commit/push 规则
   - 创建 `rules/commit-rules.md`
   - 创建 `rules/push-rules.md`

### 需要你确认：

1. **行为模式默认值**
   - 你希望默认是 `autonomous`、`semi_autonomous` 还是 `manual`？

2. **审批策略**
   - 是否需要在某些情况下强制审批？

3. **CI/CD 检查超时**
   - 默认等待 5 分钟够吗？

4. **日志保留**
   - 审计日志保留 30 天够吗？

---

## 九、FAQ

### Q1: 这会破坏现有功能吗？
**A**: 不会。通过适配器层，现有系统继续工作，ContractGuard 作为统一控制层叠加在上面。

### Q2: 迁移需要多久？
**A**: 完整迁移约 7-8 天。但可以分阶段进行，先创建结构，再逐步迁移规则。

### Q3: 如果 ContractGuard 出问题怎么办？
**A**: 可以通过 `MASTER-CONTROL.json` 的 `enabled: false` 一键禁用，回退到原有系统。

### Q4: 性能影响？
**A**: 门禁脚本执行时间 < 100ms，对整体流程影响可忽略。

### Q5: 如何调试门禁问题？
**A**: 查看 `logs/gate-audit.log`，每次门禁执行都有详细记录。

---

**准备好开始了吗？我可以立即帮你创建这个架构！**
