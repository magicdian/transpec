# Development Notes

This document is for contributors and maintainers. End-user installation and usage live in the root `README.md`.

## Repo Layout

- `packages/cli/`: publishable npm package for `@magicdian/transpec`
- `packages/cli/src/cli/`: CLI entrypoint and commands
- `packages/cli/src/core/`: conversion engine, framework adapters, IDE adapters, logging, validation
- `SpecFrameworks/`: reference framework snapshots used during development
- `.trellis/`: task workflow, project specs, and local development process

## Local Development

Install dependencies for the CLI package:

```bash
cd packages/cli
npm install
```

Build the package:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Check the CLI locally:

```bash
node ./bin/transpec.js version
node ./bin/transpec.js detect --path ..
```

## Notes For Docs And Packaging Work

- The root `README.md` and `README_CN.md` are the main user-facing docs for the repository.
- `packages/cli/README.md` and `packages/cli/README_CN.md` exist for the published npm package and should stay aligned at a high level.
- If you change package metadata or publish payload shape, verify with `npm pack --dry-run` from `packages/cli/`.

## Versioning

The CLI exposes:

```bash
transpec version
transpec version --bump
```

The current version format is date-based and implemented in `packages/cli/src/core/version.ts`.

## Validation Checklist

Before opening a PR or preparing a release:

1. Run `npm run build` in `packages/cli`
2. Run `npm test` in `packages/cli`
3. Run `npm pack --dry-run` in `packages/cli`
4. Confirm the README still matches the real CLI commands
5. Confirm package license metadata still matches the repo license
