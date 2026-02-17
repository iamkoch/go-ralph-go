package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/iamkoch/go-ralph-go/internal/archive"
	"github.com/iamkoch/go-ralph-go/internal/install"
	"github.com/iamkoch/go-ralph-go/internal/prd"
	"github.com/iamkoch/go-ralph-go/internal/status"
	"github.com/iamkoch/go-ralph-go/internal/tui"
)

func main() {
	// Handle install subcommand before flag parsing
	if len(os.Args) > 1 && os.Args[1] == "install" {
		install.Run()
		return
	}

	// Handle status subcommand before flag parsing
	if len(os.Args) > 1 && os.Args[1] == "status" {
		statusFlags := flag.NewFlagSet("status", flag.ExitOnError)
		reviewPasses := statusFlags.Int("review-passes", 0, "Number of review passes (default for stories without reviewPasses)")
		statusFlags.Parse(os.Args[2:])
		baseDir := resolveBaseDir()
		status.Run(baseDir, *reviewPasses)
		return
	}

	tool := flag.String("tool", "amp", "AI tool to use: amp or claude")
	team := flag.Bool("team", false, "Enable agent team mode")
	reviewPasses := flag.Int("review-passes", 0, "Number of review passes after implementation (default for stories without reviewPasses)")
	var yes bool
	flag.BoolVar(&yes, "yes", false, "Skip confirmation prompt")
	flag.BoolVar(&yes, "y", false, "Skip confirmation prompt (short)")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: ralph [--tool amp|claude] [--team] [--review-passes N] [--yes] [max_iterations]\n")
		fmt.Fprintf(os.Stderr, "       ralph install\n")
		fmt.Fprintf(os.Stderr, "       ralph status [--review-passes N]\n\n")
		fmt.Fprintf(os.Stderr, "Ralph Wiggum - Long-running AI agent loop\n\n")
		fmt.Fprintf(os.Stderr, "Subcommands:\n")
		fmt.Fprintf(os.Stderr, "  install  Install Ralph template files in the current directory\n")
		fmt.Fprintf(os.Stderr, "  status   Show PRD progress and next story\n\n")
		fmt.Fprintf(os.Stderr, "Arguments:\n")
		fmt.Fprintf(os.Stderr, "  max_iterations  Maximum number of iterations (default 10)\n\n")
		fmt.Fprintf(os.Stderr, "Flags:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nWorkflow:\n")
		fmt.Fprintf(os.Stderr, "  1. ralph install           # scaffold PRD and prompt files\n")
		fmt.Fprintf(os.Stderr, "  2. Edit prd.json           # define your user stories\n")
		fmt.Fprintf(os.Stderr, "  3. ralph status            # preview progress at any time\n")
		fmt.Fprintf(os.Stderr, "  4. ralph --tool claude 15  # run with confirmation prompt\n")
		fmt.Fprintf(os.Stderr, "  5. ralph --yes 15          # skip confirmation, go straight to TUI\n")
	}
	flag.Parse()

	if *tool != "amp" && *tool != "claude" {
		fmt.Fprintf(os.Stderr, "Error: Invalid tool '%s'. Must be 'amp' or 'claude'.\n", *tool)
		os.Exit(1)
	}

	maxIterations := 10
	if flag.NArg() > 0 {
		n, err := strconv.Atoi(flag.Arg(0))
		if err != nil || n <= 0 {
			fmt.Fprintf(os.Stderr, "Error: max_iterations must be a positive integer, got '%s'.\n", flag.Arg(0))
			os.Exit(1)
		}
		maxIterations = n
	}

	// Resolve base directory.
	// Priority: 1) directory of the binary (if it contains prompt files)
	//           2) scripts/ralph/ relative to CWD
	//           3) CWD itself
	baseDir := resolveBaseDir()

	prdFile := filepath.Join(baseDir, "prd.json")
	progressFile := filepath.Join(baseDir, "progress.txt")
	archiveDir := filepath.Join(baseDir, "archive")
	lastBranchFile := filepath.Join(baseDir, ".last-branch")

	// Archive previous run if branch changed
	archive.Run(prdFile, lastBranchFile, progressFile, archiveDir)

	// Track current branch
	if branch := archive.ReadBranch(prdFile); branch != "" {
		os.WriteFile(lastBranchFile, []byte(branch), 0644)
	}

	// Initialize progress file if it doesn't exist
	if _, err := os.Stat(progressFile); os.IsNotExist(err) {
		archive.InitProgress(progressFile)
	}

	// Pre-run confirmation
	if !yes {
		p, err := prd.Read(prdFile)
		if err == nil {
			if p.AllComplete(*reviewPasses) {
				fmt.Print(status.Render(p, *reviewPasses))
				fmt.Println("\nAll stories are complete!")
				return
			}
			if !status.Confirm(p, *reviewPasses, *tool, maxIterations) {
				return
			}
		}
	}

	// Launch the TUI
	m := tui.NewModel(*tool, baseDir, maxIterations, *team, *reviewPasses)
	p := tea.NewProgram(m)
	finalModel, err := p.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Exit with appropriate code
	if fm, ok := finalModel.(tui.Model); ok {
		if fm.State() == tui.StateComplete {
			os.Exit(0)
		}
	}
	os.Exit(1)
}

// resolveBaseDir finds the ralph working directory containing prompt files.
func resolveBaseDir() string {
	// 1) Try directory of the binary (original behavior, works when binary is in scripts/ralph/)
	if exe, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			dir := filepath.Dir(resolved)
			if hasPromptFiles(dir) {
				return dir
			}
		}
	}

	// 2) Try scripts/ralph/ relative to CWD
	if cwd, err := os.Getwd(); err == nil {
		candidate := filepath.Join(cwd, "scripts", "ralph")
		if hasPromptFiles(candidate) {
			return candidate
		}

		// 3) Fall back to CWD itself
		return cwd
	}

	// Last resort
	return "."
}

func hasPromptFiles(dir string) bool {
	// Check for either CLAUDE.md or prompt.md (the prompt templates)
	for _, name := range []string{"CLAUDE.md", "prompt.md"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
			return true
		}
	}
	return false
}
