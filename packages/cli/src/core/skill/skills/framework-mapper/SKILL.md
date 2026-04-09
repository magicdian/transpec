---
name: framework-mapper
description: "Maps entities between frameworks, determining how to transform source entities to target format"
model: opus
trigger: framework-mapping
---

# Framework Mapper Skill

## Purpose

Determines how to map entities from one framework to another:
- **Type Mapping**: What should a "change" become in Trellis?
- **Content Transformation**: How should the content be restructured?
- **Metadata Preservation**: What metadata must be preserved?

## Framework Mappings

### OpenSpec → Trellis

| OpenSpec Type | Trellis Type | Transformation |
|---------------|---------------|----------------|
| change | task | Change proposal → Task with PRD |
| spec | spec | Spec document → Spec document |

### Trellis → OpenSpec

| Trellis Type | OpenSpec Type | Transformation |
|--------------|---------------|----------------|
| task | change | Task → Change proposal |
| spec | spec | Spec document → Spec document |

### spec-kit Mappings (Future)

| spec-kit Type | Trellis Type |
|--------------|---------------|
| spec | spec |
| plan | task |
| constitution | - |

### superpower Mappings (Future)

| superpower Type | Trellis Type |
|----------------|---------------|
| skill | - |
| hook | - |

## Workflow

### Step 1: Determine Target Type

For each source entity:
1. Identify source extendedType
2. Look up mapping table for target framework
3. Consider entity's coreType (DOCUMENT vs WORKFLOW)

### Step 2: Analyze Content Structure

Examine:
- Section headers and hierarchy
- Requirement formats
- Metadata patterns

### Step 3: Generate Transformation

1. Create new content structure for target framework
2. Preserve essential content
3. Adapt formatting conventions
4. Flag any potential information loss

## Content Transformation Rules

### OpenSpec Change → Trellis Task

```
OpenSpec:
## Why
[Explanation]

## What Changes
### 1. [Feature]
[Description]

## ADDED Requirements
### Requirement: [Name]
[Statement]

↓

Trellis:
# [Title]

## Goal
[Concise description from Why + What Changes]

## Requirements
- [Requirement 1]
- [Requirement 2]

## Notes
[Any additional context]
```

### Trellis Task → OpenSpec Change

```
Trellis:
# Task Title

## Goal
[What to achieve]

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2

↓

OpenSpec:
## Why
[Goal expanded]

## What Changes
### 1. [Task Title]
[Description based on requirements]

## ADDED Requirements
### Requirement: [Requirement 1]
[Statement]

### Requirement: [Requirement 2]
[Statement]
```

## Output Format

```json
{
  "mappings": [
    {
      "sourceEntity": "entity-id",
      "targetEntity": "entity-id",
      "sourceType": "change",
      "targetType": "task",
      "transformation": {
        "type": "direct|restructured|partial",
        "contentPreserved": 0.95,
        "sectionsAdded": ["Goal", "Requirements"],
        "sectionsRemoved": ["What Changes"],
        "warnings": [
          "Some ADDED Requirements may need manual review"
        ]
      }
    }
  ],
  "summary": {
    "totalEntities": 45,
    "directMappings": 30,
    "restructuredMappings": 12,
    "partialMappings": 3,
    "warnings": 5
  }
}
```
