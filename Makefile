.PHONY: build clean

build:
	@mkdir -p internal/install/templates/scripts/ralph
	@mkdir -p internal/install/templates/.claude/skills/ralph
	@mkdir -p internal/install/templates/.claude/skills/prd
	@cp CLAUDE.md prompt.md prd.json.example internal/install/templates/scripts/ralph/
	@cp skills/ralph/SKILL.md internal/install/templates/.claude/skills/ralph/
	@cp skills/prd/SKILL.md internal/install/templates/.claude/skills/prd/
	go build -o ralph ./cmd/ralph

clean:
	rm -f ralph
	rm -rf internal/install/templates
