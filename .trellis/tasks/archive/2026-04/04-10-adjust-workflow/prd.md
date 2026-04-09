# 调整 preprocess 和 apply 命令工作流

## 用户场景

```
Shell: transpec init

Agent IDE:
  1. transpec preprocess   # auto-run convert + preprocess skills
  2. transpec apply      # final transformation
```

## 问题

当前实现与规范定义有偏差：

| 命令 | 当前行为 | 期望行为 |
|------|----------|----------|
| `transpec preprocess` | 仅提取 enhanced analysis | 自动先执行 convert，再运行 preprocess skills |
| `transpec apply` | 复制 post-migration skills | 执行最终转换 |

## 需求

### 1. 修改 transpec preprocess

- [x] 自动调用 `transpec convert` (Parse phase)
- [x] 然后运行 preprocess skills 进行 LLM 语义分析
- [x] 更新 IRMetadata: aiPreProcessed = true

### 2. 修改 transpec apply

- [x] 重命名或重新实现为"最终转换"命令
- [x] 使用 enhancedAnalysis 作为上下文进行转换
- [x] 更新 IRMetadata: aiPostProcessed = true
- [x] 让 `transpec apply` 直接调用 `ConversionEngine.runTransformEmit()`

### 3. 规范文档更新

- [ ] 更新 ir-design-principles.md 中的工作流描述
- [ ] 明确 preprocess 和 apply 的职责

## Technical Notes

- `transpec convert` 可以通过 `mode: 'on-demand'` 仅执行 Parse phase
- 或者直接调用 `ConversionEngine.runParsePhase()`

## Acceptance Criteria

- [ ] `transpec preprocess` 自动执行 convert + preprocess skills
- [ ] `transpec apply` 执行最终转换
- [ ] 规范文档与实现一致
