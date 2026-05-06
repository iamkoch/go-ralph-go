.PHONY: build build-ts clean install-local

# Legacy Go build
build:
	@mkdir -p internal/install/templates/scripts/ralph
	@mkdir -p internal/install/templates/.claude/skills/ralph
	@mkdir -p internal/install/templates/.claude/skills/prd
	@cp CLAUDE.md prompt.md prd.json.example internal/install/templates/scripts/ralph/
	@cp skills/ralph/SKILL.md internal/install/templates/.claude/skills/ralph/
	@cp skills/prd/SKILL.md internal/install/templates/.claude/skills/prd/
	go build -o ralph ./cmd/ralph

# TypeScript build
build-ts:
	bun run build

# Build and install to ~/.local/bin
install-local: build-ts
	@mkdir -p ~/.local/bin
	cp ralph ~/.local/bin/ralph
	@echo "Installed ralph to ~/.local/bin/ralph"

clean:
	rm -f ralph
	rm -rf internal/install/templates
	rm -rf dist
