package main

import (
	"flag"
	"fmt"
	"github.com/Kazte/herdr24"
	"github.com/Kazte/herdr24/internal/installer"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/term"
	"io"
	"os"
)

var version = "dev"

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, term.IsTerminal(os.Stdout.Fd()))) }
func run(args []string, out, errOut io.Writer, hasTTY bool) int {
	flags := flag.NewFlagSet("herdr24-installer", flag.ContinueOnError)
	flags.SetOutput(errOut)
	dir := flags.String("dir", "", "Herdr home (default HERDR_APP_HOME or ~/.config/herdr-app)")
	yes := flags.Bool("yes", false, "apply without prompting; backs up replaced files")
	dry := flags.Bool("dry-run", false, "show plan without any filesystem writes")
	showVersion := flags.Bool("version", false, "print release version")
	plain := flags.Bool("no-tui", false, "plain output (requires --yes to apply)")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(errOut, "Unexpected arguments; use --help.")
		return 2
	}
	if *showVersion {
		fmt.Fprintln(out, "herdr24-installer", version)
		return 0
	}
	dest, err := installer.Destination(*dir)
	if err != nil {
		fmt.Fprintln(errOut, err)
		return 1
	}
	plan, err := installer.BuildPlan(herdr24.Assets, dest, version)
	if err != nil {
		fmt.Fprintln(errOut, err)
		return 1
	}
	fmt.Fprintf(out, "herdr24 %s → %s\n%d new · %d update · %d unchanged\n", version, plan.Dir, plan.New, plan.Changed, plan.Unchanged)
	if plan.Modified > 0 {
		fmt.Fprintf(out, "%d locally modified bundled file(s); replacements will be backed up.\n", plan.Modified)
	}
	if *dry {
		for _, e := range plan.Entries {
			if e.Status != installer.Unchanged {
				fmt.Fprintf(out, "[%s] %s\n", e.Status, e.Path)
			}
		}
		fmt.Fprintln(out, "Dry run: no files changed.")
		return 0
	}
	if plan.New+plan.Changed == 0 {
		fmt.Fprintln(out, "Already up to date; no files changed.")
		return 0
	}
	var result installer.Result
	if *yes {
		result, err = installer.Apply(plan, func(done, total int, path string) { fmt.Fprintf(out, "[%d/%d] %s\n", done, total, path) })
	} else {
		if !hasTTY || *plain {
			fmt.Fprintln(errOut, "Confirmation requires a terminal. Use --yes to apply with backups, or --dry-run to inspect.")
			return 2
		}
		final, runErr := tea.NewProgram(installer.NewModel(plan), tea.WithOutput(out), tea.WithoutSignalHandler()).Run()
		if runErr != nil {
			fmt.Fprintln(errOut, "Cannot open interactive terminal:", runErr, "(use --yes for plain mode)")
			return 1
		}
		model := final.(installer.Model)
		if model.Canceled {
			fmt.Fprintln(out, "Canceled; no files changed.")
			return 0
		}
		result, err = model.Result, model.Err
	}
	if err != nil {
		fmt.Fprintln(errOut, "Installation failed:", err)
		if result.BackupDir != "" {
			fmt.Fprintln(errOut, "Originals backed up at", result.BackupDir)
		}
		return 1
	}
	fmt.Fprintf(out, "Done: %d file(s) written.\n", result.Written)
	if result.BackupDir != "" {
		fmt.Fprintln(out, "Backup:", result.BackupDir)
	}
	fmt.Fprintln(out, "Activate manually: herdr-app do layout.switch '{\"name\":\"herdr24\"}'")
	return 0
}
