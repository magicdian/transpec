# Publishing Guide

This document covers npm release preparation for `@magicdian/transpec`.

## Package Location

The publishable npm package lives in:

```text
packages/cli/
```

Run all release commands from that directory unless noted otherwise.

## Pre-Release Checklist

1. Confirm the root repository license is still Apache 2.0.
2. Confirm `packages/cli/package.json` uses the correct package name and version.
3. Build the package:

```bash
npm run build
```

4. Run tests:

```bash
npm test
```

5. Inspect the tarball payload:

```bash
npm pack --dry-run
```

You should verify that the package contains only runtime assets and package docs, not source tests or unrelated development files.

## Bump The Version

You can bump the package's date-based build number with:

```bash
node ./bin/transpec.js version --bump
```

Rebuild after changing the version:

```bash
npm run build
```

## Publish To npm

For the first public scoped release, publish with public access:

```bash
npm publish --access public
```

## Post-Publish Checks

After publishing:

1. Verify the npm package page shows the expected version and README
2. Verify the install command works:

```bash
npm install -g @magicdian/transpec
transpec version
```

3. Verify repository links, issue links, and license metadata render correctly on npm

## If Packaging Looks Wrong

If `npm pack --dry-run` includes unexpected files, fix `packages/cli/package.json` first instead of relying on npm ignore behavior drifting over time.
