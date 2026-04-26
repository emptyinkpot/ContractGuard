# Push Rules - 推送规则

**版本**: 1.0.0  
**最后更新**: 2026-04-26  
**来源**: 提取自 `C:\Users\ASUS-KL\.codex\AGENTS.md`

---

## 核心规则

### 1. 默认 Commit + Push

**规则**: 用户要求"把变更落地"但没指定机制时，优先最小完整交付路径：默认 commit + push

**来源**: `AGENTS.md` - Git And Repo Boundary - Defaults

**说明**:
- 工作流或用户要求使 PR 成为自然下一步时再开 PR
- 不要只 commit 不 push，除非用户明确要求

**检查点**:
- [ ] 确认已经 commit
- [ ] 确认 remote 已配置
- [ ] 执行 push

---

### 2. 验证 Branch State

**规则**: 对已配置 push remote 的 repo-managed implementation work，本地验证后如仍有未提交/未推送的 in-scope 改动，不要直接结束

**来源**: `AGENTS.md` - Git And Repo Boundary - Defaults

**有效结束状态**:
- `commit + push` - 已提交并推送
- `blocked` - 被阻止（说明原因）
- `local-only by request` - 用户明确要求只保留本地

**检查点**:
- [ ] 运行 `git status --branch` 检查 ahead/behind
- [ ] 如果 branch 仍 ahead，执行 push
- [ ] 如果不能 push，明确说明原因

---

### 3. 最终答复前验证

**规则**: 最终答复前验证真实 branch state；如果 branch 仍 ahead，不要宣称已交付

**来源**: `AGENTS.md` - Git And Repo Boundary - Defaults

**检查命令**:
```bash
git status --branch
```

**检查点**:
- [ ] 确认 branch 不再 ahead
- [ ] 确认 push 成功
- [ ] 记录 push 结果

---

### 4. 不要把 Push 说成 Deployed

**规则**: 不要把 `push` 说成 `deployed`，除非真的运行了 deploy，或验证了覆盖改动路径的 repo auto-deploy workflow 已触发并成功完成

**来源**: `AGENTS.md` - Git And Repo Boundary - Hard gates

**说明**:
- `push` 只是推送到 GitHub
- `deployed` 是部署到运行环境
- 若是 auto-deploy，要报告 workflow 名称与 trigger scope

**检查点**:
- [ ] 区分 push 和 deploy
- [ ] 如果有 auto-deploy，检查 workflow 状态
- [ ] 报告准确的状态

---

### 5. Multi-Repo Estate 按 Owning Repo 闭环

**规则**: multi-repo estate 按 owning repo 向外闭环，不把 parent/child repos 当双重长期真相

**来源**: `AGENTS.md` - Git And Repo Boundary - Hard gates

**说明**:
- 先在 owning repo 完成 push
- 再同步到 umbrella repo / mirror repo
- 不要在多个 repo 并行维护同一份代码

**检查点**:
- [ ] 确认 owning repo
- [ ] 先 push 到 owning repo
- [ ] 再考虑同步到其他 repo

---

### 6. 仅当本地工作真需要时才 Clone

**规则**: 仅当本地 build / test / search / bulk-edit / runtime verification 真需要时才做 local clone / local work；能直接 GitHub-side 完成的，不要新建本地克隆

**来源**: `AGENTS.md` - Git And Repo Boundary - Hard gates

**说明**:
- 优先使用 GitHub API / gh CLI
- 避免不必要的本地克隆
- 如果必须本地工作，先复用已有 checkout

**检查点**:
- [ ] 确认是否真的需要本地克隆
- [ ] 优先使用 GitHub-side 操作
- [ ] 如果需要本地，复用已有 checkout

---

### 7. 在 Server 上优先做 Deploy

**规则**: 在 server 上优先做 deploy、sync、checkout update、environment/config change、runtime artifact refresh；避免把 repo-managed source edit 直接写在 server 上

**来源**: `AGENTS.md` - Git And Repo Boundary - Defaults

**说明**:
- Server 是 deploy target，不是 source authoring root
- 源码修改应该在本地或 GitHub 上完成
- Server 上只做部署和配置

**检查点**:
- [ ] 确认不在 server 上直接修改源码
- [ ] 源码修改在本地完成
- [ ] Push 到 GitHub 后再部署到 server

---

### 8. Repo 内并发工作的处理

**规则**: repo 内其他并发工作只有在同文件/同 hunk 冲突、branch head 不兼容前移、或 destructive action 会覆盖他人改动时才阻断当前执行

**来源**: `AGENTS.md` - Git And Repo Boundary - Defaults

**说明**:
- 不要因为有其他人在工作就停止
- 只有真正冲突时才需要处理
- 使用 git pull --rebase 处理冲突

**检查点**:
- [ ] 检查是否有冲突
- [ ] 如果有冲突，解决后再 push
- [ ] 如果没有冲突，直接 push

---

## 执行流程

```
1. 确认已经 commit
   ↓
2. 检查 remote 配置
   ↓
3. 验证 branch state (git status --branch)
   ↓
4. 检查是否 ahead
   ↓
5. 执行 git push
   ↓
6. 验证 push 成功
   ↓
7. 区分 push vs deploy
   ↓
8. 如果有 auto-deploy，检查 workflow
   ↓
9. 记录 delivery state
```

---

## Push 失败处理

### 常见失败原因

1. **Remote 未配置**
   - 检查: `git remote -v`
   - 解决: `git remote add origin <url>`

2. **Branch 落后于 remote**
   - 检查: `git status --branch`
   - 解决: `git pull --rebase` 或 `git pull`

3. **权限问题**
   - 检查: SSH key 或 token
   - 解决: 配置正确的认证

4. **Protected branch**
   - 检查: GitHub branch protection rules
   - 解决: 创建 PR 而不是直接 push

---

## 与其他规则的关系

- **Commit Rules**: push 之前必须先 commit
- **Deploy Rules**: push 之后才能 deploy
- **CI/CD Rules**: push 后自动触发 CI/CD

---

## 参考

- `C:\Users\ASUS-KL\.codex\AGENTS.md` - Git And Repo Boundary
- `C:\Users\ASUS-KL\.codex\REPO-OWNERSHIP-MAP.md`
- `E:\My Project\Atramenti-Console\codex\mcps\github-delivery-mcp\server.mjs`
