---
name: openspec-preprocess
description: OpenSpec framework semantic analysis - extract requirements, design decisions, and implementation notes
model: opus
trigger: preprocess
framework: openspec
---

## OpenSpec Framework Analysis

Analyze the current OpenSpec project and extract semantic information for each RAW IR entity.

### Input

You will receive:
- `.transpec/workspace/preprocess-context.json` with entity IDs and source paths
- OpenSpec source files such as `spec.md`, `proposal.md`, and supporting markdown

### Analysis Framework

For each entity, extract:

1. **Intent** - What is this document trying to achieve?
2. **Key Points** - Main points of this content
3. **Dependencies** - What does this depend on? (file references, other specs)
4. **Constraints** - What limitations exist? (must not, cannot, limited to)
5. **Requirements** - What must be implemented? (requirement, shall, must have)
6. **Design** - What design decisions were made? (design, architecture, approach)
7. **Implement Notes** - Implementation hints? (TODO, FIXME, NOTE)

### OpenSpec-Specific Patterns

**Requirements**:
```md
## ADDED Requirements
### Requirement: <name>
- Description: <text>
```

Some OpenSpec specs may also use plain level-3 headings without the `Requirement:` prefix:

```md
## ADDED Requirements
### <name>
- Description: <text>
```

**Design Decisions**:
```md
## Design Decisions
### Decision: <name>
- Rationale: <text>
```

**Change Proposals**:
```md
## Problem Statement
## Proposed Solution
## Implementation Plan
```

### Output

Write `.transpec/workspace/enhanced-analysis.json` in this shape:

```json
{
  "version": "1.0.0",
  "generatedAt": "ISO-8601 timestamp",
  "sourceFramework": "openspec",
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
