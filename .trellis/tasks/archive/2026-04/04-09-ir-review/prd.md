# brainstorm: IR架构评审与优化

## Goal

验证当前 IR 架构设计是否合理，能否在未来支持多种 spec 框架的稳定转换，同时最小化数据丢失。

## What I already know

### 用户澄清的工作流

```
transpec init → transpec-preprocess (IDE中) → transpec-apply (IDE中)
```

**新设计要点：**
- Preprocess = Parse (机械) + LLM Pre-process (分析)
- Preprocess 在原始结构破坏前执行
- IR 存储 RAW + Enhanced 双层信息
- Skills 需要框架无关，不能写死 "proposal"、"design" 等术语

### 用户确认的分析粒度

**混合模式 + 两个层级都要：**

1. **汇总级别 (Project Summary)** - 完整的产品设计/开发规范大纲
2. **实体级别 (Entity Analysis)** - 每个子项的细化分析

### 关键约束

- Skills **不能硬编码框架特定概念** (如 proposal, design, spec)
- Skills 必须是**通用的概念分析** (requirements, design decisions, implementation plans)
- 每个项目**只运行一次**，必须获取完整的项目信息

## Assumptions (temporary)

1. IR 需要支持 Project-level + Entity-level 双层 Enhanced 信息
2. Pre-process Skills 需要框架无关的设计
3. Enhanced 信息在 Apply 阶段作为约束和上下文

## Open Questions

~~1. **IR 结构**: 当前 CoreEntity 是否需要增加 projectSummary 字段？**→ 扩展 IRMetadata**~~ ✅ 已解决
2. **Skills 设计**: Framework-specific skills → common format output~~ ✅ 已解决
3. **转换管道**: Mappable → convert; Unmappable → discard + document via comments~~ ✅ 已解决

## Decision (ADR-lite)

### Context
用户确认需要 Project Summary + Entity Analysis 双层 Enhanced 信息，且 Skills 不能硬编码框架特定概念。

### Decision
1. **IRDocument**: 扩展 `IRMetadata`，增加 `projectSummary` 字段 + `aiPreProcessed`/`aiPostProcessed` 布尔值
2. **CoreEntity**: 直接使用 `metadata` 存储 enhancedAnalysis，无需修改 schema
3. **aiAnalyzed 废弃**: 替换为 `aiPreProcessed` 和 `aiPostProcessed`

### IRMetadata 扩展
```typescript
interface IRMetadata {
  convertedAt: string;
  conversionMode: 'sampling' | 'full' | 'on-demand';
  aiPreProcessed: boolean;      // LLM 前处理完成
  aiPostProcessed: boolean;     // AI 后处理完成
  issues: ValidationIssue[];

  // Pre-process results
  preprocessedAt?: string;
  preprocessedBy?: string;
  projectSummary?: {
    overallArchitecture: string;
    keyRequirements: string[];
    designDecisions: string[];
    developmentGuidelines: string;
  };
}
```

### CoreEntity Enhanced Analysis
```typescript
entity.metadata.enhancedAnalysis = {
  intent: string;              // 设计意图
  keyPoints: string[];         // 关键要点
  dependencies: string[];        // 依赖关系
  constraints: string[];         // 约束条件
};
```

## Decision (ADR-lite) - Q2

### Relations Transform 策略
- **可映射的 relation**: 转换为目标框架的对应语义 (如 implements → blocks)
- **不可映射的 relation**: 丢弃，但通过 post-process skills 提取关键信息，以注释形式保存到目标文档

## Decision (ADR-lite) - Q1

### Skills 设计策略
- **Framework-specific skills**: 每个源框架有独立的 preprocess skill
  - OpenSpec: 访问 proposal.md, tasks.md, design.md
  - Trellis: 访问 prd.md, task.json, spec/*.md
- **Common output format**: 所有 skills 输出统一的通用格式
- **初始通用类型**:
  - `requirement` - 需求定义
  - `design` - 设计决策
  - `implement_note` - 实现备注
- **可扩展**: 未来可添加更多通用类型

## Technical Notes

### SpecFrameworks 分析结果

| 框架 | 实体类型 | CoreType |
|------|---------|----------|
| OpenSpec | change, spec | DOCUMENT |
| Trellis | task, spec | task→WORKFLOW, spec→DOCUMENT |
| spec-kit | constitution, spec, plan, tasks | tasks→WORKFLOW, others→DOCUMENT |
| superpowers | skills, plans, brainstorm, tasks | tasks→WORKFLOW, others→DOCUMENT |

**2-type 模型 (DOCUMENT/WORKFLOW) 对所有框架够用。**

### 当前 Transform 阶段问题

**Relations 在 Transform 阶段未被处理** - mapExtendedType 只处理 entity.extendedType，忽略 relationType 映射。

### 下一步

等待用户确认 IR 结构设计问题
