package prd

import (
	"encoding/json"
	"os"
)

// Story represents a single user story in the PRD.
type Story struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	AcceptanceCriteria []string `json:"acceptanceCriteria"`
	Priority           int      `json:"priority"`
	Passes             bool     `json:"passes"`
	Notes              string   `json:"notes"`
	ReviewPasses       *int     `json:"reviewPasses,omitempty"`
	ReviewsCompleted   int      `json:"reviewsCompleted,omitempty"`
}

// EffectiveReviewPasses returns the number of review passes for this story,
// falling back to the global default if not set.
func (s *Story) EffectiveReviewPasses(defaultPasses int) int {
	if s.ReviewPasses != nil {
		return *s.ReviewPasses
	}
	return defaultPasses
}

// PRD represents the full PRD document.
type PRD struct {
	Project     string  `json:"project"`
	BranchName  string  `json:"branchName"`
	Description string  `json:"description"`
	UserStories []Story `json:"userStories"`
}

// Read loads a PRD from the given JSON file path.
func Read(path string) (*PRD, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var p PRD
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// Write saves a PRD to the given JSON file path.
func Write(path string, p *PRD) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0644)
}

// NextIncompleteStory returns the highest-priority story with passes=false,
// or nil if all stories pass.
func (p *PRD) NextIncompleteStory() *Story {
	var best *Story
	for i := range p.UserStories {
		s := &p.UserStories[i]
		if !s.Passes {
			if best == nil || s.Priority < best.Priority {
				best = s
			}
		}
	}
	return best
}

// NextReviewStory returns the first story that has passes=true but still
// needs review passes, or nil if all reviews are done.
func (p *PRD) NextReviewStory(defaultPasses int) *Story {
	for i := range p.UserStories {
		s := &p.UserStories[i]
		if s.Passes && s.ReviewsCompleted < s.EffectiveReviewPasses(defaultPasses) {
			return s
		}
	}
	return nil
}

// AllComplete returns true if all stories pass and all review passes are done.
func (p *PRD) AllComplete(defaultReviewPasses int) bool {
	for _, s := range p.UserStories {
		if !s.Passes {
			return false
		}
		if s.ReviewsCompleted < s.EffectiveReviewPasses(defaultReviewPasses) {
			return false
		}
	}
	return true
}
