# Improve Trellis postprocess quality

## Goal

Improve Transpec's Trellis conversion quality based on validation against the real `xgit` project, focusing on shallow active specs, broken guide links, and inconsistent archived task metadata/context so the converted Trellis output is closer to a usable continuation state instead of only a baseline skeleton.

## What I already know

* Validation against `/Users/magicdian/Documents/personal_project/xgit` showed structure conversion succeeds: OpenSpec assets are preserved, historical changes are imported, and validation reports `0 errors` and `0 warnings`.
* The main gaps are inside Trellis postprocess output quality, not in `.agents/skills` refresh or bootstrap-task execution.
* Current active Trellis specs can remain too close to baseline template text instead of reflecting the destination codebase deeply enough.
* Converted active specs currently contain guide references that can point to missing files.
* Converted archived task context can contain broken spec paths in injected `*.jsonl` files.
* Some archived `task.json` files keep semantically inconsistent status/phase/completion fields after import.

## Assumptions (temporary)

* The fixes should live in Transpec's Trellis postprocess / archived-task conversion pipeline, not in generic Trellis runtime templates.
* We should prefer deterministic repair during conversion over manual follow-up steps.
* This task is backend-focused and likely spans postprocess generation, archived task mapping, and regression tests.

## Open Questions

* Which exact converter modules generate active Trellis specs, guide indexes, archived task context JSONL, and archived task metadata?
* What is the smallest safe behavior change that improves real-project output without overfitting to `xgit`?

## Requirements (evolving)

* Deepen Trellis postprocess output so active specs better reflect analyzed project reality instead of staying at baseline placeholders whenever enough source context exists.
* Ensure converted Trellis guide references do not point to missing files.
* Ensure archived task context JSONL does not inject missing spec paths.
* Normalize archived task metadata so archived tasks are semantically consistent with their converted state.
* Add or update regression coverage around the observed failure modes.

## Acceptance Criteria (evolving)

* [ ] Converting the relevant fixtures no longer leaves obvious placeholder-only active spec output when source evidence exists for deeper spec generation.
* [ ] Generated `.trellis/spec/guides/index.md` only references guide files that exist in output.
* [ ] Converted archived task context files do not contain broken `.trellis/spec/...` paths.
* [ ] Archived task metadata mapping is internally consistent for converted archived tasks.
* [ ] Tests cover the repaired behaviors.

## Definition of Done (team quality bar)

* Tests added or updated for changed conversion behavior
* Lint and typecheck pass for touched packages
* Behavioral changes are scoped to the confirmed conversion-quality issues
* Notes or specs are updated if new converter rules need to be documented

## Out of Scope (explicit)

* Rewriting generic Trellis `.agents/skills` templates
* Solving bootstrap task execution or requiring users to run Trellis bootstrap manually
* Filling project-specific specs by human authors after conversion

## Technical Notes

* Validation source project: `/Users/magicdian/Documents/personal_project/xgit`
* User-highlighted files include `.transpec/config.yaml`, `.transpec/logs/transpec.log`, `.transpec/workspace/enhanced-analysis.json`, `.transpec/workspace/postprocess-context.json`, and `.transpec/workspace/preprocess-context.json` in the target project.
* Likely affected areas: Trellis postprocess skill/config generation, archived task import mapping, guide index generation, and regression fixtures/tests in `packages/cli`.
