# Improve OpenSpec -> Trellis Conversion Fidelity

## Goal

Reduce avoidable information loss in the OpenSpec -> Trellis pipeline so converted Trellis tasks preserve more of the original source semantics, remain replayable with correct context, and are easier to validate/debug after conversion.

## What I already know

- The current task is about improving conversion fidelity for `openspec -> trellis`, especially around archived change/task migration.
- The user already identified four important loss modes from prior conversion output in a different repository where `transpec` was tested:
  - impossible task timeline metadata
  - degraded task context / wrong `dev_type`
  - `tasks.md` non-checkbox information loss
  - stale generated repository state guide
- Those findings are external regression evidence, not defects reproduced from the current workspace output tree.
- `xgit` is only a real-world regression sample. The implementation must improve generic `openspec -> trellis` conversion behavior for many possible projects, not encode project-specific repair rules.
- Current repository state has no live `openspec/` source tree anymore, so direct source/target comparison inside this workspace must rely on converter code, fixtures, tests, and existing Trellis archive output.
- Relevant converter/runtime code lives mainly in:
  - `packages/cli/src/core/framework/adapters/openspec.ts`
  - `packages/cli/src/core/framework/adapters/trellis.ts`
  - `packages/cli/src/core/postprocess/trellis.ts`
  - `packages/cli/src/core/validation/conversion.ts`
  - runtime compatibility / validation tests under `packages/cli/src/cli/commands/` and `packages/cli/src/core/validation/`
- Additional fidelity gaps discovered during repo inspection:
  - `tasks.md` is parsed only into `subtasks`; raw content and structured non-checkbox sections are discarded.
  - `sourceUpdatedAt` is currently populated from `entity.updatedAt`, which for parsed OpenSpec entities is the parse time, not a source-native update timestamp.
  - archived month / completion timing currently depends on `archivedAt` derived from filesystem `mtime`, which is not a stable semantic source of truth.
  - task context generation for emitted Trellis tasks is coarse; it relies on repo-wide dev-type heuristics instead of task-local semantics.
  - validation currently checks structural runtime correctness, but not richer fidelity guarantees like preserved task artifacts, task-local context quality, or source timestamp provenance quality.

## Assumptions (temporary)

- We should prioritize deterministic, source-preserving improvements that do not require LLM-only postprocess to make the result correct.
- The main deliverable is stronger conversion output and validation for future conversions, using the external repo findings as regression targets, not retroactively fixing every existing archived Trellis task in this repository.
- It is acceptable to preserve additional source artifacts or provenance files in Trellis output when lossless semantic transformation is impossible.

## Requirements (evolving)

- Preserve source task timeline/provenance more faithfully and deterministically.
- Preserve more `tasks.md` information than checkbox-derived subtasks alone.
- Improve emitted Trellis task context so task-local UI/TUI or interaction work is not flattened into generic backend-only guidance.
- Strengthen validation so major fidelity regressions are caught automatically.
- Keep deterministic runtime bootstrap behavior intact.
- Keep heuristics project-agnostic: use generic source/runtime signals and contracts, not `xgit`-specific filenames or one-off rules.

## Acceptance Criteria (evolving)

- [ ] Converted Trellis task metadata no longer derives source lifecycle timestamps from parse-time or unstable filesystem-only values when no true source field exists.
- [ ] Conversion preserves `tasks.md` content beyond checkbox subtasks in a first-class way.
- [ ] Emitted task context for OpenSpec changes with UI/TUI/interactive signals includes appropriate Trellis guidance instead of generic repo-wide classification only.
- [ ] `transpec validate` (or equivalent validation layer) detects the new fidelity guarantees and fails on regressions.
- [ ] `transpec validate` also works as a generic audit/report tool for already converted Trellis repositories, surfacing fidelity regressions without relying on project-specific rules.
- [ ] Regression tests cover the new fidelity-preserving behavior.

## Definition of Done (team quality bar)

- Tests added/updated for the new fidelity guarantees
- Lint / typecheck / CI green
- Docs/specs updated if conversion/runtime contract changes
- Rollout/rollback considered for compatibility-sensitive behavior

## Out of Scope (explicit)

- Perfectly lossless semantic conversion of all OpenSpec concepts into native Trellis concepts
- Reconstructing unavailable source truth that does not exist in OpenSpec inputs
- Broad Trellis runtime redesign unrelated to conversion fidelity

## Technical Notes

- Relevant specs read:
  - `.trellis/spec/backend/conversion-pipeline.md`
  - `.trellis/spec/backend/framework-adapter-pattern.md`
  - `.trellis/spec/backend/ir-design-principles.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
- Current code patterns / likely modification areas:
  - OpenSpec parsing + metadata extraction: `packages/cli/src/core/framework/adapters/openspec.ts`
  - Trellis task emission + context generation: `packages/cli/src/core/framework/adapters/trellis.ts`
  - grounded guide generation: `packages/cli/src/core/postprocess/trellis.ts`
  - conversion validation: `packages/cli/src/core/validation/conversion.ts`
  - fixtures/tests: `packages/cli/src/test/compat-fixtures.ts`, `packages/cli/src/cli/commands/runtime-compat.test.ts`, `packages/cli/src/core/validation/conversion.test.ts`

## Research Notes

### Candidate optimization buckets

**A. Timeline / provenance hardening** (Recommended)

- How it works:
  - separate source-native timestamps from import/runtime timestamps
  - avoid using parse-time `updatedAt` or unstable directory `mtime` as semantic truth
  - preserve unknown values explicitly instead of inventing misleading ones
- Pros:
  - deterministic
  - improves sorting/history correctness
  - easy to validate
- Cons:
  - may require schema/validation updates
  - might expose that some source timestamps are genuinely unavailable

**B. Source artifact preservation** (Recommended)

- How it works:
  - preserve raw `tasks.md` (and possibly related provenance) as first-class converted output or metadata artifact
  - keep subtasks extraction as a derived convenience view, not the only retained representation
- Pros:
  - directly addresses lossy conversion
  - future postprocess/refinement can reuse preserved source
- Cons:
  - adds output files / metadata surface area
  - requires clear contract about where preserved artifacts live

**C. Task-local context inference** (Recommended)

- How it works:
  - infer emitted `dev_type` / `implement.jsonl` from task-local signals (proposal, tasks, design, enhanced analysis, dependencies, UI/TUI keywords), not only repo-wide file extension scan
- Pros:
  - better replayability for converted tasks
  - aligns with Trellis context-injection philosophy
- Cons:
  - heuristic and imperfect
  - needs careful fallback behavior

**D. Validation / audit expansion**

- How it works:
  - teach `validate` to check provenance quality, preserved task artifacts, and context coverage
- Pros:
  - prevents silent regressions
  - makes lossy areas explicit
- Cons:
  - can increase strictness / failure surface

## Decision (ADR-lite)

**Context**: External regression samples showed that structural conversion success is not enough; converted Trellis output also needs provenance fidelity and replayable task context. At the same time, `transpec` is a generic framework, so fixes must be reusable across projects rather than tailored to one repository.

**Decision**: Implement a generic four-part improvement:

- harden source provenance/timeline handling in OpenSpec parse and Trellis emit
- preserve raw source artifacts when semantic conversion is lossy
- infer task context from generic task-local signals instead of repo-only classification
- expand `transpec validate` into a fidelity audit layer for converted Trellis repositories

`xgit` remains only a regression sample to verify these generic rules.

**Consequences**:

- Future conversions should preserve more replayable context and avoid obviously wrong metadata.
- Existing converted repos can be audited more usefully with `transpec validate`.
- Some previously silent degradation will now appear as warnings/errors, which is intentional.
