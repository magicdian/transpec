# brainstorm: publish transpec to npm

## Goal

Make the current OpenSpec -> Trellis conversion CLI installable from npm and add publish-ready documentation, with English as the default README and a Chinese `README_CN.md` that can cross-link with the English version.

## What I already know

* The repo currently has no top-level `README.md`.
* The publishable code appears to live in `packages/cli/`.
* `packages/cli/package.json` already defines a CLI package named `@magicdian/transpec` with bin entry `transpec`.
* The CLI already has implemented commands including `init`, `convert`, `validate`, `preprocess`, `postprocess`, `apply`, `detect`, and `version`.
* The package currently builds with `tsc`, has `prepublish`, and already includes a built `dist/` directory locally.
* There is no obvious `.npmignore` or `files` allowlist yet, so publish payload control may still need to be defined.
* The vendored `SpecFrameworks/Trellis` reference includes `README.md` and `README_CN.md` with language switch links, which is a useful documentation pattern to follow.

## Assumptions (temporary)

* npm publishing should target the CLI package in `packages/cli/`, not the repo root.
* The initial npm release can focus on CLI installation and usage, not a separate JS library API.
* The README should emphasize current supported direction first: OpenSpec -> Trellis conversion.
* Publishing setup should include package metadata needed for npm users to trust and install the tool cleanly.

## Open Questions

* Which npm package identity should be the canonical public release target?

## Requirements (evolving)

* Prepare the existing CLI package for npm publishing.
* Add English-first README documentation plus `README_CN.md`.
* Ensure the two README files link to each other.
* Document installation and basic usage for the conversion workflow.
* Use `@magicdian/transpec` as the canonical npm package identity for the first public release.
* Take the more productized first-release path: improve npm-facing metadata and README structure, not just minimum publish plumbing.
* Keep the main README focused on end-user installation and usage.
* Move developer-oriented content such as release/publish workflow and contribution/development notes into separate documentation, and link to it from the README.
* Store developer-facing docs at top-level `docs/development.md` and `docs/publishing.md`.
* Align npm/package-facing license metadata with the repository's Apache 2.0 license.

## Acceptance Criteria (evolving)

* [ ] Users can install the CLI from npm with `npm i -g @magicdian/transpec`.
* [ ] Package metadata is sufficient for a clean npm publish flow.
* [ ] The default README is English.
* [ ] `README.md` links to `README_CN.md` and `README_CN.md` links back to `README.md`.
* [ ] The README documents the current conversion capability accurately.
* [ ] The README is user-facing by default and does not mix in detailed developer workflow content.
* [ ] Developer-facing documentation exists in a separate document linked from the README.
* [ ] Developer docs live in `docs/development.md` and `docs/publishing.md`.
* [ ] Package and release-facing license metadata are consistent with Apache 2.0.

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* Expanding conversion support beyond the currently implemented OpenSpec -> Trellis capability
* Building a docs site or long-form documentation portal in this task
* Automating npm account/org setup outside the repository
* Writing a full contributor handbook beyond the minimum release/development notes needed for this package

## Technical Notes

* Inspected `packages/cli/package.json`, `packages/cli/tsconfig.json`, and CLI source layout under `packages/cli/src/`.
* Existing package metadata is minimal: no visible repository/homepage/bugs/files/publishConfig fields yet.
* Existing bilingual README pattern reference: `SpecFrameworks/Trellis/README.md` and `SpecFrameworks/Trellis/README_CN.md`.
* Package identity decision confirmed: first release uses `@magicdian/transpec`.
* Repo currently has no obvious top-level `docs/` directory; a small top-level `docs/` folder would be a clean place for developer-facing documentation.
* Documentation structure decision confirmed: use top-level `docs/development.md` and `docs/publishing.md`.
* License alignment decision confirmed: package metadata should match the root `LICENSE` file (Apache 2.0).

## Relevant Specs

* `.trellis/spec/backend/quality-guidelines.md`: package/config edits should stay explicit, typed, and minimal; verification should rely on typecheck/tests.
* `.trellis/spec/backend/testing-guidelines.md`: changes should be validated with the project's existing test workflow.
* `.trellis/spec/guides/code-reuse-thinking-guide.md`: before changing metadata/constants, search for all repeated occurrences such as package license strings.

## Code Patterns Found

* npm CLI package metadata pattern: `packages/cli/package.json`
* bilingual README cross-link pattern: `SpecFrameworks/Trellis/README.md`
* Chinese companion README pattern: `SpecFrameworks/Trellis/README_CN.md`

## Files to Modify

* `packages/cli/package.json`: publish metadata, package contents allowlist, license alignment
* `packages/cli/package-lock.json`: lockfile root package metadata refresh after package.json changes
* `packages/cli/src/core/ide/adapters/opencode.ts`: align generated skill metadata license strings if they are package-facing
* `packages/cli/src/core/ide/adapters/codex.ts`: align generated skill metadata license strings if they are package-facing
* `README.md`: new English user-facing readme
* `README_CN.md`: new Chinese user-facing readme
* `docs/development.md`: developer setup and development notes
* `docs/publishing.md`: release and npm publishing flow
