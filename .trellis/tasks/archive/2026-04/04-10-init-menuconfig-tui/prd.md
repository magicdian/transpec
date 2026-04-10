# Init Menuconfig-Style TUI

## Goal
Upgrade `transpec init` from sequential prompts to a menuconfig-style interactive TUI that lets users review and modify configuration items freely before final apply.

## Requirements
- Replace one-way step-by-step prompts with a menu-driven configuration interface for `init`.
- Support configuring at least: IDE/agent selection, source framework, target framework, analysis mode, and logging switch.
- Keep existing non-interactive behavior (`--yes`, explicit flags) compatible.
- Keep final confirmation and generated config/artifact outputs aligned with current `init` semantics.
- Follow the style direction from `MENUCONFIG_STYLE_MATRIX.md`: single-column row-based navigation with semantic prefixes and clear action rows.

## Acceptance Criteria
- [ ] Running `transpec init` in interactive mode opens a menuconfig-like TUI instead of linear question prompts.
- [ ] Users can navigate items, toggle/select values, revisit previous fields, and then confirm apply.
- [ ] Selected values are correctly written to project config and used by downstream steps.
- [ ] Existing explicit CLI options still override/seed defaults without regression.
- [ ] Build/typecheck pass for CLI package.

## Technical Notes
- Implement in `packages/cli/src/cli/commands/init.ts` with minimal blast radius.
- Reuse existing framework detection and config write pipeline.
- Prefer dependency-light implementation using existing `inquirer` capabilities first.
