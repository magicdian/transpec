# Cross-Layer Thinking Guide

> **Purpose**: Think through data flow across layers before implementing.

---

## The Problem

**Most bugs happen at layer boundaries**, not within layers.

Common cross-layer bugs:
- API returns format A, frontend expects format B
- Database stores X, service transforms to Y, but loses data
- Multiple layers implement the same logic differently

---

## Before Implementing Cross-Layer Features

### Step 1: Map the Data Flow

Draw out how data moves:

```
Source → Transform → Store → Retrieve → Transform → Display
```

For each arrow, ask:
- What format is the data in?
- What could go wrong?
- Who is responsible for validation?

### Step 2: Identify Boundaries

| Boundary | Common Issues |
|----------|---------------|
| API ↔ Service | Type mismatches, missing fields |
| Service ↔ Database | Format conversions, null handling |
| Backend ↔ Frontend | Serialization, date formats |
| Component ↔ Component | Props shape changes |

### Step 3: Define Contracts

For each boundary:
- What is the exact input format?
- What is the exact output format?
- What errors can occur?

---

## Common Cross-Layer Mistakes

### Mistake 1: Implicit Format Assumptions

**Bad**: Assuming date format without checking

**Good**: Explicit format conversion at boundaries

### Mistake 2: Scattered Validation

**Bad**: Validating the same thing in multiple layers

**Good**: Validate once at the entry point

### Mistake 3: Leaky Abstractions

**Bad**: Component knows about database schema

**Good**: Each layer only knows its neighbors

### Mistake 4: Treating Generated Artifacts As "Just Output"

**Bad**: Conversion writes the expected number of files, but the generated project is missing the runtime skeleton, archive placement, or metadata fields that downstream tools require.

**Good**: Treat generated files as cross-layer contracts. Validate that parse output, runtime context JSON, emitted directories, and downstream workflow tooling all agree on paths, metadata, and task state.

Checklist for generated workflow/runtime outputs:
- [ ] If later tooling auto-injects `workflow.md` or `spec/*/index.md`, make sure conversion creates those files or preserves existing ones.
- [ ] Historical imports must land in archive directories, not the active task pool.
- [ ] Entity IDs consumed by later semantic steps stay stable across refreshes, or there is a defined remap/migration flow before reusing old analysis artifacts.
- [ ] If a later step reads exported runtime JSON, refresh that JSON after semantic merges so flags like `hasEnhancedAnalysis` stay truthful.
- [ ] Preserve source timestamps/status in dedicated fields; never overwrite them with import-time values only.
- [ ] When metadata extraction and relation extraction depend on the same parse rule, route both through the same helper instead of duplicating regexes.

---

## Checklist for Cross-Layer Features

Before implementation:
- [ ] Mapped the complete data flow
- [ ] Identified all layer boundaries
- [ ] Defined format at each boundary
- [ ] Decided where validation happens

After implementation:
- [ ] Tested with edge cases (null, empty, invalid)
- [ ] Verified error handling at each boundary
- [ ] Checked data survives round-trip
- [ ] Verified generated output is consumable by the next workflow/tool layer, not just structurally present

---

## When to Create Flow Documentation

Create detailed flow docs when:
- Feature spans 3+ layers
- Multiple teams are involved
- Data format is complex
- Feature has caused bugs before
