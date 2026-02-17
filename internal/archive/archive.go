package archive

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/iamkoch/go-ralph-go/internal/prd"
)

// Run archives the previous run's prd.json and progress.txt if the PRD branch
// has changed since the last run.
func Run(prdFile, lastBranchFile, progressFile, archiveDir string) {
	if _, err := os.Stat(prdFile); err != nil {
		return
	}
	if _, err := os.Stat(lastBranchFile); err != nil {
		return
	}

	currentBranch := ReadBranch(prdFile)
	lastBranchBytes, err := os.ReadFile(lastBranchFile)
	if err != nil {
		return
	}
	lastBranch := strings.TrimSpace(string(lastBranchBytes))

	if currentBranch == "" || lastBranch == "" || currentBranch == lastBranch {
		return
	}

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

	InitProgress(progressFile)
}

// ReadBranch reads the branchName field from prd.json.
func ReadBranch(prdFile string) string {
	p, err := prd.Read(prdFile)
	if err != nil {
		return ""
	}
	return p.BranchName
}

// InitProgress creates or resets a progress file with a header.
func InitProgress(path string) {
	content := fmt.Sprintf("# Ralph Progress Log\nStarted: %s\n---\n", time.Now().Format(time.UnixDate))
	os.WriteFile(path, []byte(content), 0644)
}

func copyFile(src, dst string) {
	data, err := os.ReadFile(src)
	if err != nil {
		return
	}
	os.WriteFile(dst, data, 0644)
}
