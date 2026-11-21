package installer

import (
	"fmt"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"strings"
	"time"
)

type progressMsg struct {
	Done, Total int
	Path        string
}
type doneMsg struct {
	Result Result
	Err    error
}
type tickMsg time.Time

// Model keeps presentation separate from filesystem operations. Cancellation is
// allowed before applying; a running transaction finishes before the UI exits.
type Model struct {
	Plan     *Plan
	Result   Result
	Err      error
	Canceled bool
	phase    string
	step     int
	progress progressMsg
	events   chan tea.Msg
}

func NewModel(p *Plan) Model {
	return Model{Plan: p, phase: "confirm", events: make(chan tea.Msg, len(p.Entries)+1)}
}
func (m Model) Init() tea.Cmd { return nil }
func tick() tea.Cmd {
	return tea.Tick(100*time.Millisecond, func(t time.Time) tea.Msg { return tickMsg(t) })
}
func (m Model) wait() tea.Msg { return <-m.events }
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if m.phase == "confirm" {
			switch msg.String() {
			case "ctrl+c", "q", "n", "esc":
				m.Canceled = true
				return m, tea.Quit
			case "enter", "y":
				m.phase = "applying"
				return m, tea.Batch(func() tea.Msg {
					defer close(m.events)
					result, err := Apply(m.Plan, func(done, total int, path string) { m.events <- progressMsg{done, total, path} })
					return doneMsg{result, err}
				}, m.wait, tick())
			}
		}
	case progressMsg:
		m.progress = msg
		return m, m.wait
	case tickMsg:
		if m.phase == "applying" {
			m.step++
			return m, tick()
		}
	case doneMsg:
		m.Result = msg.Result
		m.Err = msg.Err
		m.phase = "done"
		return m, tea.Quit
	}
	return m, nil
}
func (m Model) View() string {
	accent := lipgloss.NewStyle().Foreground(lipgloss.Color("#b589d6")).Bold(true)
	muted := lipgloss.NewStyle().Foreground(lipgloss.Color("#a6a6a6"))
	var b strings.Builder
	b.WriteString(accent.Render("┌─ herdr24 · installer / updater ─┐") + "\n\n")
	fmt.Fprintf(&b, "  Destination  %s\n  Release      %s\n", m.Plan.Dir, m.Plan.Version)
	if m.Plan.PreviousVersion != "" {
		fmt.Fprintf(&b, "  Installed    %s\n", m.Plan.PreviousVersion)
	} else {
		b.WriteString("  Installed    manual or new installation\n")
	}
	fmt.Fprintf(&b, "\n  %d new · %d update · %d unchanged\n", m.Plan.New, m.Plan.Changed, m.Plan.Unchanged)
	if m.Plan.Modified > 0 {
		fmt.Fprintf(&b, "  %d locally modified file(s) detected\n", m.Plan.Modified)
	}
	b.WriteString(muted.Render("  Existing replacements are backed up; custom files stay untouched.") + "\n\n")
	switch m.phase {
	case "confirm":
		shown := 0
		for _, e := range m.Plan.Entries {
			if e.Status != Unchanged && shown < 8 {
				fmt.Fprintf(&b, "  [%s] %s\n", e.Status, e.Path)
				shown++
			}
		}
		if remaining := m.Plan.New + m.Plan.Changed - shown; remaining > 0 {
			fmt.Fprintf(&b, "  … %d more file(s); use --dry-run for the full list\n", remaining)
		}
		b.WriteString("\n  [enter/y] install / update with backups   [q/n/esc] cancel\n")
	case "applying":
		frames := []string{"|", "/", "-", "\\"}
		fmt.Fprintf(&b, "  [%s] %d/%d %s\n", frames[m.step%4], m.progress.Done, m.Plan.New+m.Plan.Changed, m.progress.Path)
		b.WriteString("  Finishing transaction; please wait.\n")
	case "done":
		if m.Err != nil {
			fmt.Fprintf(&b, "  Failed: %v\n", m.Err)
		} else {
			fmt.Fprintf(&b, "  Updated %d file(s).\n", m.Result.Written)
		}
	}
	return b.String()
}
