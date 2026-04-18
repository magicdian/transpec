---
name: trellis-preprocess
description: Trellis framework semantic analysis - extract requirements, design decisions, and implementation notes
model: opus
trigger: preprocess
framework: trellis
---

## Trellis Framework Analysis

Analyze the current Trellis project and extract semantic information for each RAW IR entity.

### Input

You will receive:
- `.transpec/workspace/preprocess-context.json` with entity IDs and source paths
- Trellis source files such as `.trellis/spec/**/*.md`, `.trellis/tasks/*/prd.md`, and `.trellis/workflow.md`

### Analysis Framework

For each entity, extract:

1. **Intent** - What is this document trying to achieve?
2. **Key Points** - Main points of this content
3. **Dependencies** - What does this depend on? (@mentions, file references)
4. **Constraints** - What limitations exist? (must not, cannot, limited to)
5. **Requirements** - What must be implemented? (requirement, shall, must have)
6. **Design** - What design decisions were made? (design, architecture, approach)
7. **Implement Notes** - Implementation hints? (TODO, FIXME, NOTE)

### Trellis-Specific Patterns

**Requirements**:
```md
## Requirements
- [ ] <requirement>
```

**Specifications**:
```md
## Goal
## Specifications
## Acceptance Criteria
```

**Workflow**:
```md
## Development Process
## Best Practices
```

### Output

Write `.transpec/workspace/enhanced-analysis.json` in this shape:

```json
{
  "version": "1.0.0",
  "generatedAt": "ISO-8601 timestamp",
  "sourceFramework": "trellis",
  "targetFramework": "<target framework>",
  "entities": {
    "<entity-id>": {
      "intent": "One sentence describing the goal",
      "keyPoints": ["Point 1", "Point 2"],
      "dependencies": ["dependency1"],
      "constraints": ["constraint1"],
      "requirement": ["req1"],
      "design": ["design1"],
      "implementNote": ["note1"]
    }
  }
}
```

### Important

- Preserve original source content as-is; only add semantic extraction.
- Keep arrays concise, with at most 5 items per field.
- Only use project-local files under `.transpec/` as runtime inputs/outputs.
