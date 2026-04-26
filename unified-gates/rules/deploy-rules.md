# Deploy Rules - 部署规则

**版本**: 1.0.0  
**最后更新**: 2026-04-26  
**来源**: 提取自 `C:\Users\ASUS-KL\.codex\AGENTS.md`

---

## 核心规则

### 1. Deploy Decision Requirement

**规则**: 任何会改变 runnable behavior、deployment target、deploy-required artifact 或 live runtime state 的工作，结束前必须记录 deploy decision

**来源**: `AGENTS.md` - Task Gates

**有效状态**:
- `deployed` - 已部署
- `not-needed` - 不需要部署
- `blocked` - 被阻止（说明原因）

**检查点**:
- [ ] 确定是否需要部署
- [ ] 如果需要，执行部署
- [ ] 记录 deploy decision

---

### 2. 默认以 Deploy 完成为目标

**规则**: 只要同边界内还有 required next action，任务就不算完成；如果请求 outcome 依赖 live deployed target，除非用户明确只做 pre-deploy，否则先完成 deploy，再结束

**来源**: `AGENTS.md` - Task Gates

**说明**:
- 任务默认以 completion 为目标
- 如果 outcome 需要 deploy 到 live target，先 deploy 再结束
- 若不能 deploy，要明确 `blocked`

**检查点**:
- [ ] 确认任务是否需要 deploy
- [ ] 如果需要，完成 deploy
- [ ] 如果不能 deploy，说明原因

---

### 3. 区分 Push 和 Deploy

**规则**: 不要把 `push` 说成 `deployed`，除非真的运行了 deploy，或验证了覆盖改动路径的 repo auto-deploy workflow 已触发并成功完成

**来源**: `AGENTS.md` - Git And Repo Boundary - Hard gates

**说明**:
- `push` = 推送到 GitHub
- `deployed` = 部署到运行环境（server/cloud/production）
- 若是 auto-deploy，要报告 workflow 名称与 trigger scope

**检查点**:
- [ ] 明确区分 push 和 deploy
- [ ] 如果有 auto-deploy workflow，检查其状态
- [ ] 报告准确的部署状态

---

### 4. Verify Deploy Success

**规则**: 部署后验证部署是否成功

**检查方式**:
- 检查 CI/CD workflow 状态
- 检查部署目标的健康状态
- 验证功能是否正常工作

**检查点**:
- [ ] 部署完成后检查状态
- [ ] 验证服务是否正常运行
- [ ] 记录验证结果

---

### 5. Runtime-Touching Repair 优先检查 Canonical Path

**规则**: runtime-touching repair 若在未检查 canonical path、health/debug contract、in-place repair option 前就换成新 proxy/provider/endpoint/base URL/entrypoint，任务不算完成

**来源**: `AGENTS.md` - Task Gates

**说明**:
- 优先修复现有路径
- 不要轻易替换成新的 endpoint
- 除非用户明确要求替换

**检查点**:
- [ ] 检查 canonical path
- [ ] 尝试 in-place repair
- [ ] 只有在必要时才替换

---

### 6. Repo-Managed Source Change 同时触及 Deployed Server

**规则**: repo-managed source change 同时触及 deployed server 时，除非用户明确只要 server-only hotfix，否则 source change 未进入 owning repo remote，任务不算完成

**来源**: `AGENTS.md` - Task Gates

**说明**:
- 源码修改应该先进入 GitHub
- 然后再部署到 server
- 不要只在 server 上修改

**检查点**:
- [ ] 源码修改已 push 到 GitHub
- [ ] 然后再部署到 server
- [ ] 或明确说明为什么是 server-only hotfix

---

## 部署流程

### 标准部署流程

```
1. 代码修改完成
   ↓
2. 本地验证
   ↓
3. git commit
   ↓
4. git push
   ↓
5. CI/CD 自动触发（如果配置）
   ↓
6. 等待 CI/CD 完成
   ↓
7. 验证部署成功
   ↓
8. 记录 deploy decision
```

### Auto-Deploy 流程

```
1. git push
   ↓
2. GitHub Actions 自动触发
   ↓
3. 检测 workflow 触发
   ↓
4. 等待 workflow 完成
   ↓
5. 检查 workflow 状态
   ↓
6. 报告 workflow 名称和结果
   ↓
7. 记录 deploy decision
```

### Manual Deploy 流程

```
1. git push
   ↓
2. SSH 到 server
   ↓
3. git pull 或 checkout
   ↓
4. 安装依赖（如需要）
   ↓
5. 重启服务
   ↓
6. 验证服务状态
   ↓
7. 记录 deploy decision
```

---

## 部署验证

### 验证检查点

1. **服务状态**
   - 服务是否正常运行
   - 端口是否正常监听
   - 进程是否存在

2. **健康检查**
   - Health endpoint 是否返回 200
   - 关键功能是否正常
   - 日志是否有错误

3. **功能验证**
   - 核心功能是否工作
   - API 是否响应
   - 前端是否可访问

---

## 部署失败处理

### 常见失败原因

1. **CI/CD 失败**
   - 检查 workflow 日志
   - 修复失败的测试或构建
   - 重新 push

2. **部署脚本失败**
   - 检查部署日志
   - 验证权限和配置
   - 手动修复

3. **服务启动失败**
   - 检查服务日志
   - 验证依赖和配置
   - 回滚到上一个版本

---

## 与其他规则的关系

- **Commit Rules**: 部署前必须先 commit
- **Push Rules**: 部署前必须先 push
- **Verification Rules**: 部署后必须验证

---

## 参考

- `C:\Users\ASUS-KL\.codex\AGENTS.md` - Task Gates
- `C:\Users\ASUS-KL\.codex\AGENTS.md` - Git And Repo Boundary
- `C:\Users\ASUS-KL\.codex\MEMORY.md` - Common Ops
