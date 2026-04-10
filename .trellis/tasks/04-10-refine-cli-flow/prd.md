# brainstorm: refine cli init preprocess apply flow

## Goal

Refine Transpec's product workflow so the user experience is explicitly split into `init`, `preprocess`, and `apply`, with deterministic RAW IR generation in preprocess and target-specific postprocessing in apply. The goal is to align the actual CLI behavior with the intended agent-centric conversion flow.

## What I already know

* The desired user flow is:
  * `transpec init` initializes the target agent and conversion-related configuration.
  * Inside the agent, `transpec-preprocess` is an agent command that converts the current framework into RAW IR and runs source-specific preprocess skills.
  * Inside the agent, `transpec-apply` is an agent command that converts RAW IR plus enhanced information into target framework files, then runs target-specific postprocess skills.
* The user expects preprocess to do:
  * deterministic `transpec convert` to RAW IR
  * source target-specific preprocess skills
* The user expects apply to do:
  * apply
  * target-specific postprocess skills
* The user clarified that `transpec-preprocess` / `transpec-apply` should be generated as agent-side commands or command documents, especially following the current Claude integration model, rather than necessarily as separate top-level CLI binaries.
* The user clarified that `.transpec` is the production/runtime directory in the user's project and should not conceptually serve as the source location for built-in packaged skills.
* The user proposed refining [`packages/cli/src/core/skill`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/skill) into:
  * `agent-commands/` for preprocess/apply agent command templates with dynamic config based on `init`
  * `preprocess-skills/` for source-framework-specific preprocess skills
  * `postprocess-skills/` for target-framework-specific postprocess skills
* The user decided that `transpec convert` should remain deterministic RAW IR generation, but be demoted to an internal/debug command. The normal user journey should be:
  * shell: `transpec init`
  * agent: `transpec-preprocess`
  * agent: `transpec-apply`
* The user wants all supported IDE integrations in scope for this task, not only Claude Code.
* The user prefers platform-native command naming per IDE, as long as `preprocess/apply` semantics are unified underneath.
* The user decided that source preprocess skills and target postprocess skills should be executed by the agent command layer itself. CLI `transpec preprocess` / `transpec apply` should remain deterministic plumbing only.
* The user clarified that during `transpec init`, Transpec should generate project-local skill documents under `.transpec/skills/`, organized by source/target, and agent commands should point to those generated markdown files instead of reading markdown directly from the installed npm package.
* Current implementation shows several mismatches:
  * [`packages/cli/src/cli/commands/convert.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/convert.ts) still runs the full engine pipeline via `engine.run()`, not a RAW-IR-only deterministic parse/export step.
  * [`packages/cli/src/cli/commands/preprocess.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/preprocess.ts) describes AI semantic analysis and currently loops over all skills whose name contains `preprocess`, rather than selecting source-specific preprocess behavior from configured source framework.
  * [`packages/cli/src/cli/commands/apply.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/apply.ts) runs transform+emit, but only prints post-migration skills for Trellis instead of executing a target-specific postprocess stage as part of apply.
  * [`packages/cli/src/cli/commands/init.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/init.ts) already collects source, target, IDE, mode, and code-spec configuration, so it is close to the intended "initialize target agent and config" role.
  * Built-in skill discovery currently assumes `.transpec/skills/` inside the packaged CLI for preprocess/apply command logic, creating a confusing overlap with the user's project-local `.transpec/` directory.
  * Claude agent command generation currently produces `/transpec:preprocess` and `/transpec:apply`, but the generated descriptions and steps still reflect the old command semantics.
  * Cursor/Codex/OpenCode adapters still generate old apply-centric command or skill content and do not yet provide a full `preprocess -> apply` agent flow aligned with the desired product UX.
  * Packaging currently copies [`packages/cli/.transpec`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/.transpec) into `dist/.transpec`, which bakes built-in skills into a path namespace that should represent user runtime data.
  * [`packages/cli/src/cli/commands/init.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/init.ts) supports selecting multiple IDEs, but persists only a single `project.ide` field in `.transpec/config.yaml` and still prints old guidance such as `/transpec:apply` and `transpec convert`.
* Backend guidelines relevant to this work:
  * Fail-fast CLI error handling with logging and user-friendly messages.
  * Module-scoped structured logging.
  * Strict TypeScript, no `any`, explicit return types.
  * SQLite storage is project-local under `.transpec/ir/`.

## Assumptions (temporary)

* We should preserve `transpec init` as the shell-side CLI entry point.
* We should treat `transpec-preprocess` / `transpec-apply` as agent-facing commands generated by IDE adapters, while the underlying CLI implementation may still be backed by `transpec preprocess` / `transpec apply`.
* RAW IR should be persisted in `.transpec/ir/` and reused across preprocess/apply.
* Source-specific preprocess and target-specific postprocess should be selected by configured frameworks, not by scanning every skill name.
* Built-in packaged skills should live under source-controlled CLI directories such as [`packages/cli/src/core/skill/skills`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/skill/skills), while `.transpec` remains runtime/project data.
* `transpec convert` may remain callable for debugging/backward compatibility, but it is no longer the recommended end-user path.
* Asset packaging should be updated so built-in skills/command templates are emitted under a package-internal location that is distinct from user project `.transpec`.

## Open Questions

* None currently. Existing migration compatibility is not required for this task because transpec has not been formally released yet.

## Requirements (evolving)

* `init` should remain the first step and establish agent/configuration needed for later conversion.
* IDE adapters should generate agent-facing commands aligned with the intended workflow and terminology.
* Skill assets should be reorganized into clearer categories for agent commands, source preprocess, and target postprocess concerns.
* All supported IDE adapters in scope should be aligned in this task.
* Each IDE may keep its native command naming style if the underlying workflow semantics are consistent.
* `init` should materialize the relevant skill markdown into the user's `.transpec/skills/preprocess/<source>/` and `.transpec/skills/postprocess/<target>/` directories.
* `preprocess` should produce or refresh RAW IR deterministically.
* `preprocess` should run source-specific preprocess skills after RAW IR exists.
* `apply` should consume RAW IR plus enhanced analysis.
* `apply` should run target-specific postprocess skills as part of the command flow.
* Built-in skills should be organized under the CLI source tree, while `.transpec` remains the user's runtime/project directory.
* `convert` should no longer be the primary product path for end users.
* Packaged built-in assets should not be emitted into a package path that implies user runtime `.transpec`.
* `init` should generate and/or refresh agent command assets and guide users to the new normal workflow instead of `transpec convert`.

## Acceptance Criteria (evolving)

* [ ] CLI workflow clearly maps to `init -> preprocess -> apply`.
* [ ] Agent-generated commands reflect the intended preprocess/apply semantics.
* [ ] Skill source directories are organized so agent commands, preprocess skills, and postprocess skills have distinct ownership.
* [ ] Claude, Cursor, Codex, and OpenCode adapters are aligned to the same product workflow.
* [ ] `init` generates project-local preprocess/postprocess skill documents under `.transpec/skills/` with source/target-based paths.
* [ ] `convert`/preprocess responsibilities are aligned so RAW IR generation is deterministic and separated from target postprocessing.
* [ ] Preprocess chooses source-specific preprocess skills.
* [ ] Apply chooses and runs target-specific postprocess skills.
* [ ] Built-in skill path resolution no longer conflates packaged assets with the user's `.transpec` runtime directory.
* [ ] CLI output and error handling remain clear and project-consistent.

## Definition of Done (team quality bar)

* Tests added or updated where behavior changes.
* Lint / typecheck pass.
* Docs/notes updated if command behavior changes.
* Risks around backward compatibility are identified.

## Out of Scope (explicit)

* Reworking the entire IR schema unless needed to support the new flow.
* Adding unrelated framework adapters.
* Broad UX redesign outside `init`, `preprocess`, and `apply`.
* Backward-compatibility migration for previously initialized public releases.

## Technical Notes

* Inspected command files:
  * [`packages/cli/src/cli/commands/init.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/init.ts)
  * [`packages/cli/src/cli/commands/convert.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/convert.ts)
  * [`packages/cli/src/cli/commands/preprocess.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/preprocess.ts)
  * [`packages/cli/src/cli/commands/apply.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/commands/apply.ts)
* Related built-in skills and IDE adapter generation exist under:
  * [`packages/cli/src/core/skill/skills/openspec-preprocess/SKILL.md`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/skill/skills/openspec-preprocess/SKILL.md)
  * [`packages/cli/src/core/skill/skills/trellis-preprocess/SKILL.md`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/skill/skills/trellis-preprocess/SKILL.md)
  * `packages/cli/src/core/ide/adapters/*`
* Current command and skill path hotspots:
  * [`packages/cli/src/cli/index.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/cli/index.ts)
  * [`packages/cli/src/core/skill/skill.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/skill/skill.ts)
  * [`packages/cli/src/core/ide/adapters/claude-code.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/ide/adapters/claude-code.ts)
  * [`packages/cli/src/core/ide/adapters/cursor.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/ide/adapters/cursor.ts)
  * [`packages/cli/src/core/ide/adapters/codex.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/ide/adapters/codex.ts)
  * [`packages/cli/src/core/ide/adapters/opencode.ts`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/src/core/ide/adapters/opencode.ts)
  * [`packages/cli/package.json`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/package.json)
  * [`packages/cli/.transpec/skills/generate-trellis-specs/SKILL.md`](/Users/magicdian/Documents/personal_project/transpec/packages/cli/.transpec/skills/generate-trellis-specs/SKILL.md)
* `.trellis/.current-task` currently points to an archived task and may need cleanup later, but it is unrelated to the product flow change itself.
