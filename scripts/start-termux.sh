#!/usr/bin/env bash
set -euo pipefail

# Helper script to run Bagley on Termux (Android).
# Usage: bash ./scripts/start-termux.sh

echo "== Avvio Bagley su Termux =="

if command -v termux-wake-lock >/dev/null 2>&1; then
  echo "Acquisizione wake lock (termux-wake-lock)..."
  termux-wake-lock || true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installa Node.js in Termux: 'pkg install nodejs'"
  exit 1
fi

echo "Installazione dipendenze (solo production)..."
npm install --omit=dev

echo "Nota: se l'installazione di 'sharp' fallisce, prova a installare 'vips' con: pkg install vips"

echo "Avvio del bot (npm start)..."
npm start
