# 版本号规范实施

## Goal

建立基于日期的版本号规范，所有产品代码变更（feat/fix）必须先更新版本号。

## Version Format

```
YYMM.dd.BuildNumber
```

| Part | Meaning | Example (2026-04-09) |
|------|---------|---------------------|
| YY | 年份后两位 | 26 |
| MM | 月份（补零） | 04 |
| dd | 日期（不补零） | 9 |
| BuildNumber | 当日构建序号 | 1 |

**示例**: `2604.9.1` = 2026年4月9日第1次构建

## Version Update Rules

1. **每次产品代码变更前**必须更新版本号
2. **触发时机**: `/trellis:finish-work` 时更新
3. **更新逻辑**:
   - 读取当前版本号
   - 解析出 YYMM.dd 部分
   - 如果 YYMM.dd 与今天一致 → BuildNumber + 1
   - 如果 YYMM.dd 与今天不一致 → BuildNumber = 1，日期更新为今天
4. **存储位置**: `packages/cli/package.json` 的 `version` 字段

## Implementation

### 1. Version Bump Script

创建 `scripts/version-bump.ts`:

- 读取 `packages/cli/package.json`
- 解析当前版本 `YYMM.dd.BuildNumber`
- 按规则计算新版本
- 写回 `package.json`
- 输出新版本号

### 2. Integrate with finish-work

修改 `finish-work` 流程:
- 在 `finish-work` 执行时调用 version-bump
- 版本更新发生在代码 commit 之前

### 3. CLI 命令（可选）

```bash
transpec version        # 查看当前版本
transpec version bump   # 手动触发版本更新
```

## Acceptance Criteria

- [x] `packages/cli/package.json` 的 version 字段格式为 `YYMM.dd.N`
- [x] 版本更新脚本正确实现日期和构建号逻辑
- [x] `/trellis:finish-work` 时自动更新版本
- [x] 脚本可独立运行并输出新版本号

## Technical Notes

- 使用 TypeScript 实现，便于集成
- 直接操作 JSON 文件，不依赖额外解析库
- 日期计算使用本地时区
