# Verification Rules - 验证规则

**版本**: 1.0.0  
**最后更新**: 2026-04-26  
**来源**: 提取自 `C:\Users\ASUS-KL\.codex\AGENTS.md`

---

## 核心规则

### 1. User-Visible 变更需要 Live Verification

**规则**: user-visible 变更结束前必须记录 live verification decision

**来源**: `AGENTS.md` - Task Gates

**有效状态**:
- `passed` - 验证通过
- `not-needed` - 不需要验证
- `blocked` - 被阻止（说明原因）

**说明**:
- 若需要 live verification，至少要有一个具体 artifact
- 或诚实标 `not-needed` / `blocked`

**检查点**:
- [ ] 确定是否需要 live verification
- [ ] 如果需要，执行验证
- [ ] 记录 verification decision

---

### 2. 验证强度要匹配风险

**规则**: 需要 runtime、behavioral、visual、environment confirmation 的任务，不能只靠 file inspection 声称 verified；证据强度要匹配风险

**来源**: `AGENTS.md` - Task Gates

**验证级别**:
- **File Inspection**: 检查文件内容
- **Static Analysis**: 静态分析
- **Unit Tests**: 单元测试
- **Integration Tests**: 集成测试
- **Manual Testing**: 手动测试
- **Live Verification**: 实际运行验证

**检查点**:
- [ ] 确定任务的风险级别
- [ ] 选择匹配的验证方式
- [ ] 提供足够的验证证据

---

### 3. 验证要求按变更类型

**规则**: 不同类型的变更需要不同的验证

**来源**: `AGENTS.md` - Runtime Protocol - Defaults

**验证要求**:
- **user-visible 变更**: live verification required
- **runtime 变更**: behavioral verification required
- **config 变更**: validation required
- **documentation 变更**: review recommended

**检查点**:
- [ ] 确定变更类型
- [ ] 执行对应的验证
- [ ] 记录验证结果

---

### 4. 没有 Verification，任务不算完成

**规则**: 没有 verification，任务不算完成

**来源**: `AGENTS.md` - Runtime Protocol - Hard gates

**说明**:
- 所有非平凡任务都需要验证
- 验证是任务完成的必要条件
- 不能跳过验证直接结束

**检查点**:
- [ ] 确认已执行验证
- [ ] 验证结果已记录
- [ ] 验证通过或明确说明原因

---

### 5. Frontend / User-Visible UI 验证

**规则**: frontend / user-visible UI 工作结束前要有 brief self-check；primary desktop viewport 要有 anti-overlap check

**来源**: `AGENTS.md` - Task Gates

**检查内容**:
- Pattern verdict
- State coverage
- Anti-pattern sweep result
- Anti-overlap check

**检查点**:
- [ ] 执行 self-check
- [ ] 检查 desktop viewport
- [ ] 验证没有 overlap
- [ ] 记录检查结果

---

### 6. 本地验证后仍有未推送改动

**规则**: 对已配置 push remote 的 repo-managed implementation work，本地验证后如仍有未提交/未推送的 in-scope 改动，不要直接结束

**来源**: `AGENTS.md` - Git And Repo Boundary - Defaults

**说明**:
- 本地验证通过后，应该 push
- 不要只验证不推送
- 要么 commit + push，要么明确 `blocked` / `local-only by request`

**检查点**:
- [ ] 本地验证通过
- [ ] 检查是否有未推送的改动
- [ ] 如果有，执行 push

---

## 验证流程

### 标准验证流程

```
1. 代码修改完成
   ↓
2. 静态检查（linting, type checking）
   ↓
3. 单元测试
   ↓
4. 集成测试
   ↓
5. 本地运行验证
   ↓
6. commit + push
   ↓
7. CI/CD 自动测试
   ↓
8. Live verification（如需要）
   ↓
9. 记录 verification decision
```

### Frontend 验证流程

```
1. 代码修改完成
   ↓
2. 启动 dev server
   ↓
3. 浏览器打开页面
   ↓
4. 验证 golden path
   ↓
5. 验证 edge cases
   ↓
6. 检查 desktop viewport
   ↓
7. Anti-overlap check
   ↓
8. 检查其他功能是否回归
   ↓
9. 记录 verification decision
```

---

## 验证检查清单

### 代码质量

- [ ] 代码符合项目规范
- [ ] 没有明显的 bug
- [ ] 没有安全漏洞
- [ ] 性能可接受

### 功能正确性

- [ ] 核心功能正常工作
- [ ] Edge cases 处理正确
- [ ] 错误处理完善
- [ ] 用户体验良好

### 集成完整性

- [ ] 与其他模块集成正常
- [ ] API 调用正确
- [ ] 数据流正确
- [ ] 没有破坏现有功能

### 部署就绪

- [ ] 配置正确
- [ ] 依赖完整
- [ ] 文档更新
- [ ] 可以部署

---

## 验证失败处理

### 失败类型

1. **静态检查失败**
   - 修复 linting 错误
   - 修复 type 错误
   - 重新检查

2. **测试失败**
   - 分析失败原因
   - 修复代码或测试
   - 重新运行测试

3. **功能验证失败**
   - 重现问题
   - 修复 bug
   - 重新验证

4. **性能问题**
   - 分析性能瓶颈
   - 优化代码
   - 重新测试性能

---

## 与其他规则的关系

- **Commit Rules**: 验证通过后才 commit
- **Push Rules**: 本地验证通过后才 push
- **Deploy Rules**: 部署后需要验证

---

## 参考

- `C:\Users\ASUS-KL\.codex\AGENTS.md` - Task Gates
- `C:\Users\ASUS-KL\.codex\AGENTS.md` - Runtime Protocol
