<p align="center">
  <a href="./README_CN.md">简体中文</a>
</p>

<h1 align="center">transpec</h1>

<p align="center">
  A universal spec conversion framework CLI for agent-assisted project migration
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@magicdian/transpec"><img src="https://img.shields.io/npm/v/%40magicdian%2Ftranspec?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/magicdian/transpec/blob/main/LICENSE"><img src="https://img.shields.io/github/license/magicdian/transpec?style=flat-square" alt="license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-3c873a?style=flat-square" alt="Node.js >= 18" />
  <a href="https://github.com/magicdian/transpec"><img src="https://img.shields.io/badge/GitHub-transpec-181717?style=flat-square&logo=github" alt="GitHub repository" /></a>
</p>

`transpec` is a universal conversion framework for spec-driven projects. The current production-ready migration path is OpenSpec -> Trellis, delivered through an agent-guided workflow instead of a blind text rewrite.

Current release focus:

- Stable packaging and documentation for `@magicdian/transpec`
- Practical OpenSpec -> Trellis conversion flow
- IDE integration for `claude-code`, `cursor`, `codex`, and `opencode`

## Why transpec

| Capability | What it changes |
| --- | --- |
| Universal conversion framework | Build conversion workflows around a stable framework instead of rewriting one-off migration scripts for every pair of tools. |
| Deterministic pipeline | Keep parse, transform, emit, postprocess, and validation steps explicit so migration output stays reviewable. |
| Agent-guided workflow | Let agents handle semantic enrichment where needed, while the CLI keeps the mechanical conversion steps deterministic. |
| IDE integration | Use the same conversion flow from Codex, Claude Code, Cursor, or OpenCode instead of inventing separate migration instructions per tool. |
| Production-ready OpenSpec -> Trellis path | Start from the most complete migration path today while keeping the framework open to more source/target pairs later. |

## What It Does

`transpec` helps you move an existing spec-driven project into a target framework without treating the migration as a blind text rewrite.

The CLI separates the workflow into deterministic steps:

1. Detect the source framework and initialize project config.
2. Generate RAW IR from the source project.
3. Let an AI workflow enrich the analysis in a controlled way.
4. Apply deterministic transform + emit steps.
5. Postprocess and validate the generated target project.

## Requirements

- Node.js 18 or newer
- Python 3.10 or newer for projects that rely on Python-based agent hooks or generated tool scripts

## Install

```bash
npm install -g @magicdian/transpec
```

Check the installed version:

```bash
transpec version
```

## Quick Start

### 1. Detect the current framework

```bash
transpec detect
```

This scans the current project and reports supported frameworks it can recognize.

### 2. Initialize the conversion project

For the currently supported migration path:

```bash
transpec init --source openspec --target trellis --ide codex
```

Notes:

- Replace `codex` with `claude-code`, `cursor`, or `opencode` if needed.
- `transpec init` writes `.transpec/config.yaml` and generates the integration files required by the selected IDE workflow.
- If you omit `--source`, `transpec` will try to auto-detect it.

### 3. Start your agent tool

After `init`, open the agent tool you selected during setup, for example Codex, Claude Code, Cursor, or OpenCode.

The user-facing migration flow happens inside the agent by running the generated skills, not by manually chaining low-level CLI commands.

### 4. Run `$transpec-preprocess` inside the agent

Inside the agent session, run:

```text
$transpec-preprocess
```

This skill will:

- refresh deterministic RAW IR
- write preprocess context into `.transpec/workspace/`
- guide the agent through the source-side analysis flow
- produce enriched analysis for the apply step

### 5. Run `$transpec-apply` inside the agent

When preprocess is complete, run:

```text
$transpec-apply
```

This skill will:

- import the enhanced analysis
- run deterministic transform and emit steps
- trigger target postprocess generation
- automatically run validation as part of the skill flow

Users normally do not need to run `transpec validate` manually during the guided workflow.

## Command Overview

| Command | Purpose |
| --- | --- |
| `transpec detect` | Detect supported frameworks in the current project |
| `transpec init` | Create `.transpec` config and IDE integration files |
| `transpec preprocess` | Generate RAW IR and preprocess context |
| `transpec apply` | Import enhanced analysis and emit the target project |
| `transpec postprocess` | Run deterministic target postprocess directly |
| `transpec validate` | Validate the converted result |
| `transpec version` | Print or bump the package version |

## Output Layout

During conversion, `transpec` creates and updates project-local state such as:

```text
.transpec/
├── config.yaml
├── ir/
├── logs/
└── workspace/
```

For OpenSpec -> Trellis, the generated target output is centered around `.trellis/` artifacts.

## Supported IDE Integrations

The current `init` flow supports:

- `claude-code`
- `cursor`
- `codex`
- `opencode`

These integrations generate IDE-specific commands or skill files that sit on top of the same deterministic `transpec` preprocess/apply pipeline.

For normal usage, prefer the agent skills:

- `$transpec-preprocess`
- `$transpec-apply`

## Documentation

User-facing README content stays here. Developer and release documentation lives separately:

- [Development Notes](./docs/development.md)
- [Publishing Guide](./docs/publishing.md)

## License

Apache 2.0. See [LICENSE](./LICENSE).
