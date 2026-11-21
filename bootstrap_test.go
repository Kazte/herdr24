package herdr24

import (
	"crypto/sha256"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestBootstrap(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX bootstrap")
	}
	for _, tt := range []struct {
		name, os, arch, version, fail string
		code                          int
	}{
		{"latest-linux", "Linux", "x86_64", "", "", 0},
		{"pinned-darwin-arm", "Darwin", "arm64", "v1.2.3", "", 0},
		{"unsupported-os", "Windows", "x86_64", "", "", 1},
		{"unsupported-arch", "Linux", "riscv64", "", "", 1},
		{"checksum-mismatch", "Linux", "aarch64", "", "checksum", 1},
		{"download-failure", "Linux", "x86_64", "", "download", 1},
		{"binary-exit", "Linux", "x86_64", "", "binary", 7},
		{"bad-version", "Linux", "x86_64", "../bad", "", 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			bin := filepath.Join(root, "bin")
			tmp := filepath.Join(root, "tmp")
			os.Mkdir(bin, 0755)
			os.Mkdir(tmp, 0700)
			put := func(name, content string) {
				t.Helper()
				if err := os.WriteFile(filepath.Join(bin, name), []byte(content), 0755); err != nil {
					t.Fatal(err)
				}
			}
			payload := []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$FIXTURE/args\"\nexit \"${BINARY_EXIT:-0}\"\n")
			os.WriteFile(filepath.Join(root, "payload"), payload, 0644)
			sum := sha256.Sum256(payload)
			hash := fmt.Sprintf("%x", sum)
			if tt.fail == "checksum" {
				hash = strings.Repeat("0", 64)
			}
			names := []string{"linux_amd64", "linux_arm64", "darwin_amd64", "darwin_arm64"}
			var checks strings.Builder
			for _, name := range names {
				fmt.Fprintf(&checks, "%s  herdr24-installer_%s\n", hash, name)
			}
			os.WriteFile(filepath.Join(root, "SHA256SUMS"), []byte(checks.String()), 0644)
			put("uname", "#!/bin/sh\ncase \"$1\" in -s) printf '%s' \"$FAKE_OS\";; -m) printf '%s' \"$FAKE_ARCH\";; esac\n")
			put("curl", `#!/bin/sh
output=
while [ "$#" -gt 0 ]; do
 case "$1" in -o) output=$2; shift 2;; *) url=$1; shift;; esac
done
printf '%s\n' "$url" >> "$FIXTURE/urls"
case "$url" in
 */releases/latest) printf '%s' 'https://github.com/Kazte/herdr24/releases/tag/v9.8.7';;
 */SHA256SUMS) cp "$FIXTURE/SHA256SUMS" "$output";;
 *) [ "$FAIL_DOWNLOAD" != yes ] || exit 22; cp "$FIXTURE/payload" "$output";;
esac
`)
			cmd := exec.Command("sh", "install.sh", "--dir", "space separated path", "--yes")
			binaryExit := "0"
			if tt.fail == "binary" {
				binaryExit = "7"
			}
			download := "no"
			if tt.fail == "download" {
				download = "yes"
			}
			cmd.Env = append(os.Environ(), "PATH="+bin+":"+os.Getenv("PATH"), "TMPDIR="+tmp, "FIXTURE="+root, "FAKE_OS="+tt.os, "FAKE_ARCH="+tt.arch, "HERDR24_VERSION="+tt.version, "BINARY_EXIT="+binaryExit, "FAIL_DOWNLOAD="+download)
			out, err := cmd.CombinedOutput()
			code := 0
			if err != nil {
				if e, ok := err.(*exec.ExitError); ok {
					code = e.ExitCode()
				} else {
					t.Fatal(err)
				}
			}
			if code != tt.code {
				t.Fatalf("exit=%d want=%d output=%s", code, tt.code, out)
			}
			args, argsErr := os.ReadFile(filepath.Join(root, "args"))
			if tt.code == 0 || tt.code == 7 {
				if string(args) != "--dir\nspace separated path\n--yes\n" {
					t.Fatalf("argument forwarding %q", args)
				}
			} else if argsErr == nil {
				t.Fatal("executed unverified or unsupported binary")
			}
			files, _ := os.ReadDir(tmp)
			if len(files) != 0 {
				t.Fatalf("temporary files leaked: %v", files)
			}
			urls, _ := os.ReadFile(filepath.Join(root, "urls"))
			if tt.code == 0 {
				tag := "v9.8.7"
				wantResolves := 1
				if tt.version != "" {
					tag = tt.version
					wantResolves = 0
				}
				if strings.Count(string(urls), "/releases/latest") != wantResolves {
					t.Fatal("latest resolved more than once")
				}
				for _, url := range strings.Split(strings.TrimSpace(string(urls)), "\n") {
					if strings.HasSuffix(url, "/releases/latest") {
						continue
					}
					if !strings.Contains(url, "/releases/download/"+tag+"/") {
						t.Fatalf("inconsistent version URL %s", url)
					}
				}
			}
		})
	}
}
