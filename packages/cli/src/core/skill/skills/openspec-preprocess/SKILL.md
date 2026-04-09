---
name: openspec-preprocess
description: OpenSpec framework semantic analysis - extract requirements, design decisions, and implementation notes
model: opus
trigger: preprocess
framework: openspec
---

## OpenSpec Framework Analysis

Analyze the following OpenSpec content and extract semantic information.

### Input

You will receive entities with:
- `spec.md` files: Requirements specifications
- `proposal.md` files: Change proposals
- `*.md` files: Supporting documentation

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

**Requirements** (from spec.md):
```
## ADDED Requirements
### Requirement: <name>
- Description: <text>
```

**Design Decisions** (from spec.md):
```
## Design Decisions
### Decision: <name>
- Rationale: <text>
```

**Change Proposals** (from proposal.md):
```
## Problem Statement
## Proposed Solution
## Implementation Plan
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
