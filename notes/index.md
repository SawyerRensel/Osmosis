# Claude-Guided Development Workflow

A structured approach to developing projects with Claude, optimizing the journey from initial concept through final implementation.

## Workflow Overview

This template guides you through five key phases:

1. **Inspiration** - Capture raw ideas and brainstorm with Claude
2. **Requirements** - Transform ideas into a formal Product Requirements Document
3. **Planning** - Create detailed implementation strategies and architecture
4. **Development** - Execute iteratively with Claude's guidance
5. **Refinement** - Polish, test, and optimize the final product

Each phase has dedicated templates and prompts designed to extract maximum value from Claude's capabilities.

## Key Principles

**Specification Thinking Over Direct Coding**: Rather than asking Claude to write code, ask Claude to help you think through specifications, validate assumptions, and create detailed plans. This builds understanding and produces better outcomes.

**Iterative Validation**: Each phase produces artifacts that are validated and refined before moving to the next phase. This prevents cascading errors and keeps the project aligned with intent.

**Context Preservation**: Maintain clear connections between phases. Each document references and builds upon previous work, creating a coherent narrative from idea to implementation.

**Prompt Engineering as Craft**: The templates include proven prompt patterns from Anthropic's documentation. These aren't boilerplate—they're structured to leverage how Claude 4.5 models process information.

## Project Structure

```
my-project/
├── 00_inspiration/
│   ├── inspo.md           # Raw brainstorm + initial chat history
│   └── core_concept.md    # Refined concept statement
├── 01_requirements/
│   ├── prd_template.md    # Full Product Requirements Document
│   └── success_metrics.md # How you'll measure success
├── 02_planning/
│   ├── implementation_plan.md
│   ├── architecture.md
│   ├── technical_decisions.md
│   └── dependencies.md
├── 03_development/
│   ├── phase_1_tasks.md
│   ├── phase_2_tasks.md
│   └── progress_log.md
├── 04_refinement/
│   ├── testing_checklist.md
│   ├── performance_notes.md
│   └── final_review.md
└── CLAUDE_CONVERSATIONS.md # Index of significant Claude conversations
```

## Using This Template

1. Create a new folder for your project
2. Copy the phase templates into your project structure
3. Start with **inspo.md** and work through the phases sequentially
4. Reference the **Prompt Patterns** section for the best Claude interactions at each phase
5. Maintain **CLAUDE_CONVERSATIONS.md** as an index of important Claude sessions

## Quick Start

To start your first Claude-guided project:

```bash
# Create project structure
mkdir my-project && cd my-project
cp -r ../claude-project-workflow/templates/* .

# Start with inspiration phase
open 00_inspiration/inspo.md
```

Then open Claude and follow the prompts in `01_inspiration_phase_prompts.md`.

## Best Practices for Claude Interactions

**Clear Structure Wins**: Claude 4.5 responds best to clearly separated sections. Use consistent formatting (## Headers, CONTEXT: markers) to delineate different parts of your prompt.

**Context First, Then Request**: Provide relevant context and constraints before asking Claude to produce something. This is more effective than embedding context within requests.

**Few-Shot Examples**: When format matters (JSON structure, code style, documentation format), provide one example of what good output looks like.

**Validation Queries**: After Claude produces something, ask it to validate its own work against success criteria. This catches issues before they compound.

**Task Splitting**: Even though Claude has a large context window, breaking complex requests into discrete steps produces higher quality work. For example: "First, create the specification. Then, validate it against these constraints. Finally, identify potential issues."

## Workflow Customization

This workflow is designed around your current process (inspo.md → PRD → implementation plan). Customize it by:

- Adjusting phase names if you use different terminology
- Adding domain-specific templates (database schema template for backend projects, component library template for frontend, etc.)
- Modifying success metrics to match your project type
- Adding phases if your process requires additional steps (e.g., Design phase before Implementation)

## Integration with Your Tools

**Obsidian**: Link the CLAUDE_CONVERSATIONS index to your knowledge base for cross-referencing with project notes.

**Git**: Store project phases in version control. Each phase completion is a natural commit point.

## When Each Phase is Complete

**Inspiration**: You have a clear one-paragraph concept statement and an understanding of why the project matters.

**Requirements**: You have a PRD that a team member could read and understand exactly what you're building and why.

**Planning**: You have a detailed sequence of work tasks, architectural decisions documented, and risk mitigation strategies.

**Development**: Code is written, either by Claude or with Claude's guidance, and core functionality is complete.

**Refinement**: All success metrics are met, edge cases are handled, and the project is ready to ship or deploy.

---

For questions about the workflow, examples of each phase, or prompts optimized for Claude 4.5, see the accompanying files.
