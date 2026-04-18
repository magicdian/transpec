<p align="center">
  <a href="./README.md">English</a>
</p>

<h1 align="center">transpec</h1>

<p align="center">
  一个用于 agent-assisted project migration 的通用 spec 转换框架 CLI
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@magicdian/transpec"><img src="https://img.shields.io/npm/v/%40magicdian%2Ftranspec?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/magicdian/transpec/blob/main/LICENSE"><img src="https://img.shields.io/github/license/magicdian/transpec?style=flat-square" alt="license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-3c873a?style=flat-square" alt="Node.js >= 18" />
  <a href="https://github.com/magicdian/transpec"><img src="https://img.shields.io/badge/GitHub-transpec-181717?style=flat-square&logo=github" alt="GitHub repository" /></a>
</p>

`transpec` 是一个面向 spec 驱动项目的通用转换框架。当前已经完整打磨、可直接落地的迁移路径是 OpenSpec -> Trellis，并且整个过程通过 agent 引导工作流完成，而不是简单的文本替换。

当前首发版本重点是：

- 将 `@magicdian/transpec` 作为可安装 npm CLI 发布
- 提供可落地的 OpenSpec -> Trellis 转换流程
- 支持 `claude-code`、`cursor`、`codex`、`opencode` 的 IDE 集成

## 为什么用 transpec

| 能力 | 带来的变化 |
| --- | --- |
| 通用转换框架 | 不再为每一对工具手写一次性迁移脚本，而是在统一框架上组织转换流程。 |
| 确定性流水线 | parse、transform、emit、postprocess、validation 都是显式步骤，迁移结果更容易审查和复现。 |
| Agent 引导工作流 | 需要语义增强的部分交给 agent，机械性的转换步骤仍然由 CLI 保持确定性。 |
| IDE 集成 | 在 Codex、Claude Code、Cursor、OpenCode 中都能复用同一套迁移流程，而不是为每个工具单独写说明。 |
| 当前成熟的 OpenSpec -> Trellis 路径 | 先从目前最完整可用的迁移路径开始，同时保留未来扩展到更多框架组合的空间。 |

## 它能做什么

`transpec` 的目标不是做一次“盲目的文本替换”，而是把迁移拆成可控的确定性步骤：

1. 检测源框架并初始化项目配置
2. 从源项目生成 RAW IR
3. 让 AI 在受控流程中补充语义增强分析
4. 执行确定性的 transform + emit
5. 对目标项目进行 postprocess 和 validate

## 环境要求

- Node.js 18 或更高版本
- Python 3.10 或更高版本
  如果你的项目依赖 Python 编写的 agent hooks 或生成脚本，就需要它

## 安装

```bash
npm install -g @magicdian/transpec
```

查看当前安装版本：

```bash
transpec version
```

## 快速开始

### 1. 检测当前项目框架

```bash
transpec detect
```

它会扫描当前目录，并输出已识别到的支持框架。

### 2. 初始化转换项目

当前已完成的主要迁移路径是：

```bash
transpec init --source openspec --target trellis --ide codex
```

说明：

- 如果你不用 `codex`，可以替换成 `claude-code`、`cursor` 或 `opencode`
- `transpec init` 会生成 `.transpec/config.yaml`，并写入对应 IDE 所需的集成文件
- 如果不传 `--source`，`transpec` 会尝试自动检测

### 3. 启动对应的 agent 工具

完成 `init` 后，启动你在初始化时选择的 agent 工具，比如 Codex、Claude Code、Cursor 或 OpenCode。

用户实际迁移时，推荐直接在 agent 内执行生成出来的 skills，而不是手动串联底层 CLI。

### 4. 在 agent 中执行 `$transpec-preprocess`

在 agent 会话中执行：

```text
$transpec-preprocess
```

这个 skill 会：

- 刷新确定性的 RAW IR
- 将 preprocess 上下文写入 `.transpec/workspace/`
- 引导 agent 完成源侧分析流程
- 为 apply 阶段产出增强分析结果

### 5. 在 agent 中执行 `$transpec-apply`

当 preprocess 完成后，在 agent 中继续执行：

```text
$transpec-apply
```

这个 skill 会：

- 导入增强分析结果
- 执行确定性的 transform 和 emit
- 触发目标框架对应的 postprocess 生成
- 在 skill 流程中自动执行 validate

正常用户流程里，一般不需要手动执行 `transpec validate`。
## 命令总览

| 命令 | 作用 |
| --- | --- |
| `transpec detect` | 检测当前项目中的支持框架 |
| `transpec init` | 创建 `.transpec` 配置和 IDE 集成文件 |
| `transpec preprocess` | 生成 RAW IR 和 preprocess 上下文 |
| `transpec apply` | 导入增强分析并输出目标项目 |
| `transpec postprocess` | 直接执行确定性的目标 postprocess |
| `transpec validate` | 校验转换结果 |
| `transpec version` | 输出或递增版本号 |

## 输出结构

在转换过程中，`transpec` 会在项目内维护一些本地状态：

```text
.transpec/
├── config.yaml
├── ir/
├── logs/
└── workspace/
```

对于 OpenSpec -> Trellis，目标输出主要围绕 `.trellis/` 产物展开。

## 支持的 IDE 集成

当前 `init` 支持：

- `claude-code`
- `cursor`
- `codex`
- `opencode`

这些集成最终都建立在同一套 `transpec preprocess/apply` 确定性流水线之上，只是各 IDE 的命令入口和 skill 载体不同。

正常使用时，优先执行 agent skills：

- `$transpec-preprocess`
- `$transpec-apply`

## 其他文档

面向用户的使用说明默认放在 README。开发和发布文档单独存放：

- [开发说明](./docs/development.md)
- [发布说明](./docs/publishing.md)

## License

Apache 2.0。见 [LICENSE](./LICENSE)。
