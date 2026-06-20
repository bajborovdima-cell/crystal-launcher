#!/usr/bin/env bash
cd "$(dirname "$0")"
LOG_FILE="launcher.log"
echo "Starting..." > "$LOG_FILE"
if ! command -v node &>/dev/null; then
    echo "Node.js not found. Please install Node.js 22+."
    exit 1
fi
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        echo "npm install failed"
        exit 1
    fi
fi
npx electron . >> "$LOG_FILE" 2>&1
echo "Done. Check $LOG_FILE for output."
