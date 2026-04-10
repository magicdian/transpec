---
name: trellis-postprocess
description: Generate Trellis development specs and finish target-specific postprocessing after apply
trigger: postprocess
framework: trellis
---

# Trellis Postprocess

Complete Trellis-specific postprocessing after `transpec apply`.

## Inputs

- `.transpec/workspace/postprocess-context.json`
- `.transpec/workspace/enhanced-analysis.json`
- The generated project files after `transpec apply`

## Your Task

1. Read `.transpec/workspace/postprocess-context.json`.
2. Analyze the generated Trellis project structure and the source project code.
3. Generate or refresh Trellis development specs so they reflect the actual codebase and converted project state.

### Target Outputs

Generate or update:

```text
.trellis/spec/backend/
.trellis/spec/frontend/
.trellis/spec/guides/
```

### Guidelines

- Detect the actual primary language(s) from the repository instead of assuming one.
- Document real patterns from code, not idealized conventions.
- Keep generated specs concise and grounded in the project.
- Prefer updating existing Trellis spec files over creating duplicates.

### Important

- This postprocess step happens after deterministic transform+emit is complete.
- Use project-local runtime files under `.transpec/` for context.
- Do not fetch skill markdown from the installed npm package during execution.
