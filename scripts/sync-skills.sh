#!/usr/bin/env bash
# sync-skills.sh — publica las skills de proyecto en los runtimes de agente instalados.
#
# Fuente de verdad ÚNICA: .agents/skills/<nombre>/SKILL.md (formato portable).
# Este script crea *vistas* de esa fuente donde cada runtime las busca:
#
#   Claude Code   →  .claude/skills/<nombre>      (proyecto)   |  ~/.claude/skills/<nombre>            (global)
#   OpenCode      →  .opencode/skills/<nombre>    (proyecto)   |  ~/.config/opencode/skills/<nombre>   (global)
#
# Las rutas siguen la convención de skills-forge (github.com/Arkessiah/skills-forge).
# Nota: OpenChamber usa .agents/skills directamente; por eso la fuente vive ahí y el resto
# son vistas generadas.
#
# Uso:
#   bash scripts/sync-skills.sh                 # symlinks de proyecto (default)
#   bash scripts/sync-skills.sh --copy          # copia en vez de symlink (Windows/FAT)
#   bash scripts/sync-skills.sh --global        # instala también en el HOME del usuario
#   bash scripts/sync-skills.sh --target claude # solo un runtime (claude|opencode|both)
#   bash scripts/sync-skills.sh --list          # qué hay y dónde
#   bash scripts/sync-skills.sh --dry-run
#
# Las vistas generadas están en .gitignore: al repo solo viaja .agents/skills/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/.agents/skills"

MODE="link"        # link | copy
SCOPE="project"    # project | global
TARGET="both"      # claude | opencode | both
DRY_RUN=0
LIST_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy)      MODE="copy"; shift ;;
    --link)      MODE="link"; shift ;;
    --global)    SCOPE="global"; shift ;;
    --project)   SCOPE="project"; shift ;;
    --target)    TARGET="${2:-both}"; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --list)      LIST_ONLY=1; shift ;;
    -h|--help)   sed -n '2,25p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)           echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

case "$TARGET" in
  claude|opencode|both) ;;
  *) echo "--target debe ser claude, opencode o both" >&2; exit 2 ;;
esac

if [[ ! -d "$SRC_DIR" ]]; then
  echo "No existe $SRC_DIR — no hay skills que sincronizar." >&2
  exit 1
fi

# Destinos según runtime y scope.
dest_for() {
  case "$1:$SCOPE" in
    claude:project)   echo "$REPO_ROOT/.claude/skills" ;;
    claude:global)    echo "$HOME/.claude/skills" ;;
    opencode:project) echo "$REPO_ROOT/.opencode/skills" ;;
    opencode:global)  echo "$HOME/.config/opencode/skills" ;;
  esac
}

runtimes=()
[[ "$TARGET" == "claude"   || "$TARGET" == "both" ]] && runtimes+=("claude")
[[ "$TARGET" == "opencode" || "$TARGET" == "both" ]] && runtimes+=("opencode")

# Skills disponibles: un directorio con SKILL.md dentro.
mapfile -t SKILLS < <(find "$SRC_DIR" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' \; -print | sort)

if [[ ${#SKILLS[@]} -eq 0 ]]; then
  echo "No se encontró ningún <skill>/SKILL.md en $SRC_DIR" >&2
  exit 1
fi

if [[ $LIST_ONLY -eq 1 ]]; then
  echo "Fuente: $SRC_DIR"
  for s in "${SKILLS[@]}"; do
    name="$(basename "$s")"
    desc="$(sed -n 's/^description:[[:space:]]*//p' "$s/SKILL.md" | head -1 | cut -c1-80)"
    printf '  %-32s %s\n' "$name" "$desc"
  done
  echo
  for rt in "${runtimes[@]}"; do
    d="$(dest_for "$rt")"
    printf '%-9s (%s) → %s' "$rt" "$SCOPE" "$d"
    [[ -d "$d" ]] && echo "  [existe]" || echo "  [sin crear]"
  done
  exit 0
fi

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

for rt in "${runtimes[@]}"; do
  DEST="$(dest_for "$rt")"
  echo "→ $rt ($SCOPE): $DEST"
  run mkdir -p "$DEST"

  for src in "${SKILLS[@]}"; do
    name="$(basename "$src")"
    target="$DEST/$name"

    # Solo retiramos lo que gestionamos nosotros: un symlink previo, o un directorio
    # que ya sincronizamos antes (lleva la marca .synced-from-agents).
    if [[ -L "$target" ]]; then
      run rm -f "$target"
    elif [[ -d "$target" ]]; then
      if [[ -f "$target/.synced-from-agents" ]]; then
        run rm -rf "$target"
      else
        echo "  ! $name existe y no lo gestiona este script — lo dejo intacto" >&2
        continue
      fi
    fi

    if [[ "$MODE" == "link" ]]; then
      run ln -s "$src" "$target"
      echo "  ✓ $name (symlink)"
    else
      run cp -R "$src" "$target"
      run touch "$target/.synced-from-agents"
      echo "  ✓ $name (copia)"
    fi
  done
done

echo
echo "Listo. ${#SKILLS[@]} skill(s) publicadas desde .agents/skills."
[[ "$MODE" == "copy" ]] && echo "Modo copia: vuelve a ejecutarlo tras editar una skill (las copias no siguen a la fuente)."
exit 0
