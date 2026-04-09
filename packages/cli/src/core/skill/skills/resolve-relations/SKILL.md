---
name: resolve-relations
description: "Resolves relationships between entities by analyzing content references and semantic connections"
model: opus
trigger: relation-resolution
---

# Resolve Relations Skill

## Purpose

Analyzes entity content to discover and resolve relationships:
- **Explicit References**: Direct mentions of other entities
- **Implicit Dependencies**: Semantic connections based on content
- **Cross-Framework Links**: Relationships between different framework types

## Relation Types

| Type | Description | Detection Method |
|------|-------------|------------------|
| implements | Entity fulfills a requirement | Keyword: "implements", "satisfies" |
| depends_on | Entity requires another | Keyword: "depends", "requires", "needs" |
| references | Entity mentions another | Pattern: @mention, link, or reference |
| part_of | Entity is contained in another | Hierarchical analysis |
| follows | Sequential relationship | Workflow order analysis |
| triggers | Event-based trigger | Event/action patterns |

## Workflow

### Step 1: Extract Explicit References

Search for:
- `@entity-name` mentions
- `[Entity Name]` links
- "See also" references
- "Implements" statements

### Step 2: Analyze Implicit Dependencies

Based on content analysis:
- Technical dependencies (e.g., "uses X" implies depends_on)
- Temporal dependencies (e.g., "before Y" implies follows)
- Logical dependencies (e.g., "if X then Y" implies references)

### Step 3: Resolve Conflicts

When multiple relation types exist:
1. Prefer explicit over implicit
2. Use confidence scores
3. Flag ambiguous cases for human review

## Output Format

```json
{
  "relations": [
    {
      "source": "entity-id-1",
      "target": "entity-id-2",
      "type": "implements|depends_on|references|part_of|follows|triggers",
      "confidence": 0.0-1.0,
      "evidence": [
        "Line 42: 'This change implements the auth-spec'"
      ],
      "explicit": true|false
    }
  ],
  "unresolved": [
    {
      "source": "entity-id",
      "mention": "@unknown-entity",
      "line": 15,
      "reason": "Entity not found in project"
    }
  ],
  "summary": {
    "totalRelations": 28,
    "highConfidence": 25,
    "lowConfidence": 3,
    "unresolved": 1
  }
}
```
