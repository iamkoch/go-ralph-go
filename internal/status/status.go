package status

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/mattn/go-isatty"

	"github.com/iamkoch/go-ralph-go/internal/prd"
)

var (
	titleStyle    = lipgloss.NewStyle().Bold(true)
	subtitleStyle = lipgloss.NewStyle().Faint(true)
	passStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	failStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("9"))
	dimStyle      = lipgloss.NewStyle().Faint(true)
)

// Render returns a styled status string for the given PRD.
func Render(p *prd.PRD, reviewDefault int) string {
	var b strings.Builder

	b.WriteString(titleStyle.Render(p.Project))
	b.WriteString("\n")
	b.WriteString(subtitleStyle.Render(fmt.Sprintf("%s — %d stories", p.BranchName, len(p.UserStories))))
	b.WriteString("\n\n")

	maxIDLen := 0
	maxTitleLen := 0
	for _, s := range p.UserStories {
		if len(s.ID) > maxIDLen {
			maxIDLen = len(s.ID)
		}
		if len(s.Title) > maxTitleLen {
			maxTitleLen = len(s.Title)
		}
	}

	completed := 0
	for _, s := range p.UserStories {
		var icon string
		if s.Passes {
			icon = passStyle.Render("✓")
			completed++
		} else {
			icon = failStyle.Render("✗")
		}

		id := fmt.Sprintf("%-*s", maxIDLen, s.ID)
		title := fmt.Sprintf("%-*s", maxTitleLen, s.Title)
		priority := dimStyle.Render(fmt.Sprintf("P%d", s.Priority))

		b.WriteString(fmt.Sprintf("  %s  %s  %s  %s\n", icon, id, title, priority))
	}

	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("Progress: %d/%d complete\n", completed, len(p.UserStories)))

	next := p.NextIncompleteStory()
	if next == nil {
		next = p.NextReviewStory(reviewDefault)
	}
	if next != nil {
		if next.Passes {
			eff := next.EffectiveReviewPasses(reviewDefault)
			b.WriteString(fmt.Sprintf("Next: %s — %s (review %d/%d)\n", next.ID, next.Title, next.ReviewsCompleted+1, eff))
		} else {
			b.WriteString(fmt.Sprintf("Next: %s — %s\n", next.ID, next.Title))
		}
	}

	return b.String()
}

// Run reads the PRD and prints the status to stdout.
func Run(baseDir string, reviewDefault int) {
	p, err := prd.Read(filepath.Join(baseDir, "prd.json"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading prd.json: %v\n", err)
		os.Exit(1)
	}
	fmt.Print(Render(p, reviewDefault))
}

// Confirm shows the status and run config, then asks the user to proceed.
// Returns true if the user confirms.
func Confirm(p *prd.PRD, reviewDefault int, tool string, maxIter int) bool {
	fmt.Print(Render(p, reviewDefault))
	fmt.Println()
	fmt.Printf("Tool: %s | Max iterations: %d\n\n", tool, maxIter)

	if !isatty.IsTerminal(os.Stdin.Fd()) {
		return true
	}

	fmt.Print("Press Enter to start, or q + Enter to quit: ")
	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	line = strings.TrimSpace(line)
	return line != "q" && line != "Q"
}
