#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
  case "$(uname -m)" in
    arm64) node_arch=arm64 ;;
    x86_64) node_arch=x64 ;;
    *) echo 'Unsupported Mac architecture.'; exit 1 ;;
  esac
  mkdir -p .tools
  curl --fail --silent --show-error --location https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o .tools/node-checksums.txt
  node_archive=$(awk -v arch="$node_arch" '$2 ~ ("-darwin-" arch "\\.tar\\.gz$") {print $2}' .tools/node-checksums.txt)
  test -n "$node_archive"
  echo "Installing project-local $node_archive..."
  curl --fail --show-error --location "https://nodejs.org/dist/latest-v22.x/$node_archive" -o ".tools/$node_archive"
  (cd .tools && awk -v file="$node_archive" '$2 == file' node-checksums.txt | shasum -a 256 -c -)
  mkdir -p .tools/node
  tar -xzf ".tools/$node_archive" --strip-components=1 -C .tools/node
  rm ".tools/$node_archive"
fi
hash -r
exec node scripts/setup.cjs "$@"
