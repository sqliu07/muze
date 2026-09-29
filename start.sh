#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$DIR/3rdparty/LDDC/LICENSE" ]; then
    echo "缺少 3rdparty/LDDC，请先执行:"
    echo "  git submodule update --init --recursive"
    exit 1
fi

echo "启动后端..."
cd "$DIR/backend"
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo "缺少后端虚拟环境，请先执行:"
    echo "  cd backend"
    echo "  python3 -m venv .venv"
    echo "  source .venv/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi
uvicorn main:app --reload &
BACKEND_PID=$!

echo "启动前端..."
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

cleanup() {
    echo "正在停止..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "已停止。"
}
trap cleanup EXIT INT TERM

echo ""
echo "后端: http://localhost:8000"
echo "前端: http://localhost:5173"
echo "按 Ctrl+C 停止"
wait
