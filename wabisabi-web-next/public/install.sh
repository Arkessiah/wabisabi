#!/usr/bin/env bash
set -euo pipefail

# WabiSabi CLI Installer
# Usage: curl -fsSL https://wabisabi.dev/install.sh | bash

VERSION="${WABISABI_VERSION:-latest}"
INSTALL_DIR="${WABISABI_INSTALL_DIR:-$HOME/.wabisabi}"
BIN_DIR="${WABISABI_BIN_DIR:-$HOME/.local/bin}"
REPO="Arkessiah/wabisabi"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[wabisabi]${NC} $1"; }
ok()    { echo -e "${GREEN}[wabisabi]${NC} $1"; }
warn()  { echo -e "${YELLOW}[wabisabi]${NC} $1"; }
err()   { echo -e "${RED}[wabisabi]${NC} $1" >&2; }

# Detect OS and arch
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="darwin" ;;
    *)       err "Unsupported OS: $OS. Use npm install -g @wabisabi/cli instead."; exit 1 ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)             err "Unsupported architecture: $ARCH"; exit 1 ;;
  esac
}

# Check if a command exists
has() { command -v "$1" >/dev/null 2>&1; }

# Install Bun if not present
ensure_bun() {
  if has bun; then
    ok "Bun found: $(bun --version)"
    return
  fi

  info "Bun not found. Installing Bun..."
  curl -fsSL https://bun.sh/install | bash

  # Source bun into current session
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if has bun; then
    ok "Bun installed: $(bun --version)"
  else
    err "Failed to install Bun. Install it manually: https://bun.sh"
    exit 1
  fi
}

# Download and install WabiSabi
install_wabisabi() {
  info "Installing WabiSabi CLI..."

  # Clean previous installation
  if [ -d "$INSTALL_DIR/cli" ]; then
    warn "Removing previous installation..."
    rm -rf "$INSTALL_DIR/cli"
  fi

  mkdir -p "$INSTALL_DIR" "$BIN_DIR"

  # Determine download URL
  if [ "$VERSION" = "latest" ]; then
    TARBALL_URL="https://github.com/$REPO/releases/latest/download/wabisabi-cli-${PLATFORM}-${ARCH}.tar.gz"
    # Fallback: clone from source if no release binary exists
    CLONE_FALLBACK=true
  else
    TARBALL_URL="https://github.com/$REPO/releases/download/v${VERSION}/wabisabi-cli-${PLATFORM}-${ARCH}.tar.gz"
    CLONE_FALLBACK=true
  fi

  # Try binary release first
  if curl -fsSL --head "$TARBALL_URL" >/dev/null 2>&1; then
    info "Downloading binary release..."
    curl -fsSL "$TARBALL_URL" | tar xz -C "$INSTALL_DIR"
    ok "Binary downloaded."
  elif [ "${CLONE_FALLBACK:-}" = "true" ]; then
    # Fallback: build from source
    info "No prebuilt binary found. Building from source..."

    if ! has git; then
      err "git is required to build from source."
      exit 1
    fi

    TEMP_DIR="$(mktemp -d)"
    trap 'rm -rf "$TEMP_DIR"' EXIT

    info "Cloning repository..."
    git clone --depth 1 "https://github.com/$REPO.git" "$TEMP_DIR/wabisabi" 2>/dev/null

    info "Installing dependencies..."
    cd "$TEMP_DIR/wabisabi/packages/terminal"
    bun install --frozen-lockfile 2>/dev/null || bun install

    info "Building..."
    bun build src/index.ts --outfile dist/index.js --target bun

    # Copy built CLI to install dir
    mkdir -p "$INSTALL_DIR/cli"
    cp -r dist/ "$INSTALL_DIR/cli/dist/"
    cp package.json "$INSTALL_DIR/cli/"

    # Install runtime deps
    cd "$INSTALL_DIR/cli"
    bun install --production 2>/dev/null || bun install

    cd - >/dev/null
  else
    err "Download failed: $TARBALL_URL"
    exit 1
  fi
}

# Create launcher script
create_launcher() {
  LAUNCHER="$BIN_DIR/wabisabi"

  cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/usr/bin/env bash
# WabiSabi CLI launcher
WABISABI_HOME="${WABISABI_INSTALL_DIR:-$HOME/.wabisabi}"

# Find bun
if command -v bun >/dev/null 2>&1; then
  BUN="bun"
elif [ -x "$HOME/.bun/bin/bun" ]; then
  BUN="$HOME/.bun/bin/bun"
else
  echo "Error: Bun runtime not found. Install it: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

exec "$BUN" run "$WABISABI_HOME/cli/dist/index.js" "$@"
LAUNCHER_EOF

  chmod +x "$LAUNCHER"
}

# Add to PATH if needed
setup_path() {
  if echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
    return
  fi

  SHELL_NAME="$(basename "$SHELL")"
  case "$SHELL_NAME" in
    zsh)  RC_FILE="$HOME/.zshrc" ;;
    bash) RC_FILE="$HOME/.bashrc" ;;
    fish) RC_FILE="$HOME/.config/fish/config.fish" ;;
    *)    RC_FILE="$HOME/.profile" ;;
  esac

  LINE="export PATH=\"$BIN_DIR:\$PATH\""
  if [ "$SHELL_NAME" = "fish" ]; then
    LINE="set -gx PATH $BIN_DIR \$PATH"
  fi

  if [ -f "$RC_FILE" ] && grep -qF "$BIN_DIR" "$RC_FILE"; then
    return
  fi

  echo "" >> "$RC_FILE"
  echo "# WabiSabi CLI" >> "$RC_FILE"
  echo "$LINE" >> "$RC_FILE"

  warn "Added $BIN_DIR to PATH in $RC_FILE"
  warn "Run: source $RC_FILE (or open a new terminal)"
}

# Main
main() {
  echo ""
  echo -e "${CYAN}  ╦ ╦┌─┐┌┐ ┬┌─┐┌─┐┌┐ ┬${NC}"
  echo -e "${CYAN}  ║║║├─┤├┴┐│└─┐├─┤├┴┐│${NC}"
  echo -e "${CYAN}  ╚╩╝┴ ┴└─┘┴└─┘┴ ┴└─┘┴${NC}"
  echo -e "  ${GREEN}AI Coding Agent Installer${NC}"
  echo ""

  detect_platform
  info "Platform: $PLATFORM ($ARCH)"

  ensure_bun
  install_wabisabi
  create_launcher
  setup_path

  echo ""
  ok "WabiSabi CLI installed successfully!"
  echo ""
  info "Run ${GREEN}wabisabi${NC} to get started"
  info "Run ${GREEN}wabisabi --help${NC} for usage"
  info "Config: ~/.wabisabi/config.jsonc"
  echo ""
}

main
