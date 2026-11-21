#!/bin/sh
# Build the exact assets consumed by install.sh. No release is published here.
set -eu
version=${1:?usage: build-release.sh vX.Y.Z [output-directory]}
out=${2:-dist}
case "$version" in v[0-9]*) ;; *) printf 'Expected a version tag such as v0.1.0\n' >&2; exit 1 ;; esac
case "$version" in *[!a-zA-Z0-9._-]*) printf 'Unsafe release tag\n' >&2; exit 1 ;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
mkdir -p "$out"
for os in linux darwin; do
  for arch in amd64 arm64; do
    printf 'Building %s/%s\n' "$os" "$arch"
    CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -mod=readonly -trimpath -buildvcs=false \
      -ldflags "-s -w -X main.version=$version" -o "$out/herdr24-installer_${os}_${arch}" ./cmd/herdr24-installer
  done
done
cp install.sh "$out/install.sh"
cp licenses/*.txt "$out/"
# Include dependency notices alongside binary distribution, without adding them to
# the native runtime bundle or copying generated editor files.
notices="$out/THIRD_PARTY_NOTICES.txt"
printf 'herdr24 installer: Go dependency notices\n' > "$notices"
go list -mod=readonly -deps -f '{{with .Module}}{{.Path}}|{{.Dir}}{{end}}' ./cmd/herdr24-installer \
  | sort -u | while IFS='|' read -r module dir; do
    [ -n "$dir" ] || continue
    [ "$module" != github.com/Kazte/herdr24 ] || continue
    for name in LICENSE LICENSE.md LICENSE.txt COPYING; do
      if [ -f "$dir/$name" ]; then
        printf '\n--- %s ---\n' "$module" >> "$notices"
        cat "$dir/$name" >> "$notices"
        break
      fi
    done
  done
(
  cd "$out"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum herdr24-installer_* install.sh *.txt > SHA256SUMS
  else
    shasum -a 256 herdr24-installer_* install.sh *.txt > SHA256SUMS
  fi
)
