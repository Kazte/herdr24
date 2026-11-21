// Package installer plans and applies reversible updates to owned runtime files.
package installer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type Status string

const (
	New       Status = "new"
	Changed   Status = "update"
	Unchanged Status = "unchanged"
)

type Entry struct {
	Path          string
	Status        Status
	LocalModified bool
	ExistingHash  string
	Hash          string
	Data          []byte
	mode          fs.FileMode
	original      []byte
}
type Plan struct {
	Dir, Version, PreviousVersion     string
	Entries                           []Entry
	New, Changed, Unchanged, Modified int
	source                            fs.FS
}
type Manifest struct {
	Version string            `json:"version"`
	Files   map[string]string `json:"files"`
}
type Result struct {
	Written   int
	BackupDir string
}

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }

// Destination uses Herdr's native home contract on every supported platform.
func Destination(override string) (string, error) {
	dir := override
	if dir == "" {
		dir = os.Getenv("HERDR_APP_HOME")
	}
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(home, ".config", "herdr-app")
	}
	return filepath.Abs(dir)
}
func owned(name string) bool {
	if !fs.ValidPath(name) || strings.Contains(name, "\\") {
		return false
	}
	if name == "layouts/herdr24.json" {
		return true
	}
	parts := strings.Split(name, "/")
	if len(parts) == 2 && parts[0] == "themes" && strings.HasSuffix(parts[1], ".json") {
		return true
	}
	if len(parts) != 3 || parts[0] != "mods" || !(parts[1] == "herdr24" || strings.HasPrefix(parts[1], "herdr24-")) {
		return false
	}
	return parts[2] == "main.js" || parts[2] == "mod.json" || parts[2] == "ui.js"
}

// safePath refuses symlink and non-directory ancestors inside the destination.
func safePath(dir, rel string, directory bool) error {
	if !fs.ValidPath(rel) {
		return fmt.Errorf("unsafe relative path %q", rel)
	}
	segments := append([]string{""}, strings.Split(rel, "/")...)
	current := dir
	for i, segment := range segments {
		if segment != "" {
			current = filepath.Join(current, segment)
		}
		info, err := os.Lstat(current)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return fmt.Errorf("inspect %s: %w", current, err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("refusing symlink: %s", current)
		}
		isDir := i < len(segments)-1 || directory
		if isDir && !info.IsDir() {
			return fmt.Errorf("expected directory: %s", current)
		}
		if !isDir && !info.Mode().IsRegular() {
			return fmt.Errorf("expected regular file: %s", current)
		}
	}
	return nil
}
func BuildPlan(source fs.FS, dir, version string) (*Plan, error) {
	dir, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	p := &Plan{Dir: dir, Version: version, source: source}
	if err = safePath(dir, ".herdr24/manifest.json", false); err != nil {
		return nil, err
	}
	manifest := Manifest{}
	data, err := os.ReadFile(filepath.Join(dir, ".herdr24/manifest.json"))
	if err == nil {
		if err = json.Unmarshal(data, &manifest); err != nil {
			return nil, fmt.Errorf("read installer manifest: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	p.PreviousVersion = manifest.Version
	err = fs.WalkDir(source, ".", func(name string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if !owned(name) || !d.Type().IsRegular() {
			return fmt.Errorf("unowned or unsafe asset: %s", name)
		}
		if err := safePath(dir, name, false); err != nil {
			return err
		}
		data, err := fs.ReadFile(source, name)
		if err != nil {
			return err
		}
		e := Entry{Path: name, Data: data, Hash: digest(data), Status: New, mode: 0644}
		target := filepath.Join(dir, filepath.FromSlash(name))
		existing, err := os.ReadFile(target)
		if err == nil {
			info, err := os.Stat(target)
			if err != nil {
				return err
			}
			e.mode = info.Mode().Perm()
			e.original = existing
			e.ExistingHash = digest(existing)
			if e.Hash == e.ExistingHash {
				e.Status = Unchanged
				p.Unchanged++
			} else {
				e.Status = Changed
				p.Changed++
				e.LocalModified = manifest.Files[name] != "" && manifest.Files[name] != e.ExistingHash
				if e.LocalModified {
					p.Modified++
				}
			}
		} else if errors.Is(err, os.ErrNotExist) {
			p.New++
		} else {
			return err
		}
		p.Entries = append(p.Entries, e)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(p.Entries) == 0 {
		return nil, errors.New("runtime bundle is empty")
	}
	sort.Slice(p.Entries, func(i, j int) bool { return p.Entries[i].Path < p.Entries[j].Path })
	return p, nil
}
func atomicWrite(dir, rel string, data []byte, mode fs.FileMode) error {
	if err := safePath(dir, rel, false); err != nil {
		return err
	}
	file := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(file), ".herdr24-write-")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err = tmp.Chmod(mode); err == nil {
		_, err = tmp.Write(data)
	}
	if err == nil {
		err = tmp.Sync()
	}
	closeErr := tmp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	// Check again after preparing the write, before replacing the destination.
	if err = safePath(dir, rel, false); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), file)
}

// Apply rechecks the plan under a lock, backs up all replacements first, and
// rolls back runtime files if a write or final manifest persistence fails.
func Apply(p *Plan, progress func(done, total int, path string)) (result Result, returnErr error) {
	if p == nil || p.source == nil {
		return result, errors.New("missing installation plan")
	}
	if p.New+p.Changed == 0 {
		return result, nil
	}
	if err := safePath(p.Dir, ".herdr24", true); err != nil {
		return result, err
	}
	state := filepath.Join(p.Dir, ".herdr24")
	if err := os.MkdirAll(state, 0700); err != nil {
		return result, err
	}
	lock := filepath.Join(state, "install.lock")
	if err := os.Mkdir(lock, 0700); err != nil {
		return result, fmt.Errorf("installation locked (do not remove a live lock): %w", err)
	}
	defer os.Remove(lock)
	fresh, err := BuildPlan(p.source, p.Dir, p.Version)
	if err != nil {
		return result, err
	}
	if len(fresh.Entries) != len(p.Entries) {
		return result, errors.New("bundle changed; run installer again")
	}
	for i, e := range p.Entries {
		other := fresh.Entries[i]
		if e.Path != other.Path || e.ExistingHash != other.ExistingHash || e.Hash != other.Hash {
			return result, errors.New("files changed after planning; run installer again")
		}
	}
	if p.Changed > 0 {
		if err = safePath(p.Dir, ".herdr24/backups", true); err != nil {
			return result, err
		}
		backups := filepath.Join(state, "backups")
		if err = os.MkdirAll(backups, 0700); err != nil {
			return result, err
		}
		result.BackupDir, err = os.MkdirTemp(backups, "run-")
		if err != nil {
			return result, err
		}
		for _, e := range p.Entries {
			if e.Status == Changed {
				if err = atomicWrite(result.BackupDir, e.Path, e.original, e.mode); err != nil {
					return result, fmt.Errorf("backup %s: %w", e.Path, err)
				}
			}
		}
	}
	applied := []Entry{}
	rollback := func(cause error) error {
		errs := []error{cause}
		for i := len(applied) - 1; i >= 0; i-- {
			e := applied[i]
			var err error
			if e.Status == New {
				if err = safePath(p.Dir, e.Path, false); err == nil {
					err = os.Remove(filepath.Join(p.Dir, filepath.FromSlash(e.Path)))
				}
			} else {
				err = atomicWrite(p.Dir, e.Path, e.original, e.mode)
			}
			if err != nil {
				errs = append(errs, fmt.Errorf("rollback %s: %w", e.Path, err))
			}
		}
		return errors.Join(errs...)
	}
	for _, e := range p.Entries {
		if e.Status == Unchanged {
			continue
		}
		if err = atomicWrite(p.Dir, e.Path, e.Data, e.mode); err != nil {
			return result, rollback(fmt.Errorf("write %s: %w", e.Path, err))
		}
		applied = append(applied, e)
		result.Written++
		if progress != nil {
			progress(result.Written, p.New+p.Changed, e.Path)
		}
	}
	manifest := Manifest{Version: p.Version, Files: map[string]string{}}
	for _, e := range p.Entries {
		manifest.Files[e.Path] = e.Hash
	}
	encoded, _ := json.MarshalIndent(manifest, "", "  ")
	encoded = append(encoded, '\n')
	if err = atomicWrite(p.Dir, path.Join(".herdr24", "manifest.json"), encoded, 0600); err != nil {
		return result, rollback(fmt.Errorf("persist manifest: %w", err))
	}
	return result, nil
}
