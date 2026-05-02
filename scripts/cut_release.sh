#!/usr/bin/env bash
# Cut a GitHub release with the standard set of artifacts.
#
# Usage:  scripts/cut_release.sh <tag> <title> <notes-file>
# Example: scripts/cut_release.sh v0.1.2 "Aletheia 0.1.2" docs/release-notes/0.1.2.md
#
# Assumes the build has already produced installers under
# src-tauri/target/release/bundle/. Validates that all three expected
# artifacts exist before creating the release: the canonical versioned
# NSIS .exe, the canonical versioned MSI, and a version-stripped
# Aletheia_x64-setup.exe alias for the
# `releases/latest/download/Aletheia_x64-setup.exe` redirect.
#
# The alias is just a copy of the versioned NSIS installer with the
# version stripped from the filename. GitHub's /latest/download/<name>
# redirect resolves <name> against the most recent release's assets, so
# attaching this alias to every release means external links never need
# to be updated when we ship a new version.
set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "usage: $0 <tag> <title> [notes-file]" >&2
    exit 1
fi

TAG="$1"
TITLE="$2"
NOTES_FILE="${3:-}"

# Strip the leading 'v' from the tag to get the version baked into the
# Tauri-produced filenames.
VERSION="${TAG#v}"

ROOT="$(git rev-parse --show-toplevel)"
NSIS_VERSIONED="$ROOT/src-tauri/target/release/bundle/nsis/Aletheia_${VERSION}_x64-setup.exe"
MSI_VERSIONED="$ROOT/src-tauri/target/release/bundle/msi/Aletheia_${VERSION}_x64_en-US.msi"
NSIS_ALIAS="$ROOT/src-tauri/target/release/bundle/nsis/Aletheia_x64-setup.exe"

for f in "$NSIS_VERSIONED" "$MSI_VERSIONED"; do
    if [[ ! -f "$f" ]]; then
        echo "missing artifact: $f" >&2
        echo "run \`npm run tauri build\` first." >&2
        exit 1
    fi
done

# Refresh the version-stripped alias from the canonical installer.
cp -f "$NSIS_VERSIONED" "$NSIS_ALIAS"

if ! command -v gh >/dev/null 2>&1; then
    echo "gh (GitHub CLI) not on PATH; install from https://cli.github.com/" >&2
    exit 1
fi

NOTES_ARG=()
if [[ -n "$NOTES_FILE" ]]; then
    NOTES_ARG=(--notes-file "$NOTES_FILE")
else
    NOTES_ARG=(--generate-notes)
fi

gh release create "$TAG" \
    --repo jpatton72/Aletheia \
    --title "$TITLE" \
    "${NOTES_ARG[@]}" \
    "$NSIS_VERSIONED" \
    "$MSI_VERSIONED" \
    "$NSIS_ALIAS"

echo
echo "Release $TAG published. Always-latest links:"
echo "  https://github.com/jpatton72/Aletheia/releases/latest/download/Aletheia_x64-setup.exe"
echo "  https://github.com/jpatton72/Aletheia/releases/tag/$TAG"
