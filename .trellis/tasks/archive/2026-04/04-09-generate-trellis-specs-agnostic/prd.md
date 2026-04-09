# brainstorm: make generate-trellis-specs language-agnostic

## Goal

Refactor the `generate-trellis-specs` skill to be **language-agnostic** — it should guide AI to analyze ANY project's actual code patterns and generate specs from that, rather than prescribing language-specific conventions (like Rust's anyhow, clap, etc.).

## What I already know

* Current skill is at `packages/cli/.transpec/skills/generate-trellis-specs/SKILL.md`
* It has hardcoded Rust references: `Cargo.toml`, `anyhow`, `clap`, `env_logger`, `xgit/src/`
* User's vision: transpec is a **conversion framework**, not a Rust tool
* Skills should be **universal guides**, not language-specific rulebooks
* Project may be **multi-language** (e.g., Rust + TypeScript + Python)
* Final specs should be **derived from actual code**, not prescribed

## User's Core Insight

> "transpec 整体上来看是一个转换框架，不应该直接在 skills 中限定死语言的编写规范，skills 还是应该起到引导作用，最终是根据项目的代码，提炼对应的规范才对"

Translation: "transpec as a whole is a conversion framework, it shouldn't hardcode language-specific coding standards in skills. Skills should play a guiding role, ultimately extracting standards from the project's actual code."

## Assumptions (to validate)

* The skill should analyze source code to detect: language(s), framework(s), patterns
* For multi-language projects, specs should be generated per language or merged
* Language-specific conventions should go in **sub-skills** (e.g., `generate-trellis-specs/rust/`)
* The core skill should remain minimal and universal

## Open Questions

* Blocking: How should multi-language detection and spec generation work?
* Preference: Should sub-skills be auto-discovered or explicit?

## Requirements (evolving)

* [ ] Skill must NOT hardcode any language-specific conventions
* [ ] Skill should guide code analysis to detect language/patterns
* [ ] Multi-language projects should be supported
* [ ] Language-specific sub-skills can be added for deep guidance

## Acceptance Criteria (evolving)

* [ ] generate-trellis-specs SKILL.md contains only universal guidance
* [ ] Rust-specific content moved to a sub-skill or removed
* [ ] Skill can handle TypeScript, Python, Go, Rust, etc.
* [ ] Multi-language detection is supported

## Out of Scope (explicit)

* Writing actual language-specific sub-skills (Rust, TypeScript, etc.)
* Changing the conversion logic (OpenSpec → Trellis)
* Modifying other skills

## Technical Notes

### Skill System (transpec)
Skills are simple Markdown files in `.transpec/skills/{skill-name}/SKILL.md`. Currently only one skill exists.

### Spec-kit Extension System (for reference)
Spec-kit has a more complex extension system with catalogs, manifests (extension.yml), hooks, etc. This is a reference for potential future architecture but not what we're building now.

### Current Problem in SKILL.md
```markdown
# Find error handling patterns
grep -r "Result\|Option\| anyhow\|thiserror" xgit/src/ --include="*.rs"
# This is Rust-specific!
```

### Research on Similar Tools
Tools like `github/codeql`, `sembiance/coscap` perform universal code analysis by:
1. Detecting file extensions → infer language
2. Looking for common pattern markers (e.g., error handling, logging, testing)
3. NOT prescribing language-specific syntax

### Sub-skills Concept
Language-specific deep-dive skills could be:
```
generate-trellis-specs/
├── SKILL.md          # Universal, language-detecting (THIS WE'RE FIXING)
├── rust/             # Optional sub-skill for Rust-specific
│   └── SKILL.md
├── typescript/       # Optional sub-skill for TypeScript-specific
│   └── SKILL.md
└── python/           # Optional sub-skill for Python-specific
    └── SKILL.md
```

## Open Questions

* ~~**Blocking**: How should multi-language detection and spec generation work?~~ → **Decision**: Option B (separate per language), but user can choose during `transpec init`
* ~~**Preference**: Should sub-skills (for language-specific deep dives) be auto-discovered or explicitly referenced?~~ → **Decision**: Option C - auto-discovered by default, user can add custom

## Requirements (updated)

* [ ] Skill must NOT hardcode any language-specific conventions
* [ ] Skill should guide code analysis to detect language/patterns
* [ ] Multi-language projects generate separate spec directories per language
* [ ] Language-specific sub-skills are auto-discovered from skill directory
* [ ] User can add custom sub-skills for specific languages
* [ ] During `transpec init`, user can choose multi-language handling strategy
