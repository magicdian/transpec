---
name: generate-trellis-specs
description: Generate Trellis development specs from OpenSpec specs and source code analysis (language-agnostic)
trigger: post-migration
---

# Generate Trellis Specs (Language-Agnostic)

> **Important**: This skill is UNIVERSAL. Do NOT assume any specific language.
> The project may use Rust, TypeScript, Python, Go, or any combination.
> Your job is to analyze the ACTUAL code and extract patterns from it.

## Your Task

Generate Trellis development specification files by:
1. Detecting the primary language(s) used in the project
2. Analyzing source code to find actual patterns (error handling, logging, testing, etc.)
3. Generating specs that reflect REAL code, not prescribed conventions

---

## Step 1: Detect Languages

Find what languages are used in this project:

```bash
# Count source files by extension
find . -type f \( -name "*.rs" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.rb" -o -name "*.cs" \) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/target/*" 2>/dev/null | sed 's/.*\.//' | sort | uniq -c | sort -rn

# Common language → directory mapping:
# - Rust: .rs files, Cargo.toml
# - TypeScript: .ts/.tsx files, package.json
# - Python: .py files, pyproject.toml
# - Go: .go files, go.mod
# - Java: .java files, pom.xml
# - Ruby: .rb files, Gemfile
# - C#: .cs files, *.csproj
```

Determine the project structure:
- **Single language**: Most files are one extension (e.g., 90%+ Rust)
- **Multi-language**: Multiple significant language populations

---

## Step 2: Analyze Code Patterns

For EACH language detected, analyze the code to find actual patterns.

### Universal Pattern Analysis

Run these searches WITHOUT assuming language:

```bash
# Find error handling patterns (language-agnostic keywords)
grep -r "error\|Error\|err\|Err\|exception\|Exception" --include="*.rs" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" -l 2>/dev/null | head -10

# Find logging patterns
grep -r "log\|Log\|println\|print\|console\|logging" --include="*.rs" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" -l 2>/dev/null | head -10

# Find test patterns
grep -r "test\|Test\|spec\|Spec\|describe\|it(" --include="*.rs" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" -l 2>/dev/null | head -10

# Find configuration/build files (indicates project structure)
ls -la *.toml *.json *.yaml *.yml 2>/dev/null | head -20
```

### Language-Specific Sub-Skills

After detecting languages, CHECK if this skill has language-specific sub-skills:

```bash
# Check for sub-skills (auto-discovered)
ls -la .transpec/skills/generate-trellis-specs/
```

If a sub-skill exists for a detected language (e.g., `generate-trellis-specs/rust/`), USE IT to get language-specific guidance. Otherwise, use universal analysis.

---

## Step 3: Generate Spec Files

For single-language projects:
```
.trellis/spec/backend/
├── index.md
├── directory-structure.md
├── error-handling.md
├── logging-guidelines.md
└── quality-guidelines.md
```

For multi-language projects (per-language):
```
.trellis/spec/backend/
├── index.md
├── rust/
│   ├── directory-structure.md
│   ├── error-handling.md
│   ├── logging-guidelines.md
│   └── quality-guidelines.md
├── typescript/
│   ├── directory-structure.md
│   ├── error-handling.md
│   ├── logging-guidelines.md
│   └── quality-guidelines.md
└── python/
    ├── directory-structure.md
    ├── error-handling.md
    ├── logging-guidelines.md
    └── quality-guidelines.md
```

### What to Document (from ACTUAL CODE)

For each spec file, analyze REAL code and document:

#### 3.1 `directory-structure.md`
- What directories exist? (src/, lib/, cmd/, etc.)
- Where does business logic live?
- Where are tests located?
- Any special directories? (e.g., migrations, scripts)

#### 3.2 `error-handling.md`
- What error patterns exist? (Result, try/catch, panic, etc.)
- Are there custom error types?
- How are errors propagated?

#### 3.3 `logging-guidelines.md`
- What logging approach is used? (println, log crate, console, etc.)
- Any structured logging?
- What log levels are used?

#### 3.4 `quality-guidelines.md`
- Testing framework? (#[test], Jest, pytest, etc.)
- Linting tools? (clippy, ESLint, flake8, etc.)
- Any coding conventions visible in code?

---

## Step 4: Update `index.md`

After writing spec files, update the index to reference them:

```markdown
# Backend Development Guidelines

> Language-Agnostic Specs (auto-generated from code analysis)

## Overview

Project-specific backend development guidelines based on code analysis.

## Multi-Language Support

This project uses multiple languages. Specs are organized by language:
- \`rust/\` - Rust-specific guidelines
- \`typescript/\` - TypeScript-specific guidelines

## Quick Reference

[Reference key patterns found in the code]
```

---

## Step 5: Verify

```bash
ls -la .trellis/spec/backend/
find .trellis/spec/backend/ -name "*.md" | head -20
```

---

## Important Notes

1. **Never assume language** - Always detect from file extensions
2. **Document reality** - Write what the code DOES, not what you think it should do
3. **Use sub-skills** - If `generate-trellis-specs/{lang}/SKILL.md` exists, use it
4. **Multi-language default** - Generate per-language directories (not merged)
5. **Be concise** - 20-50 lines per spec file

---

## Sub-Skills Auto-Discovery

The skill system auto-discovers sub-skills:

```
.transpec/skills/generate-trellis-specs/
├── SKILL.md              # This universal skill
├── rust/                 # Auto-discovered if exists
│   └── SKILL.md
├── typescript/           # Auto-discovered if exists
│   └── SKILL.md
└── python/               # Auto-discovered if exists
    └── SKILL.md
```

If you need language-specific deep-dive guidance, create a sub-skill directory.
