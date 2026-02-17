#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/bin"

echo "Building ralph..."
make build

mkdir -p "$INSTALL_DIR"
cp ralph "$INSTALL_DIR/ralph"
chmod +x "$INSTALL_DIR/ralph"
echo "Installed ralph to ${INSTALL_DIR}/ralph"

if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  echo ""
  echo "WARNING: ${INSTALL_DIR} is not in your PATH."
  echo "Add this to your shell profile (~/.zshrc or ~/.bashrc):"
  echo ""
  echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
fi
