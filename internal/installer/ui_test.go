package installer

import (
	"errors"
	tea "github.com/charmbracelet/bubbletea"
	"strings"
	"testing"
)

func TestModelConfirmationAndCancellation(t *testing.T) {
	for _, key := range []string{"q", "n", "esc"} {
		t.Run(key, func(t *testing.T) {
			m := NewModel(mustPlan(t, bundle(), t.TempDir()))
			next, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(key)})
			got := next.(Model)
			if !got.Canceled {
				t.Fatal("cancel not recorded")
			}
			if got.phase != "confirm" {
				t.Fatal("started install on cancel")
			}
		})
	}
	m := NewModel(mustPlan(t, bundle(), t.TempDir()))
	if !strings.Contains(m.View(), "3 new") {
		t.Fatal(m.View())
	}
	next, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(Model)
	if cmd == nil || m.phase != "applying" {
		t.Fatal("confirmation did not start")
	}
	next, _ = m.Update(tea.KeyMsg{Type: tea.KeyCtrlC})
	if next.(Model).Canceled {
		t.Fatal("quit while atomic transaction running")
	}
	next, _ = m.Update(progressMsg{Done: 1, Total: 3, Path: "themes/test.json"})
	if !strings.Contains(next.(Model).View(), "1/3") {
		t.Fatal("no progress")
	}
	boom := errors.New("write denied")
	next, _ = m.Update(doneMsg{Err: boom})
	if !errors.Is(next.(Model).Err, boom) {
		t.Fatal("lost apply error")
	}
}

func TestPlanPreviewFitsSmallTerminal(t *testing.T) {
	p := mustPlan(t, bundle(), t.TempDir())
	for i := 0; i < 20; i++ {
		p.Entries = append(p.Entries, Entry{Path: "themes/extra.json", Status: New})
	}
	p.New = len(p.Entries)
	m := NewModel(p)
	if strings.Count(m.View(), "[new]") > 8 {
		t.Fatal("unbounded preview hides the destination and confirmation in small terminals")
	}
	if !strings.Contains(m.View(), "more file(s)") {
		t.Fatal("hidden files must be counted")
	}
}
