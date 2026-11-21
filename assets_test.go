package herdr24

import (
	"io/fs"
	"strings"
	"testing"
)

func TestRuntimeAssets(t *testing.T) {
	files, err := fs.Glob(Assets, "themes/*.json")
	if err != nil || len(files) != 5 {
		t.Fatalf("five themes: %v %v", files, err)
	}
	count := 0
	err = fs.WalkDir(Assets, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		count++
		if strings.HasSuffix(path, ".d.ts") || strings.HasSuffix(path, "jsconfig.json") {
			t.Errorf("editor file embedded: %s", path)
		}
		return nil
	})
	if err != nil || count != 24 {
		t.Fatalf("runtime file count=%d err=%v", count, err)
	}
}
