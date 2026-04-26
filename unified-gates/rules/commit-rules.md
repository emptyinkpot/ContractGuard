# Commit Rules - 提交规则

**版本**: 1.0.0  
**最后更新**: 2026-04-26  
**来源**: 提取自 `C:\Users\ASUS-KL\.codex\AGENTS.md`

---

## 核心规则

### 1. 识别 Owning Repo

**规则**: commit / push 前先识别 true owning repo

**来源**: `AGENTS.md` - Git And Repo Boundary - Hard gates

**说明**:
- 对 repo-managed code，GitHub 中 owning repo 是唯一长期 source of truth
- 不要默认在 deploy server 上并行维护源码
- 先按 `repo role + change boundary` 判断，不按仓大/仓小或路径远近判断

**检查点**:
- [ ] 确认当前目录的 owning repo
- [ ] 确认 repo role（owning / umbrella / mirror-backup）
- [ ] 确认 owned boundaries

---

### 2. 只 Stage Intended Change Boundary

**规则**: 只 stage intended change boundary

**来源**: `AGENTS.md` - Git And Repo Boundary - Hard gates

**说明**:
- 不要 `git add -A` 或 `git add .`，可能意外包含敏感文件
- 优先添加具体文件名
- 避免包含 `.env`、`credentials`、大型二进制文件

**检查点**:
- [ ] 明确要提交的文件列表
- [ ] 排除敏感文件
- [ ] 排除临时文件和构建产物

---

### 3. Delivery State Requirement

**规则**: repo-managed work 结束前必须明确 delivery state

**来源**: `AGENTS.md` - Git And Repo Boundary - Hard gates

**有效状态**:
- `pushed` - 已推送到远程
- `local-only by request` - 用户明确要求只保留本地
- `not-needed` - 不需要提交（如临时测试）
- `blocked` - 被阻止（说明原因）

**说明**:
- 如果 commit / push / PR 没做，要说原因
- 不能直接结束任务而不明确 delivery state

**检查点**:
- [ ] 确定 delivery state
- [ ] 如果不是 `pushed`，说明原因

---

### 4. Commit Message 规范

**规则**: 使用规范的 commit message 格式

**格式**:
```
<type>(<scope>): <description>

<body>

Co-Authored-By: <agent_name> <email>
```

**Type 类型**:
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档变更
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关
- `style`: 代码格式
- `perf`: 性能优化

**示例**:
```
feat(auth): add user authentication

Implement JWT-based authentication system with login/logout endpoints.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

### 5. 验证 No Conflicts

**规则**: commit 前验证没有冲突

**检查点**:
- [ ] 运行 `git status` 检查冲突
- [ ] 解决所有冲突标记
- [ ] 确认所有文件都是 staged 或 untracked 状态

---

### 6. 非平凡工作需要 Plan

**规则**: 非平凡工作没有 plan，不算正式开始

**来源**: `AGENTS.md` - Task Gates

**说明**:
- 优先用 repo 的 canonical plan record
- 没有时才用当前对话/plan tool 临时承接

**检查点**:
- [ ] 确认是否需要 plan
- [ ] 如果需要，确认 plan 已创建

---

### 7. Runtime State 不进 Git

**规则**: runtime state 默认不要进 Git truth

**来源**: `AGENTS.md` - Git And Repo Boundary - Defaults

**说明**:
- 日志文件、临时文件、缓存文件不应提交
- 使用 `.gitignore` 排除这些文件

**检查点**:
- [ ] 确认没有 runtime state 文件被 staged
- [ ] 检查 `.gitignore` 是否正确配置

---

## 执行流程

```
1. 识别 Owning Repo
   ↓
2. 确认 Change Boundary
   ↓
3. Stage Intended Files Only
   ↓
4. 验证 No Conflicts
   ↓
5. 编写 Commit Message
   ↓
6. 执行 git commit
   ↓
7. 记录 Delivery State
```

---

## 与其他规则的关系

- **Push Rules**: commit 之后才能 push
- **Deploy Rules**: commit/push 之后才能 deploy
- **Verification Rules**: commit 前后都需要验证

---

## 参考

- `C:\Users\ASUS-KL\.codex\AGENTS.md` - Git And Repo Boundary
- `C:\Users\ASUS-KL\.codex\AGENTS.md` - Task Gates
- `C:\Users\ASUS-KL\.codex\REPO-OWNERSHIP-MAP.md`
