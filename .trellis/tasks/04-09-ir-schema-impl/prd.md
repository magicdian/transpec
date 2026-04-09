# IR Schema 2.0 实现 - EnhancedAnalysis 和 AI Processing States

## Goal

实现 d0e5016 和 3efd071 提交中定义的 IR Schema 2.0 规范变更：

1. 将 `IRMetadata.aiAnalyzed` 拆分为 `aiPreProcessed` 和 `aiPostProcessed`
2. 新增 `EnhancedAnalysis` 接口及其存储结构
3. 新增 `ProjectSummary` 接口
4. 实现 B+C 混合批处理策略（用于大项目）

## Requirements

### 1. TypeScript 类型更新 (packages/cli/src/core/ir/types.ts)
- [x] `EnhancedAnalysis` 接口 - types.ts:37-45
- [x] `ProjectSummary` 接口 - types.ts:94-99
- [x] `aiAnalyzed` → `aiPreProcessed` + `aiPostProcessed` - types.ts:81-82
- [x] `preprocessedAt`, `preprocessedBy` 字段 - types.ts:86-88

### 2. 代码更新
- [x] `aiAnalyzed` 不再存在于代码中 (已验证)
- [x] 在 metadata 中正确存储 enhancedAnalysis - engine.ts:307-311

### 3. 实现 B+C 批处理策略
- [x] 创建 `PreprocessBatch` 和 `PreprocessState` 接口 - types.ts:112-127
- [x] 实现基于依赖图的拓扑排序批处理 - batch-processor.ts:51-91
- [x] 实现上下文大小管理 - batch-processor.ts:96-165
- [x] 实现批次结果合并 - batch-processor.ts:205-247

## Implementation Summary

### 新增文件
- `packages/cli/src/core/engine/batch-processor.ts` - B+C 批处理实现

### 修改文件
- `packages/cli/src/core/ir/types.ts` - 添加 PreprocessBatch, PreprocessState 接口
- `packages/cli/src/core/engine/engine.ts` - 集成批处理器
- `packages/cli/src/core/engine/index.ts` - 导出 BatchProcessor

## Acceptance Criteria

- [x] `aiAnalyzed` 不再存在于代码中
- [x] `EnhancedAnalysis` 正确存储在 `entity.metadata.enhancedAnalysis`
- [x] 批处理接口已定义
- [ ] lint 和 typecheck 通过 (TypeScript 未安装，无法验证)

## Technical Notes

- B+C 策略是可选增强，核心 Schema 变更已完成
- `runAnalyzePhase` 目前使用模拟分析，正式实现时需要调用 LLM API
