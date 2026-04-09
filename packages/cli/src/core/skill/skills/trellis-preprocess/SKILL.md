---
name: trellis-preprocess
description: Trellis framework semantic analysis - extract requirements, design decisions, and implementation notes
model: opus
trigger: preprocess
framework: trellis
---

## Trellis Framework Analysis

Analyze the following Trellis content and extract semantic information.

### Input

You will receive entities with:
- `.trellis/spec/**/*.md` files: Specification documents
- `.trellis/tasks/*/prd.md` files: Project requirement documents
- `.trellis/workflow.md` files: Workflow definitions

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

**Requirements** (from prd.md):
```
## Requirements
- [ ] <requirement>
- Requirement: <text>
```

**Tasks** (from task.json):
```json
{
  "subject": "Task name",
  "description": "Description",
  "status": "in_progress"
}
```

**Specifications** (from spec/*.md):
```
## Goal
## Specifications
## Acceptance Criteria
```

**Workflow** (from workflow.md):
```
## Development Process
## Best Practices
```

### Output Format

Return JSON for each entity:

```json
{
  "intent": "One sentence describing the goal",
  "keyPoints": ["Point 1", "Point 2", "..."],
  "dependencies": ["dependency1", "dependency2"],
  "constraints": ["constraint1", "constraint2"],
  "requirement": ["req1", "req2"],
  "design": ["design1", "design2"],
  "implementNote": ["note1", "note2"]
}
```

### Important

- Preserve original content as-is (RAW)
- Only extract semantic information
- Map framework-specific terms to common types
- Be concise - max 5 items per array
