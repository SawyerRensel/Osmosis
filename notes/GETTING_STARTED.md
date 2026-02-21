# Getting Started: Claude Project Workflow

## What This Is

A complete system for developing projects with Claude, optimized for **specification thinking** rather than direct code generation. This workflow guides you from raw idea through final product using proven prompt patterns and templates.

**Best for**:
- Medium-complexity projects (a few weeks of work)
- Solo developers or small teams
- Anyone who wants to think clearly about what to build before building it
- Projects where change mid-development is costly

**Time to complete a project cycle**: 
- Inspiration: 1-2 days
- Requirements: 2-3 days
- Planning: 2-3 days
- Development: Varies by project
- Refinement: 1-2 days

---

## Quick Start (5 minutes)

### 1. Create Your Project Structure

```bash
mkdir my-awesome-project
cd my-awesome-project
cp -r /path/to/claude-project-workflow/templates/* .
```

### 2. Start with Inspiration

Open `notes/00_inspiration/inspo.md` and fill in:
- **Initial Spark**: Why are you building this? What's the core idea?
- **Raw Brainstorm**: Capture unfiltered thoughts

### 3. Have Your First Claude Conversation

Copy **Prompt 1** from `notes/00_inspiration/inspiration_phase_prompts.md` and paste it into Claude. Fill in your project details.

### 4. Update inspo.md

Copy Claude's most useful insights back into `notes/00_inspiration/inspo.md`.

### 5. Continue

Follow the workflow: Inspiration → Requirements → Planning → Development → Refinement. All progress is tracked in `notes/`.

---

## Complete Workflow Overview

### Phase 0: Inspiration (What are we building?)

**Goal**: Transform a vague idea into a clear concept statement and understand the user need.

**Artifacts**:
- `notes/00_inspiration/inspo.md`: Raw thinking + Claude insights + refined concept
- `notes/00_inspiration/core_concept.md` (optional): One-paragraph description of what you're building

**Claude Involvement**: 2-3 conversations using `notes/00_inspiration/inspiration_phase_prompts.md`

**Questions you should be able to answer**:
- Why does this matter?
- Who is this for?
- What problem does it solve?
- What are the core features (rough list)?

**When to move to next phase**:
- You have a clear concept statement
- You understand the primary user persona
- You know roughly what's in scope vs. out of scope

---

### Phase 1: Requirements (What exactly are we building?)

**Goal**: Create a Product Requirements Document that's specific enough to guide implementation, but not so detailed that you lock in design decisions.

**Artifacts**:
- `notes/01_requirements/prd.md`: Completed PRD with features, acceptance criteria, success metrics

**Claude Involvement**: 3-4 conversations using `notes/01_requirements/requirements_phase_prompts.md`

**Questions you should be able to answer**:
- What are the acceptance criteria for each feature?
- How will we measure success?
- What are we explicitly NOT building?
- What risks or assumptions should we validate?

**When to move to next phase**:
- PRD is complete and reviewed
- You could hand this to a developer who knows nothing about the project and they'd understand what to build
- All team members agree on what's being built

---

### Phase 2: Planning (How will we build it?)

**Goal**: Create a detailed implementation plan with architecture, sequenced tasks, and risk mitigation.

**Artifacts**:
- `notes/02_planning/implementation_plan.md`: Complete plan with architecture, task breakdown, timeline, risks
- `notes/02_planning/technical_decisions.md` (optional): Detailed rationale for tech choices

**Claude Involvement**: 4-5 conversations using `notes/02_planning/planning_phase_prompts.md`

**Questions you should be able to answer**:
- What's our tech stack and why?
- What's the sequence of work?
- What are the high-risk items and how will we mitigate them?
- Is this timeline realistic?

**When to move to next phase**:
- Implementation plan is complete and validated
- You have a realistic task list with estimates
- You've identified risks and mitigation strategies
- You're confident the plan will work

---

### Phase 3: Development (Build it)

**Goal**: Execute the plan, validating specifications and quality along the way.

**Artifacts**:
- Code (in your `src/` folder)
- `notes/03_development/progress_log.md`: Track progress against plan, note deviations
- Per-phase spec documents: Detailed specifications for each phase

**Claude Involvement**: Ongoing as specification validator, not code generator

**Key practices**:
- Use Claude to think through complex specifications
- Ask Claude to validate that your code meets the spec
- Ask Claude for testing strategy
- Track what goes faster/slower than planned

**When to move to next phase**:
- All core functionality is implemented
- Code meets acceptance criteria
- Tests are passing

---

### Phase 4: Refinement (Polish & validate)

**Goal**: Ensure the product is robust, performant, and ready to ship.

**Artifacts**:
- `notes/04_refinement/testing_checklist.md`: All testing complete
- `notes/04_refinement/performance_notes.md`: Performance optimization work
- `notes/04_refinement/final_review.md`: Final validation against PRD

**Claude Involvement**: Validation, edge case review, testing strategy

**When to ship**:
- All PRD acceptance criteria are met
- Tests are passing
- Performance is acceptable
- Edge cases are handled

---

## File Structure Explained

```
my-project/
├── CLAUDE.md                          # Instructions for Claude (this is key!)
├── README.md                          # Project overview
├── docs/                              # User-facing documentation
├── src/                               # Source code
│
└── notes/                             # All project planning & tracking
    ├── GETTING_STARTED.md             # Phase overview & workflow
    ├── OPTIMIZATION_GUIDE.md          # How to optimize for Claude
    ├── CLAUDE_CONVERSATIONS.md        # Index of important Claude chats
    ├── index.md                       # Quick reference (optional)
    │
    ├── 00_inspiration/
    │   ├── inspo.md                   # Raw brainstorm + notes
    │   ├── inspiration_phase_prompts.md
    │   └── core_concept.md            # One-paragraph concept
    │
    ├── 01_requirements/
    │   ├── prd.md                     # Complete PRD (main artifact)
    │   ├── prd_template.md            # Blank template for reference
    │   └── requirements_phase_prompts.md
    │
    ├── 02_planning/
    │   ├── implementation_plan.md     # Architecture + tasks (main artifact)
    │   ├── planning_phase_prompts.md
    │   ├── technical_decisions.md     # Tech choice rationale
    │   └── dependencies.md
    │
    ├── 03_development/
    │   ├── phase_1_tasks.md           # Detailed spec for Phase 1
    │   ├── phase_2_tasks.md           # Detailed spec for Phase 2
    │   └── progress_log.md            # Track progress + deviations
    │
    └── 04_refinement/
        ├── testing_checklist.md       # All tests + validation
        ├── performance_notes.md       # Optimization notes
        └── final_review.md            # Final validation
```

**Key difference from the template**: Your project keeps all planning, progress, and decision-making in a `notes/` folder, with `CLAUDE.md` at the root to guide Claude throughout all phases. This keeps your source code (`src/`) clean and your development documentation organized separately.

---

## How to Use the Prompts

### Basic Pattern

1. **Read the prompt template** (e.g., `inspiration_phase_prompts.md`)
2. **Copy the prompt** that matches your current need
3. **Fill in the bracketed sections** [like this] with your project info
4. **Paste into Claude**
5. **Review Claude's output** for accuracy and completeness
6. **Copy key insights** into your phase artifact (inspo.md, PRD, etc.)

### Pro Tips

**Combine related prompts**: If doing Inspiration phase, you can run Prompt 1 → Prompt 3 → Prompt 5 in the same conversation. Claude maintains context.

**Export for team review**: If you're collaborating, copy Claude's output into your shared document and get feedback before moving to the next phase.

**Adapt prompts to your style**: These are templates. Reword them to match your voice and situation.

**Validate Claude's assumptions**: If Claude makes assumptions about your project, verify them. This teaches Claude your specific context.

---

## When to Use This Workflow

### ✓ Good Fit
- You're starting a new project and want clear thinking before building
- You value understanding over speed
- You want to catch misalignment early
- You're building something with multiple features
- Team alignment matters (even on a solo project, it helps to be clear with yourself)

### ✗ Not the Best Fit
- You're building a simple script or one-off tool (use a simpler process)
- You already know exactly what you're building (maybe skip Inspiration phase)
- You're experimenting/prototyping (iteration over specification)
- Deadline is in days, not weeks (simplified version might work, but less thorough)

### Customization for Your Situation

**Experienced developer, complex project**: Use full workflow as-is

**Solo developer, medium project**: 
- Simplify: use core templates (inspo.md, prd_template.md, implementation_plan.md)
- Skip detailed peer review
- Keep progress tracking lighter

**Team of 3+**:
- Expand peer review at each phase
- Add decision log for architecture
- Formalize handoff between phases

**Research/exploration project**:
- Extend Inspiration phase (more exploration)
- Simplified PRD (focus on unknowns, not details)
- Shorten planning phase (more flexibility)

---

## Integration with Your Tools

### Using with Obsidian

1. Store templates in Obsidian vault
2. Create project note that links to each phase
3. Use Obsidian for CLAUDE_CONVERSATIONS.md (index of chats)
4. Reference Obsidian notes in Claude prompts (e.g., "Here's my user research: [paste from Obsidian]")

### Using with Git

Commit at phase completion:
```bash
git commit -m "Inspiration phase: Concept validated"
git commit -m "Requirements: PRD complete and locked"
git commit -m "Planning: Implementation plan validated"
git add .  # code in development phase
git commit -m "Phase 1: Core features complete"
```

### Using with sapwood.studio

Consider:
- Linking completed project to your portfolio
- Writing a project postmortem blog post
- Documenting lessons learned from the workflow

---

## Troubleshooting

### "I'm stuck in Inspiration phase"

**Symptom**: You keep finding new ideas and can't commit to a concept.

**Solution**: 
1. Use inspiration_phase_prompts.md Prompt 5 (Scope Reality Check)
2. Force a decision: "What's the minimum feature set that creates value?"
3. Move to Requirements phase; you can refine thinking there

### "My PRD is too detailed / not detailed enough"

**Symptom**: Unsure if you've over- or under-specified.

**Solution**: 
1. Use requirements_phase_prompts.md Prompt 6 (PRD Review)
2. Rule of thumb: Can a developer read it and understand what to build? Yes → move forward

### "My implementation plan timeline seems off"

**Symptom**: Phase estimates seem optimistic or pessimistic.

**Solution**:
1. Use planning_phase_prompts.md Prompt 6 (Plan Validation)
2. Add 20-30% buffer to timeline estimate
3. Track actual vs. estimated during development, adjust for next project

### "I'm not sure which prompt to use"

**Solution**: Each prompt template has a "CONTEXT" section that explains when to use it. Read that first.

---

## Success Patterns

### Pattern 1: Idea → PRD in 2 days

1. Day 1: Fill inspo.md, have one Claude conversation (Prompt 1)
2. Day 2: Generate PRD with Claude, lock it

Use this if you already have clear thinking about what you're building.

### Pattern 2: Thorough validation (3-4 days)

1. Day 1: Inspiration phase with multiple prompts, refined inspo.md
2. Day 2: Requirements phase, detailed PRD
3. Day 3: Planning phase, implementation plan
4. Day 4: Start Development

Use this if team alignment is critical or project complexity is high.

### Pattern 3: Iterative refinement (5+ days)

1. Days 1-2: Inspiration, multiple refinement loops
2. Days 2-3: Requirements, with stakeholder feedback
3. Days 3-4: Planning, with technical team review
4. Day 5: Start Development

Use this if you have 3+ team members or high stakes.

---

## Next Steps

1. **Copy templates** to your project's `notes/` folder
2. **Read CLAUDE.md** at your repo root (critical for Claude context!)
3. **Read `notes/GETTING_STARTED.md`** in your project
4. **Fill in `notes/00_inspiration/inspo.md`** with your raw idea
5. **Run `notes/00_inspiration/inspiration_phase_prompts.md` Prompt 1** with Claude
6. **Review output** and update your inspo.md
7. **Continue to next phase** when you're ready

---

## Integration with Your Tools

### Using with Obsidian

1. Store your `notes/` folder in Obsidian vault for reference
2. Create project note that links to each phase
3. Use Obsidian for `notes/CLAUDE_CONVERSATIONS.md` (index of chats)
4. Reference Obsidian notes in Claude prompts (e.g., "Here's my user research: [paste from Obsidian]")

### Using with Git

Commit at phase completion:
```bash
git commit -m "Inspiration phase: Concept validated"
git commit -m "Requirements: PRD complete and locked"
git commit -m "Planning: Implementation plan validated"
git add .  # code in development phase
git commit -m "Phase 1: Core features complete"
```

### Using with Your Website

Consider:
- Linking completed project to your portfolio
- Writing a project postmortem blog post
- Documenting lessons learned from the workflow

---

**Ready to start?** Open `notes/00_inspiration/inspo.md` and begin!
