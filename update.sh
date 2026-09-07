#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ST_DIR=${1:-/home/www/SillyTavern2}

cd "$SCRIPT_DIR"
git pull --ff-only
sh "$SCRIPT_DIR/install-server.sh" "$ST_DIR"

echo "AI 接力已更新。请完整重启 SillyTavern。"
