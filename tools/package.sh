#!/bin/sh
# Builds the zip to upload to the Chrome Web Store.
#
# The zip contains ONLY what the extension needs to run. Tests, build notes,
# screenshots, sample reports and this script itself are development material
# and have no business inside a published package — anyone can download and
# unpack a published extension and read every file in it.
set -e
cd "$(dirname "$0")/.."

node tools/release-check.mjs

VERSION=$(node -p "require('./manifest.json').version")
NAME="ophtho-case-log-$VERSION.zip"

# Built in a scratch directory first: some synced/mounted folders do not allow
# the create-then-rename dance that zip uses, and fail halfway through.
TMP=$(mktemp -d)
zip -r -q "$TMP/$NAME" manifest.json icons src -x '*.DS_Store'

mkdir -p dist
cp "$TMP/$NAME" "dist/$NAME"
rm -rf "$TMP"

echo ""
echo "built dist/$NAME"
unzip -l "dist/$NAME"
