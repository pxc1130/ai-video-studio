#!/bin/bash
# 兼容脚本放在 dist 内或 dist 同级目录的情况
DIR="$(dirname "$0")"
if [ -f "$DIR/index.html" ]; then
  cd "$DIR"
else
  cd "$DIR/dist"
fi

# 找一个空闲端口
PORT=8080
while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
  PORT=$((PORT+1))
done

echo "正在启动预览服务器 (端口 $PORT)..."
python3 -m http.server $PORT &
PID=$!
sleep 1
open "http://localhost:$PORT"
echo ""
echo "浏览器已打开。关闭此窗口即可停止服务器。"
read -n 1 -s -r -p "按任意键停止服务器..."
echo ""
kill $PID 2>/dev/null
