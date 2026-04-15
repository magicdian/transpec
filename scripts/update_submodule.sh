#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(CDPATH="" cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

error() {
  printf 'Error: %s\n' "$1" >&2
}

info() {
  printf '%s\n' "$1"
}

find_repo_root_from() {
  local start_dir="$1"
  local dir

  dir="$(cd -- "$start_dir" 2>/dev/null && pwd)" || return 1

  while true; do
    if [[ -f "$dir/.gitmodules" && -e "$dir/.git" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi

    if [[ "$dir" == "/" ]]; then
      break
    fi

    dir="$(dirname -- "$dir")"
  done

  return 1
}

ensure_submodule_initialized() {
  local repo_root="$1"
  local path="$2"
  local status_line
  local prefix

  status_line="$(git -C "$repo_root" submodule status -- "$path")"
  prefix="${status_line:0:1}"

  if [[ "$prefix" == "-" ]]; then
    info "Initializing $path"
    git -C "$repo_root" submodule update --init -- "$path" >/dev/null
  fi
}

ensure_submodule_clean() {
  local path="$1"

  if [[ -n "$(git -C "$path" status --short)" ]]; then
    error "Submodule '$path' has local changes. Commit or stash them before updating."
    exit 1
  fi
}

detect_mainline_branch() {
  local path="$1"
  local remote_head=""
  local candidate=""

  git -C "$path" remote set-head origin --auto >/dev/null 2>&1 || true
  remote_head="$(git -C "$path" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"

  if [[ -n "$remote_head" ]]; then
    printf '%s\n' "${remote_head#origin/}"
    return 0
  fi

  for candidate in main master; do
    if git -C "$path" show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

checkout_mainline_branch() {
  local path="$1"
  local branch="$2"

  if git -C "$path" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$path" checkout "$branch" >/dev/null
  else
    git -C "$path" checkout -B "$branch" --track "origin/$branch" >/dev/null
  fi
}

main() {
  local repo_root=""
  local remote_branch=""
  local submodule_key=""
  local submodule_path=""
  local old_sha=""
  local new_sha=""
  local changed_count=0
  local -a changed_paths=()

  if ! command -v git >/dev/null 2>&1; then
    error "git is required but was not found in PATH."
    exit 1
  fi

  repo_root="$(find_repo_root_from "$PWD" || true)"
  if [[ -z "$repo_root" ]]; then
    repo_root="$(find_repo_root_from "$SCRIPT_DIR" || true)"
  fi

  if [[ -z "$repo_root" ]]; then
    error "Could not locate the repository root with a .gitmodules file."
    exit 1
  fi

  if [[ ! -f "$repo_root/.gitmodules" ]]; then
    error "No .gitmodules file found under '$repo_root'."
    exit 1
  fi

  if ! git -C "$repo_root" config --file "$repo_root/.gitmodules" --get-regexp '^submodule\..*\.path$' >/dev/null 2>&1; then
    error "No submodule paths were found in .gitmodules."
    exit 1
  fi

  info "Repository root: $repo_root"

  while read -r submodule_key submodule_path; do
    info "Processing $submodule_path"

    ensure_submodule_initialized "$repo_root" "$submodule_path"
    ensure_submodule_clean "$repo_root/$submodule_path"

    git -C "$repo_root/$submodule_path" fetch origin --prune >/dev/null

    remote_branch="$(detect_mainline_branch "$repo_root/$submodule_path")" || {
      error "Could not determine the mainline branch for '$submodule_path'."
      exit 1
    }

    old_sha="$(git -C "$repo_root/$submodule_path" rev-parse HEAD)"

    checkout_mainline_branch "$repo_root/$submodule_path" "$remote_branch"
    git -C "$repo_root/$submodule_path" merge --ff-only "origin/$remote_branch" >/dev/null

    new_sha="$(git -C "$repo_root/$submodule_path" rev-parse HEAD)"

    if [[ "$old_sha" != "$new_sha" ]]; then
      changed_paths+=("$submodule_path")
      changed_count=$((changed_count + 1))
      info "Updated $submodule_path: ${old_sha:0:7} -> ${new_sha:0:7} ($remote_branch)"
    else
      info "$submodule_path is already up to date on $remote_branch"
    fi
  done < <(git -C "$repo_root" config --file "$repo_root/.gitmodules" --get-regexp '^submodule\..*\.path$')

  if [[ "$changed_count" -eq 0 ]]; then
    info "No submodule updates detected. Nothing to commit."
    exit 0
  fi

  git -C "$repo_root" add -- "${changed_paths[@]}"
  git -C "$repo_root" commit -m "chore(submodules): update submodule refs" --only -- "${changed_paths[@]}"

  info "Committed $changed_count updated submodule reference(s)."
}

main "$@"
