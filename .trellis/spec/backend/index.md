# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | ✅ Complete |
| [Database Guidelines](./database-guidelines.md) | SQLite schema, transactions, queries | ✅ Complete |
| [Error Handling](./error-handling.md) | Error types, handling strategies | ✅ Complete |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | ✅ Complete |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | ✅ Complete |
| [IR Design Principles](./ir-design-principles.md) | Core IR types, metadata, type mapping | ✅ Complete |
| [Framework Adapter Pattern](./framework-adapter-pattern.md) | Adapter interface, registry, implementation | ✅ Complete |
| [Conversion Pipeline](./conversion-pipeline.md) | 6-phase engine, validation, error handling | ✅ Complete |
| [Testing Guidelines](./testing-guidelines.md) | Vitest, test structure, coverage requirements | ✅ Complete |

---

## Transpec-Specific Guidelines

These guidelines document **Transpec's actual conventions** for framework conversion:

- **IR Design Principles**: Stable ABI IR schema - never changes when adding frameworks
- **Framework Adapter Pattern**: Each framework (OpenSpec, Trellis) has its own adapter
- **Conversion Pipeline**: 6-phase Parse → Analyze → Transform → Validate → Confirm → Emit

---

**Language**: All documentation is written in **English**.
