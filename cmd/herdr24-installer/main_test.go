package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommandModes(t *testing.T) {
	for _, tt := range []struct {
		name   string
		args   []string
		want   int
		exists bool
	}{{"dry-run", []string{"--dry-run"}, 0, false}, {"headless requires consent", nil, 2, false}, {"yes", []string{"--yes"}, 0, true}, {"unknown flag", []string{"--wat"}, 2, false}, {"version", []string{"--version"}, 0, false}} {
		t.Run(tt.name, func(t *testing.T) {
			dir := filepath.Join(t.TempDir(), "app")
			args := append([]string{"--dir", dir}, tt.args...)
			var out bytes.Buffer
			code := run(args, &out, &out, false)
			if code != tt.want {
				t.Fatalf("exit %d want %d: %s", code, tt.want, &out)
			}
			_, err := os.Stat(filepath.Join(dir, "layouts/herdr24.json"))
			if (err == nil) != tt.exists {
				t.Fatalf("unexpected writes %v", err)
			}
			if tt.name == "dry-run" && !strings.Contains(out.String(), "24 new") {
				t.Fatal(out.String())
			}
		})
	}
}
func TestHeadlessNoopNeedsNoConsent(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "app")
	var out bytes.Buffer
	if run([]string{"--dir", dir, "--yes"}, &out, &out, false) != 0 {
		t.Fatal(out.String())
	}
	out.Reset()
	if run([]string{"--dir", dir}, &out, &out, false) != 0 {
		t.Fatal(out.String())
	}
	if !strings.Contains(out.String(), "Already up to date") {
		t.Fatal(out.String())
	}
}
func TestRejectUnexpectedArguments(t *testing.T) {
	var out bytes.Buffer
	if code := run([]string{"extra"}, &out, &out, false); code != 2 {
		t.Fatalf("exit %d: %s", code, &out)
	}
}
