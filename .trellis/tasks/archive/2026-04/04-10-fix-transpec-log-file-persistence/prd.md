# Fix transpec log file persistence

## Goal
Ensure transpec writes runtime logs into `.transpec/logs/` for initialized projects, with file logging enabled by default at INFO level and support for higher verbosity levels.

## Requirements
- `transpec init` must generate logging configuration that enables file logging by default for initialized projects.
- CLI commands that operate on a transpec project must load logging settings from `.transpec/config.yaml`.
- The logging subsystem must persist log entries to disk instead of keeping them only in memory.
- Default persisted logs must include INFO, WARN, and ERROR entries, and support DEBUG/TRACE when configured.
- Log file creation must not break existing CLI command flows when the project is missing or file logging is disabled.

## Acceptance Criteria
- [x] Running transpec commands in an initialized project creates a log file under `.transpec/logs/`.
- [x] Default configuration persists at least INFO/WARN/ERROR entries without extra flags.
- [x] Enabling verbose or lower configured levels allows DEBUG/TRACE entries to be written.
- [x] Existing commands continue to function when no config file exists or file logging is disabled.
- [x] Automated tests cover config-driven logger setup and file persistence behavior.

## Technical Notes
- Scope is backend / CLI infrastructure.
- Logging configuration currently exists in `.transpec/config.yaml`, but file settings are not wired through command setup.
- The current `LogWriter` buffers in memory and never flushes to disk, which likely explains the missing log files.

## Implementation Summary (2026-04-10)
- Added project-aware logger bootstrap utility `configureProjectLogger(...)` and migrated CLI commands (`init`, `convert`, `apply`, `detect`, `preprocess`) to use it.
- `transpec init` now writes file logging defaults to `.transpec/config.yaml` with `.transpec/logs/transpec.log` and rotation settings.
- Updated logger internals to persist JSON log entries to disk, create log directories automatically, and rotate files based on size.
- Replaced custom YAML parser with `yaml` package parser to support nested logging config fields robustly.
- Added regression tests for config-driven logger setup and runtime file persistence.

## Spec Updates (2026-04-10)
- Updated backend logging code-spec: `.trellis/spec/backend/logging-guidelines.md`
- Added executable contract section: `Scenario: Project Log Persistence for CLI Runtime`
- Captured signatures, config contracts, validation/error matrix, Good/Base/Bad cases, required tests, and Wrong vs Correct examples.
