# Add Submodule Update Script

## Goal
Add a repository script that updates git submodules to their mainline branch and automatically commits the resulting submodule pointer changes when updates are detected.

## Requirements
- Add a shell script at `scripts/update_submodule.sh`.
- The script must run from anywhere inside the repository by resolving the repo root first.
- The script must discover submodules from `.gitmodules`.
- For each submodule, the script must fetch remote updates and update the checked-out branch to the submodule's mainline branch.
- The script must support common mainline branch names, at minimum `main` and `master`.
- After submodule updates, the script must stage submodule pointer changes in the parent repository.
- If the parent repository has submodule pointer changes, the script must create a git commit automatically.
- The auto-generated commit message must follow conventional commits.
- If no submodule pointer changes are produced, the script must exit successfully without creating a commit.

## Acceptance Criteria
- [x] Running `scripts/update_submodule.sh` updates each configured submodule to its mainline branch when remote commits exist.
- [x] The script exits with a clear error when run outside the repository root tree or when required git operations fail.
- [x] The script creates a conventional-commit message only when submodule pointer changes are present.
- [x] The script leaves the parent repository unchanged when all submodules are already up to date.

## Technical Notes
- Use bash with fail-fast behavior and user-friendly stderr messages.
- Prefer reading `.gitmodules` via git config rather than parsing it manually.
- The parent repository commit should use a `chore(...)` conventional commit scope for submodule updates.
- Avoid disturbing unrelated parent-repository working tree changes outside staged submodule pointer updates.

## Execution Notes
- Added `scripts/update_submodule.sh` as an executable repository-level helper.
- The script detects the repository root from either the current working directory or the script location.
- The script reads submodule paths from `.gitmodules`, initializes missing submodules, detects the remote mainline branch, fast-forwards each submodule, and commits only changed gitlinks in the parent repository.
- Real-world verification succeeded in the local repository and produced commit `e95f8cd` with message `chore(submodules): update submodule refs`.
