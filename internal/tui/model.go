package tui

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/iamkoch/go-ralph-go/internal/prd"
	"github.com/iamkoch/go-ralph-go/internal/runner"
)

const (
	maxDisplayLines    = 15
	wordRotateInterval = 30 // spinner ticks (~3 seconds)
)

// State represents the TUI state machine.
type State int

const (
	StateStarting State = iota
	StateRunning
	StateComplete
	StateFailed
)

// Messages

type toolOutputMsg string

type toolDoneMsg struct {
	err error
}

type iterationStartedMsg struct {
	lines      <-chan string
	done       <-chan error
	reviewMode bool
	reviewInfo string
	storyID    string
	storyTitle string
}

type allCompleteMsg struct{}

// Model is the bubbletea model for the Ralph TUI.
type Model struct {
	spinner   spinner.Model
	words     []string
	wordIdx   int
	tickCount int

	state         State
	iteration     int
	maxIter       int
	tool          string
	baseDir       string
	team          bool
	reviewDefault int

	reviewMode bool
	reviewInfo string
	storyID    string
	storyTitle string

	lastLines []string
	allOutput []string

	lines <-chan string
	done  <-chan error

	err error
}

// Styles
var (
	headerStyle  = lipgloss.NewStyle().Bold(true)
	dimStyle     = lipgloss.NewStyle().Faint(true)
	successStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("10"))
	failStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("9"))
)

// NewModel creates a new TUI model.
func NewModel(tool, baseDir string, maxIter int, team bool, reviewDefault int) Model {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	return Model{
		spinner:       s,
		words:         ImplementationWords,
		state:         StateStarting,
		iteration:     1,
		maxIter:       maxIter,
		tool:          tool,
		baseDir:       baseDir,
		team:          team,
		reviewDefault: reviewDefault,
	}
}

// State returns the current state of the TUI model.
func (m Model) State() State { return m.state }

func (m Model) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, m.startIteration())
}

func (m Model) startIteration() tea.Cmd {
	// Capture values for the closure
	tool := m.tool
	baseDir := m.baseDir
	team := m.team
	reviewDefault := m.reviewDefault
	iteration := m.iteration
	maxIter := m.maxIter

	return func() tea.Msg {
		if iteration > maxIter {
			return toolDoneMsg{err: fmt.Errorf("reached max iterations (%d)", maxIter)}
		}

		// Read PRD to determine what to do
		p, _ := prd.Read(filepath.Join(baseDir, "prd.json"))

		if p != nil && p.AllComplete(reviewDefault) {
			return allCompleteMsg{}
		}

		var opts runner.Options
		opts.Tool = tool
		opts.BaseDir = baseDir
		opts.Team = team

		var reviewMode bool
		var reviewInfo string
		var storyID, storyTitle string

		if p != nil {
			story := p.NextIncompleteStory()
			if story == nil {
				// No incomplete stories; check for reviews
				story = p.NextReviewStory(reviewDefault)
				if story != nil {
					eff := story.EffectiveReviewPasses(reviewDefault)
					reviewMode = true
					reviewInfo = fmt.Sprintf("Review %d/%d for %s", story.ReviewsCompleted+1, eff, story.ID)
					opts.ReviewPreamble = buildReviewPreamble(story, eff)
				}
			}
			if story != nil {
				storyID = story.ID
				storyTitle = story.Title
			}
		}

		lines, done := runner.Run(opts)

		return iterationStartedMsg{
			lines:      lines,
			done:       done,
			reviewMode: reviewMode,
			reviewInfo: reviewInfo,
			storyID:    storyID,
			storyTitle: storyTitle,
		}
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func buildReviewPreamble(story *prd.Story, totalPasses int) string {
	return fmt.Sprintf(`## REVIEW MODE — Story %s: %s

This is review pass %d of %d. The story has already been implemented.

Your task:
1. Read the code changes for this story (check recent git commits)
2. Assess: code quality, edge cases, error handling, test coverage
3. Check that acceptance criteria are truly met
4. Fix any issues you find — commit fixes with message: review: [%s] - [description]
5. Update prd.json: increment reviewsCompleted for this story
6. If this is the final review pass and everything looks good, output <promise>REVIEW_COMPLETE</promise>`,
		story.ID, story.Title,
		story.ReviewsCompleted+1, totalPasses,
		story.ID,
	)
}

func waitForLine(lines <-chan string) tea.Cmd {
	return func() tea.Msg {
		line, ok := <-lines
		if !ok {
			return nil
		}
		return toolOutputMsg(line)
	}
}

func waitForDone(done <-chan error) tea.Cmd {
	return func() tea.Msg {
		err := <-done
		return toolDoneMsg{err: err}
	}
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			return m, tea.Quit
		}

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		m.tickCount++
		if m.tickCount >= wordRotateInterval {
			m.tickCount = 0
			m.wordIdx = (m.wordIdx + 1) % len(m.words)
		}
		return m, cmd

	case iterationStartedMsg:
		m.lines = msg.lines
		m.done = msg.done
		m.reviewMode = msg.reviewMode
		m.reviewInfo = msg.reviewInfo
		m.storyID = msg.storyID
		m.storyTitle = msg.storyTitle
		m.state = StateRunning
		m.allOutput = nil
		m.lastLines = nil
		m.wordIdx = 0
		m.tickCount = 0
		if m.reviewMode {
			m.words = ReviewWords
		} else {
			m.words = ImplementationWords
		}
		return m, tea.Batch(waitForLine(m.lines), waitForDone(m.done))

	case toolOutputMsg:
		line := string(msg)
		m.allOutput = append(m.allOutput, line)
		m.lastLines = append(m.lastLines, line)
		if len(m.lastLines) > maxDisplayLines {
			m.lastLines = m.lastLines[len(m.lastLines)-maxDisplayLines:]
		}
		return m, waitForLine(m.lines)

	case toolDoneMsg:
		output := strings.Join(m.allOutput, "\n")

		if strings.Contains(output, "<promise>COMPLETE</promise>") {
			// Verify all reviews are also done
			p, _ := prd.Read(filepath.Join(m.baseDir, "prd.json"))
			if p == nil || p.AllComplete(m.reviewDefault) {
				m.state = StateComplete
				return m, tea.Quit
			}
			// Reviews still needed, continue
		}

		if m.iteration >= m.maxIter {
			m.state = StateFailed
			m.err = fmt.Errorf("reached max iterations (%d)", m.maxIter)
			return m, tea.Quit
		}

		m.iteration++
		return m, m.startIteration()

	case allCompleteMsg:
		m.state = StateComplete
		return m, tea.Quit
	}

	return m, nil
}

func (m Model) View() string {
	switch m.state {
	case StateComplete:
		return successStyle.Render("Ralph completed all tasks!") + "\n"
	case StateFailed:
		msg := fmt.Sprintf("Ralph reached max iterations (%d) without completing all tasks.", m.maxIter)
		if m.err != nil {
			msg = fmt.Sprintf("Ralph failed: %v", m.err)
		}
		return failStyle.Render(msg) + "\n"
	}

	// Header
	word := m.words[m.wordIdx%len(m.words)]
	var header string
	if m.reviewMode {
		header = fmt.Sprintf("%s %s: %s (%s) — %s", m.spinner.View(), m.reviewInfo, truncate(m.storyTitle, 40), m.tool, word)
	} else {
		storyCtx := ""
		if m.storyID != "" {
			storyCtx = fmt.Sprintf(" — %s: %s", m.storyID, truncate(m.storyTitle, 40))
		}
		header = fmt.Sprintf("%s Ralph — Iteration %d/%d%s (%s) — %s", m.spinner.View(), m.iteration, m.maxIter, storyCtx, m.tool, word)
	}

	var b strings.Builder
	b.WriteString(headerStyle.Render(header))
	b.WriteString("\n")

	if len(m.lastLines) > 0 {
		b.WriteString("\n")
		b.WriteString(dimStyle.Render(strings.Join(m.lastLines, "\n")))
		b.WriteString("\n")
	}

	return b.String()
}
