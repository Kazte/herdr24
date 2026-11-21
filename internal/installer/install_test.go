package installer

import (
	"bytes"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func bundle() fstest.MapFS {
	return fstest.MapFS{
		"layouts/herdr24.json":     {Data: []byte(`{"theme":"herdr24-dark"}`)},
		"themes/herdr24-dark.json": {Data: []byte("original")},
		"mods/herdr24/main.js":     {Data: []byte("export default {}")},
	}
}
func mustPlan(t *testing.T, data fs.FS, dir string) *Plan {
	t.Helper()
	p, err := BuildPlan(data, dir, "v1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func write(t *testing.T, dir, path, content string) {
	t.Helper()
	file := filepath.Join(dir, filepath.FromSlash(path))
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(content), 0640); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(file, 0640); err != nil {
		t.Fatal(err)
	}
}
func TestInstallUpdateAndNoop(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "app")
	p := mustPlan(t, bundle(), dir)
	if p.New != 3 || p.Changed != 0 {
		t.Fatalf("bad plan: %+v", p)
	}
	var progress []string
	r, err := Apply(p, func(_, _ int, path string) { progress = append(progress, path) })
	if err != nil {
		t.Fatal(err)
	}
	if r.Written != 3 || len(progress) != 3 {
		t.Fatalf("bad result: %+v %v", r, progress)
	}
	file := filepath.Join(dir, "themes/herdr24-dark.json")
	before, _ := os.Stat(file)
	manifestBefore, _ := os.ReadFile(filepath.Join(dir, ".herdr24/manifest.json"))
	p = mustPlan(t, bundle(), dir)
	if p.Unchanged != 3 || p.PreviousVersion != "v1.0.0" {
		t.Fatalf("noop: %+v", p)
	}
	r, err = Apply(p, nil)
	if err != nil || r.Written != 0 {
		t.Fatalf("noop: %+v %v", r, err)
	}
	after, _ := os.Stat(file)
	if !before.ModTime().Equal(after.ModTime()) {
		t.Fatal("noop rewrote file")
	}
	manifestAfter, _ := os.ReadFile(filepath.Join(dir, ".herdr24/manifest.json"))
	if !bytes.Equal(manifestBefore, manifestAfter) {
		t.Fatal("noop rewrote manifest")
	}
	write(t, dir, "themes/custom.json", "user custom")
	write(t, dir, "themes/herdr24-dark.json", "user edits")
	p = mustPlan(t, bundle(), dir)
	if p.Changed != 1 || p.Modified != 1 {
		t.Fatalf("changed %+v", p)
	}
	r, err = Apply(p, nil)
	if err != nil {
		t.Fatal(err)
	}
	backup, err := os.ReadFile(filepath.Join(r.BackupDir, "themes/herdr24-dark.json"))
	if err != nil || string(backup) != "user edits" {
		t.Fatalf("backup: %q %v", backup, err)
	}
	info, _ := os.Stat(filepath.Join(r.BackupDir, "themes/herdr24-dark.json"))
	if info.Mode().Perm() != 0640 {
		t.Fatal("backup mode not preserved")
	}
	custom, _ := os.ReadFile(filepath.Join(dir, "themes/custom.json"))
	if string(custom) != "user custom" {
		t.Fatal("custom file changed")
	}
	added := bundle()
	added["themes/new.json"] = &fstest.MapFile{Data: []byte("new")}
	p = mustPlan(t, added, dir)
	if p.New != 1 || p.Unchanged != 3 {
		t.Fatalf("added theme: %+v", p)
	}
}
func TestManualInstallBackup(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "themes/herdr24-dark.json", "manual")
	p := mustPlan(t, bundle(), dir)
	if p.Changed != 1 {
		t.Fatal(p)
	}
	r, err := Apply(p, nil)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(r.BackupDir, "themes/herdr24-dark.json"))
	if string(b) != "manual" {
		t.Fatal("manual original not backed up")
	}
}
func TestPlanningDoesNotWrite(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "absent")
	mustPlan(t, bundle(), dir)
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatal("planning wrote destination")
	}
}
func TestUnsafeDestinations(t *testing.T) {
	for _, scenario := range []string{"file-symlink", "parent-symlink", "target-dir", "state-symlink", "manifest-symlink", "root-symlink", "root-file"} {
		t.Run(scenario, func(t *testing.T) {
			base := t.TempDir()
			dir := filepath.Join(base, "app")
			outside := filepath.Join(base, "outside")
			os.MkdirAll(dir, 0755)
			os.MkdirAll(outside, 0755)
			switch scenario {
			case "file-symlink":
				os.MkdirAll(filepath.Join(dir, "themes"), 0755)
				os.Symlink(filepath.Join(outside, "victim"), filepath.Join(dir, "themes/herdr24-dark.json"))
			case "parent-symlink":
				os.Symlink(outside, filepath.Join(dir, "themes"))
			case "target-dir":
				os.MkdirAll(filepath.Join(dir, "themes/herdr24-dark.json"), 0755)
			case "state-symlink":
				os.Symlink(outside, filepath.Join(dir, ".herdr24"))
			case "manifest-symlink":
				os.MkdirAll(filepath.Join(dir, ".herdr24"), 0755)
				os.Symlink(filepath.Join(outside, "victim"), filepath.Join(dir, ".herdr24/manifest.json"))
			case "root-symlink":
				os.Remove(dir)
				os.Symlink(outside, dir)
			case "root-file":
				os.Remove(dir)
				os.WriteFile(dir, []byte("file"), 0644)
			}
			if _, err := BuildPlan(bundle(), dir, "v1"); err == nil {
				t.Fatal("accepted unsafe destination")
			}
		})
	}
}
func TestRejectUnsafeAssetPath(t *testing.T) {
	for _, p := range []string{"../escape", ".herdr24/manifest.json", "keys.json", "mods/other/main.js"} {
		t.Run(p, func(t *testing.T) {
			_, err := BuildPlan(fstest.MapFS{p: {Data: []byte("unsafe")}}, t.TempDir(), "v1")
			if err == nil {
				t.Fatal("accepted unowned path")
			}
		})
	}
}
func TestApplyRejectsDriftAndLock(t *testing.T) {
	for _, scenario := range []string{"drift", "lock"} {
		t.Run(scenario, func(t *testing.T) {
			dir := t.TempDir()
			p := mustPlan(t, bundle(), dir)
			if scenario == "drift" {
				write(t, dir, "themes/herdr24-dark.json", "concurrent edit")
			} else {
				os.MkdirAll(filepath.Join(dir, ".herdr24/install.lock"), 0700)
			}
			if _, err := Apply(p, nil); err == nil {
				t.Fatal("apply should refuse")
			}
			if _, err := os.Stat(filepath.Join(dir, "layouts/herdr24.json")); !os.IsNotExist(err) {
				t.Fatal("apply wrote after refusal")
			}
		})
	}
}
func TestManifestFailureRollsBack(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "themes/herdr24-dark.json", "old")
	p := mustPlan(t, bundle(), dir)
	_, err := Apply(p, func(i, total int, _ string) {
		if i == total {
			os.Mkdir(filepath.Join(dir, ".herdr24/manifest.json"), 0700)
		}
	})
	if err == nil {
		t.Fatal("expected manifest failure")
	}
	b, _ := os.ReadFile(filepath.Join(dir, "themes/herdr24-dark.json"))
	if string(b) != "old" {
		t.Fatalf("original not restored: %q", b)
	}
	if _, e := os.Stat(filepath.Join(dir, "layouts/herdr24.json")); !os.IsNotExist(e) {
		t.Fatal("new file not rolled back")
	}
}
func TestChangedFileModeAndManifest(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "themes/herdr24-dark.json", "old")
	p := mustPlan(t, bundle(), dir)
	_, err := Apply(p, nil)
	if err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(filepath.Join(dir, "themes/herdr24-dark.json"))
	if info.Mode().Perm() != 0640 {
		t.Fatal("changed file mode changed")
	}
	data, _ := os.ReadFile(filepath.Join(dir, ".herdr24/manifest.json"))
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	if len(m.Files) != 3 || m.Version != "v1.0.0" {
		t.Fatalf("manifest %+v", m)
	}
}
func TestDefaultDestination(t *testing.T) {
	t.Setenv("HERDR_APP_HOME", "relative-app")
	dir, err := Destination("")
	if err != nil || !strings.HasSuffix(dir, "relative-app") {
		t.Fatalf("%s %v", dir, err)
	}
	override := t.TempDir()
	dir, err = Destination(override)
	if err != nil || dir != override {
		t.Fatal("override ignored")
	}
	t.Setenv("HERDR_APP_HOME", "")
	home := t.TempDir()
	t.Setenv("HOME", home)
	dir, err = Destination("")
	if err != nil || dir != filepath.Join(home, ".config/herdr-app") {
		t.Fatalf("native default: %s %v", dir, err)
	}
}
func TestNoopKeepsOldModificationTime(t *testing.T) {
	dir := t.TempDir()
	p := mustPlan(t, bundle(), dir)
	Apply(p, nil)
	f := filepath.Join(dir, "mods/herdr24/main.js")
	old := time.Unix(100000, 0)
	os.Chtimes(f, old, old)
	p = mustPlan(t, bundle(), dir)
	Apply(p, nil)
	info, _ := os.Stat(f)
	if !info.ModTime().Equal(old) {
		t.Fatal("no-op changed timestamp")
	}
}

func TestWriteFailureRollsBackAndLeavesOldManifest(t *testing.T) {
	dir := t.TempDir()
	initial := mustPlan(t, bundle(), dir)
	if _, err := Apply(initial, nil); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(filepath.Join(dir, ".herdr24/manifest.json"))
	updated := bundle()
	updated["layouts/herdr24.json"] = &fstest.MapFile{Data: []byte("updated layout")}
	updated["themes/herdr24-dark.json"] = &fstest.MapFile{Data: []byte("updated palette")}
	p := mustPlan(t, updated, dir)
	_, err := Apply(p, func(done, _ int, _ string) {
		if done == 1 {
			if e := os.Chmod(filepath.Join(dir, "themes"), 0500); e != nil {
				t.Fatal(e)
			}
		}
	})
	os.Chmod(filepath.Join(dir, "themes"), 0755)
	if err == nil {
		t.Fatal("expected permission error")
	}
	original, _ := os.ReadFile(filepath.Join(dir, "layouts/herdr24.json"))
	if string(original) != string(bundle()["layouts/herdr24.json"].Data) {
		t.Fatal("already applied layout was not restored")
	}
	after, _ := os.ReadFile(filepath.Join(dir, ".herdr24/manifest.json"))
	if !bytes.Equal(before, after) {
		t.Fatal("failed update changed successful manifest")
	}
}
func TestBackupSymlinkRejected(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "themes/herdr24-dark.json", "old")
	os.MkdirAll(filepath.Join(dir, ".herdr24"), 0700)
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(dir, ".herdr24/backups")); err != nil {
		t.Fatal(err)
	}
	p := mustPlan(t, bundle(), dir)
	if _, err := Apply(p, nil); err == nil {
		t.Fatal("accepted backup symlink")
	}
	data, _ := os.ReadFile(filepath.Join(dir, "themes/herdr24-dark.json"))
	if string(data) != "old" {
		t.Fatal("modified file before safe backup")
	}
}
