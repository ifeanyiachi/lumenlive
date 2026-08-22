#!/usr/bin/env bash
# Pack the runtime assets tarball consumed by .github/workflows/release.yml.
#
# The installer build fetches this tarball from a GitHub Release and extracts it
# at the repo root so the files line up with tauri.conf.json -> bundle.resources.
# It carries ONLY the large files that are too big for git (models, embeddings,
# the Bible DB); everything else (sdk/, src-tauri/libs/) is checked in and comes
# with the git checkout, so it is deliberately excluded here.
#
# The file list is derived from bundle.resources itself, so this tarball can
# never drift from what the app actually bundles: if a resource is added or a
# model swapped, re-running this picks it up automatically.
#
# Usage (from repo root):
#   bash data/pack-runtime-assets.sh 2
# where the argument is the assets version N. Produces:
#   lumenlive-runtime-assets-v<N>.tar   (+ prints its sha256)
#
# Then publish it and repoint the workflow:
#   gh release create assets-v<N> lumenlive-runtime-assets-v<N>.tar \
#     --title "Runtime assets v<N>" --notes "bge + moonshine + zipformer"
#   # update ASSETS_TAG / ASSETS_TAR / ASSETS_SHA256 in release.yml
set -euo pipefail

VER="${1:?usage: pack-runtime-assets.sh <version-number>}"
TAR="lumenlive-runtime-assets-v${VER}.tar"

cd "$(dirname "$0")/.."

# Pull every bundle.resources SOURCE path (the map keys). Keep only the untracked
# big-file roots (models/, embeddings/, data/*.db). Strip the leading "../" the
# keys carry (they are relative to src-tauri/). git-tracked resources (sdk/,
# libs/) are filtered out — the checkout already provides them.
mapfile -t FILES < <(
  node -e '
    const r = require("./src-tauri/tauri.conf.json").bundle.resources;
    for (const k of Object.keys(r)) {
      const p = k.replace(/^\.\.\//, "");
      if (/^(models|embeddings)\//.test(p) || /^data\/.*\.db$/.test(p)) console.log(p);
    }
  '
)

echo "Packing ${#FILES[@]} files into ${TAR}:"
printf "  %s\n" "${FILES[@]}"

# Fail loudly if any source file is missing rather than shipping a short tarball.
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "ERROR: missing $f — run the download/precompute step first" >&2; exit 1; }
done

rm -f "$TAR"
tar -cf "$TAR" "${FILES[@]}"

echo
echo "Wrote $TAR ($(du -h "$TAR" | cut -f1))"
echo "sha256:"
sha256sum "$TAR"
