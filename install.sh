#!/bin/sh
# Download and verify the self-contained herdr24 installer; no Go required.
set -eu
fail() { printf 'herdr24: %s\n' "$*" >&2; exit 1; }
repo=https://github.com/Kazte/herdr24
case $(uname -s) in Linux) os=linux ;; Darwin) os=darwin ;; *) fail 'Supported systems: Linux and macOS.' ;; esac
case $(uname -m) in x86_64|amd64) arch=amd64 ;; arm64|aarch64) arch=arm64 ;; *) fail 'Supported architectures: amd64 and arm64.' ;; esac
command -v curl >/dev/null 2>&1 || fail 'curl is required.'
if command -v sha256sum >/dev/null 2>&1; then checksum=sha256sum
elif command -v shasum >/dev/null 2>&1; then checksum=shasum
else fail 'sha256sum or shasum is required.'; fi
fetch() { curl --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 10 --max-time 120 --retry 2 -fsSL "$@"; }
version=${HERDR24_VERSION:-}
if [ -z "$version" ]; then
 resolved=$(fetch -o /dev/null -w '%{url_effective}' "$repo/releases/latest") || fail 'Cannot resolve latest release; a published release is required.'
 case "$resolved" in "$repo/releases/tag/"*) version=${resolved#"$repo/releases/tag/"} ;; *) fail 'Unexpected release URL.' ;; esac
fi
case "$version" in v[0-9]*) ;; *) fail 'HERDR24_VERSION must be a release tag such as v0.1.0.' ;; esac
case "$version" in *[!a-zA-Z0-9._-]*) fail 'Unsafe release tag.' ;; esac
asset=herdr24-installer_${os}_${arch}
tmp=$(mktemp -d "${TMPDIR:-/tmp}/herdr24-install.XXXXXXXX") || fail 'Cannot create temporary directory.'
cleanup() { rm -rf "$tmp"; }
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
base=$repo/releases/download/$version
fetch -o "$tmp/$asset" "$base/$asset" || fail 'Installer download failed.'
fetch -o "$tmp/SHA256SUMS" "$base/SHA256SUMS" || fail 'Checksum download failed.'
expected=$(awk -v name="$asset" '$2 == name || $2 == "*" name { value=$1; count++ } END { if(count != 1) exit 1; print value }' "$tmp/SHA256SUMS") || fail 'Missing or duplicate checksum entry.'
[ "${#expected}" -eq 64 ] || fail 'Invalid SHA256 checksum.'
case "$expected" in *[!0-9a-fA-F]*) fail 'Invalid SHA256 checksum.' ;; esac
if [ "$checksum" = sha256sum ]; then actual=$(sha256sum "$tmp/$asset")
else actual=$(shasum -a 256 "$tmp/$asset"); fi
actual=${actual%% *}
[ "$actual" = "$expected" ] || fail 'Checksum mismatch; installer was not executed.'
chmod 700 "$tmp/$asset"
"$tmp/$asset" "$@"
