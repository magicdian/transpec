---
name: analyze-semantics
description: "Analyzes spec semantics to understand intent, dependencies, and relationships between entities"
model: opus
trigger: semantic-analysis
---

# Analyze Semantics Skill

## Purpose

Performs deep semantic analysis on the Intermediate Representation (IR) entities to understand:
- **Intent**: What is the user trying to achieve?
- **Dependencies**: What does this entity depend on?
- **Implications**: What changes would this entity cause?
- **Relationships**: How does this relate to other entities?

## Analysis Modes

| Mode | Sampling | Description |
|------|----------|-------------|
| sampling | 20% of entities | Quick overview, detect potential issues |
| full | 100% of entities | Complete semantic analysis |
| on-demand | Specific entities | Targeted analysis on request |

## Workflow

### Step 1: Load Entity Content

For each entity, examine:
- Title and name
- Content body
- Extended type (change, spec, task, etc.)
- Source framework

### Step 2: Semantic Analysis

Analyze each entity for:

1. **Core Purpose**
   - What problem does this solve?
   - What is the expected outcome?

2. **Dependencies**
   - What other entities does this reference?
   - What prerequisites must be met?

3. **Stakeholders**
   - Who will use this?
   - Who is affected by changes?

4. **Risk Factors**
   - What could go wrong?
   - Are there breaking changes?

### Step 3: Generate Annotations

```json
{
  "entityId": {
    "intent": "User authentication system",
    "confidence": 0.95,
    "suggestions": ["Consider adding rate limiting"],
    "relatedConcepts": ["security", "session-management"],
    "riskLevel": "medium"
  }
}
```

## Output Format

```json
{
  "annotations": {
    "<entity-id>": {
      "intent": "string",
      "confidence": 0.0-1.0,
      "suggestions": ["string"],
      "relatedConcepts": ["string"],
      "riskLevel": "low|medium|high"
    }
  },
  "relations": [
    {
      "source": "<entity-id>",
      "target": "<entity-id>",
      "type": "depends_on|implements|references",
      "confidence": 0.0-1.0
    }
  ],
  "summary": {
    "totalEntities": 42,
    "analyzedEntities": 42,
    "issuesFound": 3,
    "highRiskCount": 1
  }
}
```
