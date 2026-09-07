#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ST_DIR=${1:-/home/www/SillyTavern2}
SOURCE_DIR="$SCRIPT_DIR/server-plugin/writer-ai-relay-server"
TARGET_DIR="$ST_DIR/plugins/writer-ai-relay-server"

if [ ! -d "$ST_DIR" ] || [ ! -f "$ST_DIR/package.json" ]; then
  echo "找不到 SillyTavern 目录：$ST_DIR" >&2
  echo "用法：sh install-server.sh /你的/SillyTavern2" >&2
  exit 1
fi

if [ ! -f "$SOURCE_DIR/index.mjs" ] || [ ! -f "$SOURCE_DIR/native-session.mjs" ]; then
  echo "安装包缺少服务端插件：$SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp "$SOURCE_DIR/index.mjs" "$TARGET_DIR/index.mjs"
cp "$SOURCE_DIR/native-session.mjs" "$TARGET_DIR/native-session.mjs"
cp "$SOURCE_DIR/package.json" "$TARGET_DIR/package.json"

echo "服务端插件已安装到：$TARGET_DIR"
echo "请确认 config.yaml 中 enableServerPlugins: true，然后完整重启 SillyTavern。"
