# IR Preprocess & Apply Commands Implementation

## Goal

实现 `transpec-preprocess` 和 `transpec-apply` CLI 命令，完成 IR Schema 2.0 规范定义的三阶段工作流。

## Requirements

### 1. transpec-preprocess 命令
- [x] 创建 `packages/cli/src/cli/commands/preprocess.ts`
- [x] 在 CLI 注册 preprocess 命令
- [x] 实现 EnhancedAnalysis 提取逻辑
- [x] 创建 OpenSpec 预处理 skill 定义
- [x] 创建 Trellis 预处理 skill 定义
- [ ] 更新 IRMetadata: aiPreProcessed=true (在 storage 层实现)

### 2. transpec-apply 命令
- [x] 复用现有的 `transpec convert` 命令 (已包含所有 phases)
- [x] `transpec apply` 命令用于 post-migration skills

### 3. Skill System 增强
- [x] 创建 `src/core/skill/skills/openspec-preprocess/SKILL.md`
- [x] 创建 `src/core/skill/skills/trellis-preprocess/SKILL.md`
- [x] SkillExecutor 添加 getAll() 和 getByTrigger() 方法

## Implementation Summary

### 新增文件
- `packages/cli/src/cli/commands/preprocess.ts` - preprocess 命令
- `packages/cli/src/core/skill/skills/openspec-preprocess/SKILL.md` - OpenSpec 分析 skill
- `packages/cli/src/core/skill/skills/trellis-preprocess/SKILL.md` - Trellis 分析 skill

### 修改文件
- `packages/cli/src/cli/index.ts` - 添加 preprocess 命令注册
- `packages/cli/src/cli/commands/index.ts` - 导出 preprocessCommand
- `packages/cli/src/core/skill/skill.ts` - 添加 getAll/getByTrigger 方法

### Skill 目录结构
```
src/core/skill/skills/           # 包内置 skills (编译到 dist)
  ├── analyze-semantics/         # 已有
  ├── framework-mapper/         # 已有
  ├── openspec-preprocess/      # 新增
  ├── resolve-relations/         # 已有
  └── trellis-preprocess/       # 新增

.transpec/skills/               # 用户项目 skills (运行时)
  └── generate-trellis-specs/   # 已有
```

## Acceptance Criteria

- [x] `transpec-preprocess --help` 正常工作
- [x] `transpec-preprocess` 能加载 entities 并提取 enhancedAnalysis
- [x] Skill 文件存在于 `src/core/skill/skills/*-preprocess/SKILL.md`
- [ ] IRMetadata.aiPreProcessed 在预处理后为 true (需要在 storage 层实现)

## Notes

- transpec-preprocess 目前使用模拟分析 (simulateEnhancedAnalysis)
- 真正的 LLM API 调用需要后续集成
- transpec-apply 已存在，用于 post-migration skills
