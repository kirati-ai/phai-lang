#!/usr/bin/env sh
# Phai Lang (based on Apsi by ATEC) without installing:  ./phai.sh run examples/01_hello.apsi
DIR="$(cd "$(dirname "$0")" && pwd)"
PY=python3
[ -x "$DIR/.venv/bin/python" ] && PY="$DIR/.venv/bin/python"
APSI_PROG=phai PYTHONPATH="$DIR${PYTHONPATH:+:$PYTHONPATH}" exec "$PY" -m apsi "$@"
