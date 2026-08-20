#!/usr/bin/env bash
# type-budget.sh — trinquete de deuda de tipos.
#
# El repo arrastra errores de `tsc` que nadie ha arreglado todavia. Poner un
# type-check bloqueante dejaria el CI en rojo permanente, y un CI rojo que se
# ignora es peor que no tenerlo: deja de significar nada.
#
# Asi que en vez de exigir cero, se exige NO EMPEORAR. El presupuesto vive en
# TYPE_BUDGET; si los errores lo superan, el CI falla. Si bajan, avisa para que
# lo aprietes, y asi la deuda solo puede ir a menos.
#
# Solo cuenta codigo de PRODUCCION: los ficheros de test tienen ruido propio de
# `bun:test` que no dice nada sobre la salud del producto.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUDGET_FILE="$ROOT/TYPE_BUDGET"
PKG="${1:-packages/terminal}"

cd "$ROOT/$PKG" || exit 1

errors=$(bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "error TS" | grep -v "__tests__" | wc -l | tr -d ' ')
budget=$(tr -d '[:space:]' < "$BUDGET_FILE" 2>/dev/null || echo 0)

echo "Errores de tipos en produccion ($PKG): $errors"
echo "Presupuesto:                            $budget"

if [ "$errors" -gt "$budget" ]; then
  echo ""
  echo "FALLO: la deuda de tipos ha SUBIDO en $((errors - budget))."
  echo "Arregla lo que has introducido, o justifica subir el presupuesto en TYPE_BUDGET."
  echo ""
  bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "error TS" | grep -v "__tests__" | head -20
  exit 1
fi

if [ "$errors" -lt "$budget" ]; then
  echo ""
  echo "Has bajado la deuda en $((budget - errors)). Aprieta el trinquete:"
  echo "    echo $errors > TYPE_BUDGET"
fi

echo "OK"
