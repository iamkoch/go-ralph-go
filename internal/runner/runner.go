package runner

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

// Options configures a subprocess run.
type Options struct {
	Tool           string
	BaseDir        string
	Team           bool
	ReviewPreamble string // prepended to stdin content if non-empty
}

// Run starts the AI tool subprocess and returns channels for streaming output.
// The lines channel receives each line of combined stdout/stderr.
// The done channel receives the final error (nil on success).
// Both channels are closed when the subprocess exits.
func Run(opts Options) (<-chan string, <-chan error) {
	lines := make(chan string, 100)
	done := make(chan error, 1)

	go func() {
		defer close(lines)

		var cmd *exec.Cmd
		var stdinFile string

		switch opts.Tool {
		case "amp":
			cmd = exec.Command("amp", "--dangerously-allow-all")
			stdinFile = filepath.Join(opts.BaseDir, "prompt.md")
		case "claude":
			cmd = exec.Command("claude", "--dangerously-skip-permissions", "--print")
			stdinFile = filepath.Join(opts.BaseDir, "CLAUDE.md")
		default:
			done <- fmt.Errorf("unknown tool: %s", opts.Tool)
			return
		}

		content, err := os.ReadFile(stdinFile)
		if err != nil {
			done <- fmt.Errorf("reading %s: %w", stdinFile, err)
			return
		}

		if opts.ReviewPreamble != "" {
			content = append([]byte(opts.ReviewPreamble+"\n\n"), content...)
		}

		if opts.Team {
			content = append(content, []byte("\n\n"+teamInstructions)...)
		}

		cmd.Stdin = bytes.NewReader(content)
		cmd.Dir = opts.BaseDir

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			done <- err
			return
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			done <- err
			return
		}

		if err := cmd.Start(); err != nil {
			done <- err
			return
		}

		var wg sync.WaitGroup
		scan := func(r io.Reader) {
			defer wg.Done()
			s := bufio.NewScanner(r)
			s.Buffer(make([]byte, 0, 64*1024), 1024*1024)
			for s.Scan() {
				lines <- s.Text()
			}
		}
		wg.Add(2)
		go scan(stdout)
		go scan(stderr)

		wg.Wait()
		done <- cmd.Wait()
	}()

	return lines, done
}

const teamInstructions = `## Team Mode

You MUST use agent teams for this iteration:
1. Use TeamCreate to create a team for the current story
2. Break the story into parallel subtasks (e.g., backend + frontend, or implementation + tests)
3. Spawn specialized teammates using the Task tool
4. Coordinate via the task list — assign work, track progress
5. Shut down the team when the story is complete

Use team members for genuinely parallel work only. Don't create a team for trivial single-file changes.`
