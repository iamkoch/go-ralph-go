package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func main() {
	tool := flag.String("tool", "amp", "AI tool to use: amp or claude")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: ralph [--tool amp|claude] [max_iterations]\n\n")
		fmt.Fprintf(os.Stderr, "Ralph Wiggum - Long-running AI agent loop\n\n")
		fmt.Fprintf(os.Stderr, "Arguments:\n")
		fmt.Fprintf(os.Stderr, "  max_iterations  Maximum number of iterations (default 10)\n\n")
		fmt.Fprintf(os.Stderr, "Flags:\n")
		flag.PrintDefaults()
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

	// Resolve base directory (where the binary lives, following symlinks)
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving executable path: %v\n", err)
		os.Exit(1)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving symlinks: %v\n", err)
		os.Exit(1)
	}
	baseDir := filepath.Dir(exe)

	prdFile := filepath.Join(baseDir, "prd.json")
	progressFile := filepath.Join(baseDir, "progress.txt")
	archiveDir := filepath.Join(baseDir, "archive")
	lastBranchFile := filepath.Join(baseDir, ".last-branch")

	// Archive previous run if branch changed
	archivePreviousRun(prdFile, lastBranchFile, progressFile, archiveDir)

	// Track current branch
	if branch := readBranchFromPRD(prdFile); branch != "" {
		os.WriteFile(lastBranchFile, []byte(branch), 0644)
	}

	// Initialize progress file if it doesn't exist
	if _, err := os.Stat(progressFile); os.IsNotExist(err) {
		initProgressFile(progressFile)
	}

	fmt.Printf("Starting Ralph - Tool: %s - Max iterations: %d\n", *tool, maxIterations)

	for i := 1; i <= maxIterations; i++ {
		fmt.Println()
		fmt.Println("===============================================================")
		fmt.Printf("  Ralph Iteration %d of %d (%s)\n", i, maxIterations, *tool)
		fmt.Println("===============================================================")

		output := runTool(*tool, baseDir)

		if strings.Contains(output, "<promise>COMPLETE</promise>") {
			fmt.Println()
			fmt.Println("Ralph completed all tasks!")
			fmt.Printf("Completed at iteration %d of %d\n", i, maxIterations)
			os.Exit(0)
		}

		fmt.Printf("Iteration %d complete. Continuing...\n", i)
		if i < maxIterations {
			time.Sleep(2 * time.Second)
		}
	}

	fmt.Println()
	fmt.Printf("Ralph reached max iterations (%d) without completing all tasks.\n", maxIterations)
	fmt.Printf("Check %s for status.\n", progressFile)
	os.Exit(1)
}

// readBranchFromPRD reads the branchName field from prd.json.
func readBranchFromPRD(prdFile string) string {
	data, err := os.ReadFile(prdFile)
	if err != nil {
		return ""
	}
	var prd struct {
		BranchName string `json:"branchName"`
	}
	if err := json.Unmarshal(data, &prd); err != nil {
		return ""
	}
	return prd.BranchName
}

// archivePreviousRun archives progress if the PRD branch has changed since last run.
func archivePreviousRun(prdFile, lastBranchFile, progressFile, archiveDir string) {
	if _, err := os.Stat(prdFile); err != nil {
		return
	}
	if _, err := os.Stat(lastBranchFile); err != nil {
		return
	}

	currentBranch := readBranchFromPRD(prdFile)
	lastBranchBytes, err := os.ReadFile(lastBranchFile)
	if err != nil {
		return
	}
	lastBranch := strings.TrimSpace(string(lastBranchBytes))

	if currentBranch == "" || lastBranch == "" || currentBranch == lastBranch {
		return
	}

	// Archive the previous run
	date := time.Now().Format("2006-01-02")
	folderName := strings.TrimPrefix(lastBranch, "ralph/")
	archiveFolder := filepath.Join(archiveDir, date+"-"+folderName)

	fmt.Printf("Archiving previous run: %s\n", lastBranch)
	if err := os.MkdirAll(archiveFolder, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating archive directory: %v\n", err)
		return
	}

	copyFile(prdFile, filepath.Join(archiveFolder, "prd.json"))
	copyFile(progressFile, filepath.Join(archiveFolder, "progress.txt"))
	fmt.Printf("   Archived to: %s\n", archiveFolder)

	// Reset progress file for new run
	initProgressFile(progressFile)
}

// initProgressFile creates/resets a progress file with a header.
func initProgressFile(path string) {
	content := fmt.Sprintf("# Ralph Progress Log\nStarted: %s\n---\n", time.Now().Format(time.UnixDate))
	os.WriteFile(path, []byte(content), 0644)
}

// copyFile copies src to dst. Errors are silently ignored (matching bash behavior).
func copyFile(src, dst string) {
	data, err := os.ReadFile(src)
	if err != nil {
		return
	}
	os.WriteFile(dst, data, 0644)
}

// runTool executes the AI tool and returns its captured output.
// Output is streamed to stderr in real-time.
func runTool(tool, baseDir string) string {
	var cmd *exec.Cmd
	var stdinFile string

	switch tool {
	case "amp":
		cmd = exec.Command("amp", "--dangerously-allow-all")
		stdinFile = filepath.Join(baseDir, "prompt.md")
	case "claude":
		cmd = exec.Command("claude", "--dangerously-skip-permissions", "--print")
		stdinFile = filepath.Join(baseDir, "CLAUDE.md")
	}

	f, err := os.Open(stdinFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error opening %s: %v\n", stdinFile, err)
		return ""
	}
	defer f.Close()

	cmd.Stdin = f
	cmd.Dir = baseDir

	var buf bytes.Buffer
	cmd.Stdout = io.MultiWriter(os.Stderr, &buf)
	cmd.Stderr = io.MultiWriter(os.Stderr, &buf)

	_ = cmd.Run() // Ignore exit code (matches || true in bash)

	return buf.String()
}
