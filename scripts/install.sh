#!/bin/bash
# BackItUp Install Script
# Usage:
#   Install latest:  curl -fsSL https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.sh | bash
#   Install version: curl -fsSL https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.sh | bash -s -- --version v1.0.0
#   Uninstall:       curl -fsSL https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.sh | bash -s -- --uninstall

set -euo pipefail

# Configuration
REPO="climactic/backitup"
INSTALL_DIR="${BACKITUP_INSTALL_DIR:-}"
BINARY_NAME="backitup"
VERSION="${BACKITUP_VERSION:-latest}"
ACTION="install"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

usage() {
  cat <<EOF
BackItUp Install Script

Usage:
  install.sh [options]

Options:
  -v, --version <tag>   Install a specific version (e.g., v1.0.0)
  -d, --dir <path>      Install to a specific directory
  -u, --uninstall       Uninstall backitup
  -h, --help            Show this help message

Examples:
  # Install latest version
  ./install.sh

  # Install specific version
  ./install.sh --version v1.0.0

  # Install to custom directory
  ./install.sh --dir /opt/bin

  # Uninstall
  ./install.sh --uninstall

Environment Variables:
  BACKITUP_VERSION      Version to install (default: latest)
  BACKITUP_INSTALL_DIR  Installation directory
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -v|--version)
        VERSION="$2"
        shift 2
        ;;
      -d|--dir)
        INSTALL_DIR="$2"
        shift 2
        ;;
      -u|--uninstall)
        ACTION="uninstall"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done
}

detect_arch() {
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) log_error "Unsupported architecture: $arch"; exit 1 ;;
  esac
}

detect_os() {
  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$os" in
    linux) echo "linux" ;;
    darwin) echo "darwin" ;;
    mingw*|msys*|cygwin*) echo "windows" ;;
    *) log_error "Unsupported OS: $os"; exit 1 ;;
  esac
}

get_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name":' \
    | sed -E 's/.*"([^"]+)".*/\1/'
}

determine_install_dir() {
  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')

  if [[ -n "$INSTALL_DIR" ]]; then
    echo "$INSTALL_DIR"
    return
  fi

  case "$os" in
    mingw*|msys*|cygwin*)
      # Windows: use LOCALAPPDATA or user's bin directory
      if [[ -n "${LOCALAPPDATA:-}" ]]; then
        local win_dir="$LOCALAPPDATA/Programs/backitup"
        mkdir -p "$win_dir"
        echo "$win_dir"
      else
        mkdir -p "$HOME/bin"
        echo "$HOME/bin"
      fi
      ;;
    *)
      # Linux/macOS
      if [[ -w /usr/local/bin ]]; then
        echo "/usr/local/bin"
      elif [[ -d "$HOME/.local/bin" ]]; then
        echo "$HOME/.local/bin"
      else
        mkdir -p "$HOME/.local/bin"
        echo "$HOME/.local/bin"
      fi
      ;;
  esac
}

find_binary() {
  local os binary_name locations
  os=$(uname -s | tr '[:upper:]' '[:lower:]')

  # Handle Windows .exe extension
  case "$os" in
    mingw*|msys*|cygwin*)
      binary_name="${BINARY_NAME}.exe"
      locations=(
        "$HOME/bin/$binary_name"
      )
      if [[ -n "${LOCALAPPDATA:-}" ]]; then
        locations=("$LOCALAPPDATA/Programs/backitup/$binary_name" "${locations[@]}")
      fi
      ;;
    *)
      binary_name="$BINARY_NAME"
      locations=(
        "/usr/local/bin/$binary_name"
        "$HOME/.local/bin/$binary_name"
        "/usr/bin/$binary_name"
        "/opt/bin/$binary_name"
      )
      ;;
  esac

  # Also check INSTALL_DIR if set
  if [[ -n "$INSTALL_DIR" ]]; then
    locations=("$INSTALL_DIR/$binary_name" "${locations[@]}")
  fi

  for loc in "${locations[@]}"; do
    if [[ -f "$loc" ]]; then
      echo "$loc"
      return 0
    fi
  done

  # Try which as fallback
  if command -v "$binary_name" &>/dev/null; then
    command -v "$binary_name"
    return 0
  fi

  return 1
}

verify_checksum() {
  local file="$1"
  local expected="$2"
  local actual
  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')

  case "$os" in
    darwin)
      actual=$(shasum -a 256 "$file" | cut -d' ' -f1)
      ;;
    mingw*|msys*|cygwin*)
      actual=$(sha256sum "$file" | cut -d' ' -f1)
      ;;
    *)
      actual=$(sha256sum "$file" | cut -d' ' -f1)
      ;;
  esac

  if [[ "$actual" != "$expected" ]]; then
    log_error "Checksum verification failed!"
    log_error "Expected: $expected"
    log_error "Got: $actual"
    return 1
  fi
  log_info "Checksum verified"
}

do_install() {
  local os arch version install_dir artifact_name download_url checksum_url binary_ext local_binary

  log_info "Installing BackItUp..."

  os=$(detect_os)
  arch=$(detect_arch)
  log_info "Detected: $os-$arch"

  # Windows only supports x64
  if [[ "$os" == "windows" && "$arch" != "x64" ]]; then
    log_error "Windows only supports x64 architecture"
    exit 1
  fi

  if [[ "$VERSION" == "latest" ]]; then
    version=$(get_latest_version)
  else
    version="$VERSION"
  fi
  log_info "Version: $version"

  install_dir=$(determine_install_dir)
  log_info "Install directory: $install_dir"

  # Handle Windows .exe extension
  if [[ "$os" == "windows" ]]; then
    binary_ext=".exe"
    artifact_name="${BINARY_NAME}-${os}-${arch}.exe"
    local_binary="${BINARY_NAME}.exe"
  else
    binary_ext=""
    artifact_name="${BINARY_NAME}-${os}-${arch}"
    local_binary="${BINARY_NAME}"
  fi

  download_url="https://github.com/${REPO}/releases/download/${version}/${artifact_name}"
  checksum_url="${download_url}.sha256"

  tmp_dir=$(mktemp -d)
  trap 'rm -rf "$tmp_dir"' EXIT

  log_info "Downloading ${artifact_name}..."
  curl -fL# "$download_url" -o "$tmp_dir/$local_binary"

  log_info "Downloading checksum..."
  curl -fsSL "$checksum_url" -o "$tmp_dir/checksum.sha256"

  local expected_checksum
  expected_checksum=$(cut -d' ' -f1 "$tmp_dir/checksum.sha256")
  verify_checksum "$tmp_dir/$local_binary" "$expected_checksum"

  # Make executable (not needed on Windows)
  if [[ "$os" != "windows" ]]; then
    chmod +x "$tmp_dir/$local_binary"
  fi

  if [[ -w "$install_dir" ]]; then
    mv "$tmp_dir/$local_binary" "$install_dir/$local_binary"
  elif [[ "$os" == "windows" ]]; then
    log_error "Cannot write to $install_dir. Please run as Administrator or choose a different directory with --dir"
    exit 1
  else
    log_warn "Need sudo to install to $install_dir"
    sudo mv "$tmp_dir/$local_binary" "$install_dir/$local_binary"
  fi

  log_info "BackItUp installed successfully to $install_dir/$local_binary"

  if ! echo "$PATH" | grep -q "$install_dir"; then
    log_warn "$install_dir is not in your PATH"
    if [[ "$os" == "windows" ]]; then
      log_warn "Add it to your PATH in System Environment Variables"
    else
      log_warn "Add it with: export PATH=\"\$PATH:$install_dir\""
    fi
  fi

  log_info "Testing installation..."
  "$install_dir/$local_binary" --version
}

do_uninstall() {
  log_info "Uninstalling BackItUp..."

  local binary_path os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')

  if ! binary_path=$(find_binary); then
    log_error "BackItUp is not installed or could not be found"
    exit 1
  fi

  log_info "Found binary at: $binary_path"

  local dir
  dir=$(dirname "$binary_path")

  if [[ -w "$dir" ]]; then
    rm -f "$binary_path"
  elif [[ "$os" == mingw* || "$os" == msys* || "$os" == cygwin* ]]; then
    log_error "Cannot write to $dir. Please run as Administrator"
    exit 1
  else
    log_warn "Need sudo to remove from $dir"
    sudo rm -f "$binary_path"
  fi

  log_info "BackItUp has been uninstalled"
}

main() {
  parse_args "$@"

  case "$ACTION" in
    install)
      do_install
      ;;
    uninstall)
      do_uninstall
      ;;
  esac
}

main "$@"
