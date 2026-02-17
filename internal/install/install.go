package install

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed all:templates
var templateFS embed.FS

// Run executes the install subcommand, copying template files and symlinking
// the ralph binary into the current working directory.
func Run() {
	fmt.Println("Installing Ralph...")
	fmt.Println()

	var created, skipped int

	// Copy embedded template files (these diverge per-project)
	err := fs.WalkDir(templateFS, "templates", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		relPath := strings.TrimPrefix(path, "templates/")

		if _, err := os.Stat(relPath); err == nil {
			fmt.Printf("  skipped: %s (already exists)\n", relPath)
			skipped++
			return nil
		}

		dir := filepath.Dir(relPath)
		if dir != "." {
			if err := os.MkdirAll(dir, 0755); err != nil {
				return fmt.Errorf("creating directory %s: %w", dir, err)
			}
		}

		data, err := templateFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading embedded %s: %w", path, err)
		}

		if err := os.WriteFile(relPath, data, 0644); err != nil {
			return fmt.Errorf("writing %s: %w", relPath, err)
		}

		fmt.Printf("  created: %s\n", relPath)
		created++
		return nil
	})

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Symlink the ralph binary (stays up-to-date when rebuilt)
	linked, err := symlinkBinary()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error symlinking binary: %v\n", err)
		os.Exit(1)
	}
	if linked {
		created++
	} else {
		skipped++
	}

	fmt.Println()
	fmt.Printf("Done: %d created, %d skipped\n", created, skipped)

	// Show usage from the installed binary so it's always current
	fmt.Println()
	dest := filepath.Join("scripts", "ralph", "ralph")
	cmd := exec.Command(dest, "--help")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()
}

// symlinkBinary creates a symlink at scripts/ralph/ralph pointing to the
// currently running executable. Returns true if a new link was created.
func symlinkBinary() (bool, error) {
	dest := filepath.Join("scripts", "ralph", "ralph")

	// If it already exists (symlink, file, whatever), skip
	if _, err := os.Lstat(dest); err == nil {
		fmt.Printf("  skipped: %s (already exists)\n", dest)
		return false, nil
	}

	exe, err := os.Executable()
	if err != nil {
		return false, fmt.Errorf("finding executable: %w", err)
	}
	// Resolve to the real binary path (not a symlink to a symlink)
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return false, fmt.Errorf("resolving symlinks: %w", err)
	}

	if err := os.MkdirAll(filepath.Join("scripts", "ralph"), 0755); err != nil {
		return false, err
	}

	if err := os.Symlink(exe, dest); err != nil {
		return false, fmt.Errorf("creating symlink: %w", err)
	}

	fmt.Printf("  symlink: %s -> %s\n", dest, exe)
	return true, nil
}
