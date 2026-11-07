#!/usr/bin/env bash
# Tworzy archiwum ZIP do zgłoszenia E2 (bez node_modules, dist, .env, .git).
# Użycie: scripts/make-submission-zip.sh [ścieżka/do/dokumentacji.pdf]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="../oddanie/E2/zai-projekt.zip"
PDF="${1:-}"
rm -f "$OUT"
mkdir -p "$(dirname "$OUT")"
zip -qr "$OUT" . \
  -x '*/node_modules/*' 'node_modules/*' '*/dist/*' 'dist/*' '.git/*' '.env' '*/.env' '*.log' '*.zip' '.DS_Store' '*/.DS_Store' 'coverage/*'
if [ -n "$PDF" ]; then
  [ -f "$PDF" ] || { echo "Brak pliku $PDF"; exit 1; }
  TMP=$(mktemp -d); cp "$PDF" "$TMP/dokumentacja.pdf"
  (cd "$TMP" && zip -q "$OLDPWD/$OUT" dokumentacja.pdf) ; rm -rf "$TMP"
else
  echo "Uwaga: nie dołączono PDF (podaj ścieżkę jako argument)."
fi
echo "Utworzono $(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
unzip -l "$OUT" | tail -1
