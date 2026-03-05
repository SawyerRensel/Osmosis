# Claude Code Instructions for Osmosis

This file guides Claude through Osmosis development, from planning through refinement. Read this before asking Claude to help with any aspect of the project.

---

## Project Context

**Project**: Osmosis - An Obsidian plugin  
**Tech Stack**: TypeScript, ESLint (obsidianmd plugin), Vitest (unit), Playwright (E2E), npm
**Build Output**: `e2e-vault/.obsidian/plugins/Osmosis` (single vault for both dev and E2E testing)

---

## Before Starting Work: Read This

### Repository Structure

```
Osmosis/
├── CLAUDE.md                          # This file - Claude instructions
├── README.md                          # Project overview
├── e2e-vault/                         # Dev + E2E vault (build output goes here, gitignored)
├── media/                             # Reference media such as screenshots
├── docs/                              # User-facing documentation
├── ref/                               # Example plugins and other references
│   ├── anki                           # Anki's source code
│   ├── decks                          # Up and coming flashcard Obsidian plugin using FSRS
│   ├── markmap                        # Typescript library to build mindmaps with plain text
│   ├── obsidian-api                   # Type definitions for the latest Obsidian API.
│   ├── obsidian-maps                  # Map layout for Obsidian Bases. Example for how to build a plugin for Obsidian Bases.
│   ├── obsidian-map-view              # Map View including support for Obsidian Bases. Example for how to build a plugin for Obsidian Bases and use toggles/switches in Bases configuraiton menus
│   ├── obsidian-sample-plugin         # Template for Obsidian community plugins with build configuration and development best practices. 
│   ├── obsidian-spaced-repetition     # Most popular flashcard plugin for Obsidian
│   ├── tasknotes                      # Reference Obsidian plugin with Playwright E2E tests
│   └── zensical-docs-site             # Example zensical docs site source code
├── src/                               # Source code
├── e2e/                               # Playwright E2E tests (runs against real Obsidian)
│   ├── obsidian.ts                    # Obsidian launcher fixture (CDP via Flatpak)
│   ├── osmosis.spec.ts                # E2E smoke tests
│   └── fixtures/                      # Test markdown files copied into e2e-vault
├── e2e-setup.sh                       # One-time E2E setup (builds, creates vault, registers)
├── e2e-launch.sh                      # Opens Obsidian with e2e-vault for manual debugging
├── playwright.config.ts               # Playwright configuration
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
        └── final_review.md            # Final validation, etc.
```

### Key Documents to Reference

Before helping with code, Claude should:

1. **For Architecture Questions**: Read `notes/02_planning/implementation_plan.md`
2. **For Feature Questions**: Read `notes/01_requirements/prd.md`
3. **For Context on What's Done**: Run `bd ready` and `bd list --status=in_progress` (Beads is the source of truth for task state)
4. **For Testing/Quality Standards**: Read `notes/04_refinement/testing_checklist.md`

### Key References

- Xmind: [Website](https://xmind.com/), [Documentation](https://xmind.com/user-guide)
- Anki: Local Repo (see "anki" in "Repository Structure"), [Website](https://apps.ankiweb.net/), [GitHub](https://github.com/ankitects/anki), [Documentation](https://docs.ankiweb.net/)
- Obsidian: Local API Repo (see "obsidian-api " in "Repository Structure"), [Documentation](https://docs.obsidian.md/Home)
- Zensical: [Website](https://zensical.org), Local Example Docs Site Repo (see "zensical-docs-site" in "Repository Structure"), [Documentation](https://zensical.org/docs/get-started/)

---

## Development Workflow: How Claude Should Help

### Phase 1: Before Code (Planning & Specification)

**Claude's Role**: Think through specifications, not write code yet.

**When to use Claude**:
- Reviewing architecture decisions
- Validating that task specifications are clear
- Identifying edge cases or assumptions
- Planning the task sequence
- Thinking through data flows

**How to prompt Claude**:
```
I'm about to implement [Feature/Task]. 

Here's the specification from the PRD:
[Paste specification]

Here's my implementation plan from the planning doc:
[Paste plan]

Before I write code, let me think through:
1. What edge cases might I encounter?
2. Where might my assumptions be wrong?
3. What data flows through this feature?
4. How should I structure this for testability?
```

### Phase 2: During Code (Specification Validation)

**Claude's Role**: Validate that code matches specification, not generate all code.

**When to use Claude for code**:
- Thinking through complex logic or state management
- Validating that your implementation matches the spec
- Reviewing code for correctness against acceptance criteria
- Planning test cases
- Debugging issues

**When NOT to use Claude for code**:
- Simple, straightforward implementations
- Routine CRUD operations
- Standard patterns you know well
- Quick fixes where the solution is obvious

**How to prompt Claude**:
```
I've implemented [Feature]. Does this match the specification?

SPECIFICATION:
[Paste your spec from notes/02_planning/implementation_plan.md or task doc]

MY IMPLEMENTATION:
[Paste relevant code]

Specifically, does my code:
- [ ] Meet acceptance criterion 1?
- [ ] Handle edge case X?
- [ ] Follow the data flow I planned?

What did I miss or do wrong?
```

### Phase 3: After Code (Testing & Validation)

**Claude's Role**: Help plan tests and validate quality.

**How to prompt Claude**:
```
I've completed [Task/Feature]. Now I need to validate it works.

ACCEPTANCE CRITERIA:
[List from spec]

IMPLEMENTATION:
[Paste code]

What test cases do I need to write to validate this works? 
What manual testing should I do?
Are there scenarios I might not have considered?
```

---

## Build & Quality Assurance Workflow

### After Every Code Change

```bash
# 1. Run ESLint to check code quality
npm run lint
# Fix any issues before proceeding

# 2. Run unit tests
npm run test
# Fix any failures before proceeding

# 3. Build the plugin
npm run build
# This compiles TypeScript and outputs to e2e-vault/.obsidian/plugins/Osmosis

# 4. Provide manual test instructions to the user
# After each task/subtask, tell the user exactly what to do in Obsidian to verify the change.
# The user will perform manual testing — do NOT run Playwright E2E tests.

# 5. If there are issues, fix in src/ and repeat from step 1
```

### Linting

**Command**: `npm run lint`  
**Config**: ESLint with `eslint-plugin-obsidianmd` for Obsidian-specific rules

**When Claude helps with code**:
- Ask Claude to write code that passes ESLint
- If eslint fails, paste the error and ask Claude for help
- Common issues to watch for: undefined variables, type mismatches, unused code

**Prompt for linting help**:
```
I got an ESLint error:

[Paste error message]

My code:
[Paste relevant section]

How do I fix this while maintaining the intended behavior?
```

### Building

**Command**: `npm run build`  
**Output Location**: `e2e-vault/.obsidian/plugins/Osmosis/` (single vault for dev and E2E testing)

**Important**: Build output goes to `e2e-vault/`. This is the same vault used for both manual testing and Playwright E2E tests.

**If build fails**:
```
My build failed with this error:

[Paste error]

My code:
[Paste relevant section]

What's wrong and how do I fix it?
```

---

## Code Quality Standards

### TypeScript

- Strict type checking enabled (see tsconfig.json)
- Avoid `any` types—use proper interfaces and types
- Use interfaces for data structures
- Type function parameters and return values

**Prompt Claude for type help**:
```
I'm using TypeScript strictly. Here's what I'm trying to do:

[Describe the code structure]

What types should I define? Here's my attempt:

[Paste your type definitions]

Is this correct? What's missing?
```

### Code Style

- Follow Obsidian plugin conventions (see `eslint-plugin-obsidianmd`)
- Keep functions focused and single-purpose
- Use meaningful variable names
- Comment complex logic

### Error Handling

- Catch errors at system boundaries (user input, external APIs, file operations)
- Log errors for debugging
- Gracefully degrade when possible

---

## Testing

### Two-Layer Testing Strategy

| Layer | Tool | Command | What it tests |
|-------|------|---------|---------------|
| Unit | Vitest | `npm test` | Pure logic: parser, layout engine, cache |
| Manual | Obsidian | Open vault | UI, commands, rendering, edge cases, visual polish, UX |

**Note**: Playwright E2E tests exist in `e2e/` but are NOT part of the current workflow. The user performs manual testing instead. Do NOT write new Playwright tests or run `npm run e2e`.

### Before Shipping Any Feature

1. **Unit tests** (`npm test`):
   - Run the existing suite — all must pass
   - Add unit tests for new pure logic (parser changes, layout algorithms, data transforms)
   - Test files live alongside source: `src/foo.test.ts`

2. **Linting** (`npm run lint`):
   - Must pass with no errors

3. **Manual testing** (user-performed):
   - After each task/subtask, create test fixture files in `e2e/fixtures/` and copy them to `e2e-vault/`
   - Provide the user with clear step-by-step instructions for what to test in Obsidian
   - Include: which file to open, what actions to perform, what to expect
   - The user will report back with results or screenshots

---

## Debugging with Claude

### When Something Breaks

**Good information to give Claude**:

```
[Feature] is broken. Here's what's happening:

EXPECTED BEHAVIOR:
[What should happen]

ACTUAL BEHAVIOR:
[What's actually happening]

STEPS TO REPRODUCE:
1. [Step 1]
2. [Step 2]

RELEVANT CODE:
[Paste the code you suspect]

ERRORS/LOGS:
[Paste any error messages from console or logs]
```

**Claude can help with**:
- Understanding the error
- Identifying the root cause
- Validating your proposed fix
- Finding edge cases you missed

---

## Feature Development Workflow: Step by Step

### Step 1: Understand the Feature

Before writing code:

```
I'm about to implement [Feature Name].

FROM THE PRD:
[Paste feature description and acceptance criteria]

FROM THE IMPLEMENTATION PLAN:
[Paste task description]

QUESTIONS FOR CLAUDE:
- What's the clearest way to understand what this feature does?
- What assumptions am I making?
- What edge cases should I handle?
- What's the simplest implementation that meets the acceptance criteria?
```

### Step 2: Plan the Implementation

```
Before I code, let me plan the implementation:

FEATURE: [Name]
ACCEPTANCE CRITERIA: [List]
DEPENDENCIES: [What needs to be done first?]

MY PLAN:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Is this the right approach? What am I missing?
```

### Step 3: Write Code

Use Claude for:
- Complex logic or state management
- Validating against spec
- Debugging issues
- Planning tests

Do NOT use Claude for:
- Every line of code (that's not the goal)
- Obvious implementations
- Learning TypeScript syntax (look up the docs)

### Step 4: Validate & Test

```
I've implemented [Feature]. Let me validate it:

SPEC:
[Acceptance criteria]

CODE:
[Implementation]

TESTING:
- Did I test [case A]? [Yes/No/How?]
- Did I test [case B]? [Yes/No/How?]
- Did I check for [edge case]?

What am I missing?
```

### Step 4.5: Provide Manual Test Instructions

After completing each subtask:
- Create test fixture files in `e2e/fixtures/` and copy them to `e2e-vault/`
- Provide the user with clear manual testing steps:
  - Which file to open in Obsidian
  - What actions to perform (open mind map, click nodes, edit, etc.)
  - What the expected result should be
  - What to check to confirm it works (e.g., "the source file should now contain X")

### Step 5: Update Beads

```bash
bd close <id>                        # Mark issue complete
bd close <id> --reason="explanation" # Close with context
```

For follow-up tasks discovered during implementation, create new issues before closing the current one:
```bash
bd create --title="Follow-up task" --type=task --priority=2
bd dep add <new-id> <blocking-id>    # If there are dependencies
```

---

## When to Ask Claude for Code Help vs. Not

### ✓ Ask Claude

- Complex conditional logic with multiple branches
- State management and side effects
- Type definitions for complex data structures
- Validating that code matches a specification
- Debugging errors you don't understand
- Planning test cases

### ✗ Don't Ask Claude

- Simple function that does one thing clearly
- Basic CRUD operations
- Obvious syntax errors you can fix with docs
- Things you know how to do (don't lose skills)
- Learning TypeScript basics (read the handbook)

**Rule of thumb**: If you'd ask a colleague for a code review, ask Claude. If you know how to do it, do it yourself.

---

## Common Patterns for This Project

### File Operations (if Osmosis handles files)

When dealing with file I/O:
- Always handle errors
- Use try/catch for file operations
- Log what's happening for debugging

```
I'm implementing file operations. Here's my spec:

[Spec]

Here's my implementation:

[Code]

Is my error handling correct? What could go wrong?
```

### Plugin Settings (if Osmosis has settings)

If Osmosis persists settings:
- Load settings on plugin load
- Validate settings when loading
- Provide sensible defaults
- Notify user of changes

### Event Listeners (if Osmosis listens to vault events)

When listening to Obsidian events:
- Always cleanup listeners on unload
- Handle events that fire frequently carefully (debounce if needed)
- Log events for debugging

---

## Documentation

### When to Document

- Public APIs and interfaces
- Complex algorithms or logic
- Non-obvious design decisions
- Setup or configuration instructions

### Keep Doc Comments Up-to-Date

If Claude helps with code, make sure the comments stay accurate. Stale documentation is worse than no documentation.

---

## Performance Considerations

Osmosis runs in Obsidian, which is resource-constrained on some systems.

**Watch out for**:
- Inefficient loops or algorithms
- Excessive DOM manipulation
- Memory leaks from listeners not being cleaned up
- Synchronous operations that block the UI

**Prompt Claude for performance help**:
```
I'm concerned about performance in [Feature].

CURRENT IMPLEMENTATION:
[Code]

CONCERN:
[What might be slow or memory-intensive?]

How can I optimize this without breaking functionality?
```

---

## Obsidian-Specific Guidance

### Obsidian Plugin API

When using Obsidian APIs:
- Reference the official Obsidian API docs
- Ask Claude to validate that you're using APIs correctly
- Watch for breaking changes across Obsidian versions

**Prompt for API help**:
```
I'm using the Obsidian API to [do something].

WHAT I'M TRYING TO DO:
[Description]

MY IMPLEMENTATION:
[Code]

Am I using the API correctly? Is there a better way?
```

### Testing in Obsidian

- **Manual**: Test in `e2e-vault/` (build output goes here)
- Use Obsidian's plugin console for debugging (Ctrl+Shift+I)
- Reload the plugin to test changes: Community Plugins → Osmosis → Reload
- To open Obsidian with the vault: `npm run e2e:launch`

---

## Example: Complete Feature Implementation with Claude

Here's how you'd implement a feature using this guide:

**Step 1**: Read the spec
```
I'm implementing [Feature].

From notes/01_requirements/prd.md:
[Feature description and acceptance criteria]
```

**Step 2**: Think through it with Claude
```
Before I code, I want to validate my approach.

THE FEATURE: [Description]
MY PLAN: [Steps]
EDGE CASES: [What could go wrong]

Is my approach sound?
```

**Step 3**: Write the code (mostly on your own, Claude for complex parts)

**Step 4**: Validate with Claude
```
Here's my implementation. Does it match the spec?

[Code and spec]
```

**Step 5**: Build and test
```bash
npm run lint                              # Fix any issues
npm run test                              # Run unit tests
npm run build                             # Build the plugin
# Provide manual test instructions to the user
```

**Step 6**: Close the Beads issue
```bash
bd close <id> --reason="Acceptance criteria met: X, Y, Z"
```

---

## Getting Help from Claude

### Effective Prompts

**Before**: "Can you write a function that does X?"  
**After**: "I'm implementing X. Here's the spec. Here's my approach. Does this implementation match the spec?"

**Before**: "Fix this error"  
**After**: "I got this error: [error]. Here's the relevant code. What does this error mean and how do I fix it?"

**Before**: "How do I use the Obsidian API?"  
**After**: "I'm trying to do [specific task]. Here's my code using the Obsidian API. Am I using it correctly?"

### Structuring Your Questions

Always include:
1. **Context**: What are you building?
2. **Spec**: What should happen?
3. **Your attempt**: What did you try?
4. **What's wrong**: What's the problem?
5. **What you've tried**: What did you already attempt?

---

## Task Tracking with Beads

Beads (`bd`) is the source of truth for all task state. **Do not use TodoWrite or markdown files for task tracking.**

### Claude's Workflow with Beads

```bash
bd ready                              # Check what's available at session start
bd list --status=in_progress          # See what's already claimed
bd show <id>                          # Review issue details before starting
bd update <id> --status=in_progress   # Claim an issue before working on it
bd close <id>                         # Mark complete when done
```

### Creating Issues

```bash
bd create --title="Summary" --description="Why this exists and what to do" --type=task --priority=2
```

Priority: 0=critical, 1=high, 2=medium, 3=low, 4=backlog

### Dependencies

```bash
bd dep add <child-id> <parent-id>   # child depends on parent (parent blocks child)
bd blocked                           # See all blocked issues
```

### Session End

```bash
bd close <id1> <id2> ...            # Close completed issues
git add <files> && git commit -m "..." && git push
```

---

## Version Control Notes

Commit when:
- A subtask is complete with passing unit tests (`npm test`) and clean lint (`npm run lint`)
- Build succeeds (`npm run build`)
- Acceptance criteria are met
- Manual test instructions have been provided to the user

Example commit messages:
```
feat: Implement [Feature Name], meets acceptance criteria X, Y, Z
fix: Handle edge case in [Feature Name]
refactor: Simplify [Component], no behavior change
docs: Update progress log, [Feature] complete
```

---

## Quick Reference Checklist

Before asking Claude for help on any code task:

- [ ] I've read the relevant spec in `notes/01_requirements/prd.md`
- [ ] I've read the implementation plan in `notes/02_planning/implementation_plan.md`
- [ ] I've thought about what I'm trying to do (not just "write this for me")
- [ ] I have clear acceptance criteria I can validate against
- [ ] I can explain the problem or question clearly
- [ ] I'm ready to review and validate Claude's suggestions, not just copy-paste

---

## Questions?

- **About the project**: Check `notes/01_requirements/prd.md` (what we're building)
- **About architecture**: Check `notes/02_planning/technical_decisions.md` (why we chose this tech)
- **About what's done**: Run `bd list --status=in_progress` and `bd ready`
- **About quality standards**: Check `notes/04_refinement/testing_checklist.md`

---

**Last Updated**: 2026-03-02
**For Claude**: This file is your guide. Reference it before helping with any Osmosis code.
