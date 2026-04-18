---
name: openspec-postprocess
description: Finalize OpenSpec-specific postprocessing after apply
trigger: postprocess
framework: openspec
---

# OpenSpec Postprocess

Complete OpenSpec-specific postprocessing after `transpec apply`.

## Inputs

- `.transpec/workspace/postprocess-context.json`
- The generated OpenSpec files after `transpec apply`

## Your Task

1. Read `.transpec/workspace/postprocess-context.json`.
2. Review generated OpenSpec changes/specs for structural correctness.
3. Normalize any target-specific documentation structure so the converted output matches OpenSpec expectations.

## Guidelines

- Prefer updating generated OpenSpec files in place rather than creating duplicates.
- Keep changes scoped to OpenSpec conventions and structural cleanup.
- Use project-local runtime files under `.transpec/` for context.

## Important

- This postprocess step happens after deterministic transform+emit is complete.
- Do not fetch skill markdown from the installed npm package during execution.
