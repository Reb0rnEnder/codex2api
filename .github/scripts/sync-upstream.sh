#!/usr/bin/env bash
set -euo pipefail

# Only merge released upstream code. Keep fork commits; conflicts fail before any push.
upstream_repo="${UPSTREAM_REPOSITORY:-james-6-23/codex2api}"
release_tag="${UPSTREAM_RELEASE_TAG:-$(gh api "repos/$upstream_repo/releases/latest" --jq .tag_name)}"
if ! [[ "$release_tag" =~ ^v[0-9][0-9A-Za-z._-]*$ ]]; then
  echo "Unexpected upstream release tag" >&2
  exit 1
fi
git fetch "${UPSTREAM_REMOTE:-https://github.com/$upstream_repo.git}" "refs/tags/$release_tag:refs/remotes/upstream/release"
changed=false
if ! git merge-base --is-ancestor refs/remotes/upstream/release HEAD; then
  git merge --no-edit refs/remotes/upstream/release
  changed=true
fi
if [[ "${PUBLISH_CURRENT:-false}" == true ]]; then changed=true; fi
{
  echo "changed=$changed"
  echo "upstream_tag=$release_tag"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
