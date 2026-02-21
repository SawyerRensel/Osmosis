# Optimizing Your Workflow: Concept to Final Product with Claude

This guide builds on your current workflow (inspo.md → PRD → implementation plan) and shows how to optimize each transition for maximum clarity and quality output.

---

## Your Current Workflow: Analysis & Optimization

### What You're Already Doing Well

**Inspo.md → PRD**: You capture raw thinking, then formalize it. This is excellent because:
- You're using Claude for brainstorming (where it excels)
- You're creating a single source of truth (PRD) that guides everything after
- You're separating "what are we building?" from "how do we build it?"

**PRD → Implementation Plan**: You move from requirements to sequencing. This is the right progression because:
- You understand what's needed before planning how to build it
- You can validate that your plan actually solves the stated problem

### Where to Optimize

**Gap 1: Feedback Loops in Early Phases**
Currently: Inspo → PRD (one direction)
Better: Inspo → Claude feedback → refined inspo → PRD

**Gap 2: Validation Points**
Currently: Each phase is sequential
Better: Each phase gets validated before moving forward

**Gap 3: Specification Clarity During Development**
Currently: Implementation plan exists, but no mechanism to validate that code follows it

**Gap 4: Knowledge Preservation**
Currently: Artifacts are files; learnings aren't captured for future projects

---

## Optimized Workflow for Each Transition

### Transition 1: Inspiration → Requirements

**Current Process**
```
inspo.md (raw) → PRD prompt to Claude → PRD (final)
```

**Optimized Process**
```
Raw ideas
  ↓
Claude Brainstorm Session 1 (clarify + expand)
  ↓
inspo.md (refined with Claude insights)
  ↓
Claude Review Session (validate assumptions)
  ↓
PRD Generation (using Claude PRD prompt)
  ↓
PRD Validation Session (Claude reviews for gaps)
  ↓
PRD (locked)
```

**Why this is better**:
- You don't start PRD generation until inspiration is really solid
- Claude catches missing user needs before you lock requirements
- You're less likely to discover mid-development that you missed something important

**How to do it**:
1. Use inspiration_phase_prompts.md Prompt 1 (Concept Exploration)
2. Update inspo.md with findings
3. Use inspiration_phase_prompts.md Prompt 5 (Scope Reality Check)
4. Refine inspo.md again
5. Now you're ready for requirements_phase_prompts.md Prompt 1 (PRD Generation)
6. Use requirements_phase_prompts.md Prompt 6 (PRD Review) to validate before locking

**Time investment**: 2-3 additional Claude conversations (~30 min of your time to review + respond)  
**Value**: Prevents misalignment between vision and requirements, saves rework later

---

### Transition 2: Requirements → Planning

**Current Process**
```
PRD (locked) → Implementation Plan
```

**Optimized Process**
```
PRD (locked)
  ↓
Claude Architecture Session (tech stack + data model)
  ↓
implementation_plan.md (architecture section filled in)
  ↓
Claude Task Breakdown Session (sequencing + estimation)
  ↓
implementation_plan.md (task breakdown + phases filled in)
  ↓
Claude Risk Analysis Session (identify + mitigate risks)
  ↓
implementation_plan.md (risk section filled in)
  ↓
Claude Plan Validation Session (is this realistic?)
  ↓
implementation_plan.md (locked)
```

**Why this is better**:
- Architecture is validated before development starts
- Tasks are sequenced logically based on dependencies
- Risks are identified early when they're cheap to mitigate
- Final plan has Claude's validation, not just your assumptions

**How to do it**:
1. Use planning_phase_prompts.md Prompt 1 (Architecture & Tech Stack)
2. Fill in your implementation_plan.md architecture section
3. Use planning_phase_prompts.md Prompt 2 (Task Breakdown)
4. Fill in task breakdown and phases
5. Use planning_phase_prompts.md Prompt 4 (Risk & Mitigation)
6. Fill in risk section
7. Use planning_phase_prompts.md Prompt 6 (Plan Validation)
8. Refine based on feedback, then lock

**Time investment**: 3-4 Claude conversations (~1 hour of your time)  
**Value**: Realistic plan, fewer surprises during development, risk mitigation before problems happen

---

### Transition 3: Planning → Development (The Big One)

**Current Process**
```
implementation_plan.md → start coding
```

**Optimized Process**
```
implementation_plan.md (locked)
  ↓
Phase 1 Spec Session with Claude (detailed specification for Phase 1 tasks)
  ↓
Phase 1 Spec Document (exactly what to build, acceptance criteria, edge cases)
  ↓
Development (build Phase 1, using Claude as validator for specifications)
  ↓
Phase 1 Completion Validation (does Phase 1 meet all acceptance criteria?)
  ↓
Phase 2 Spec Session (repeat for Phase 2)
  ↓
[Continue for all phases]
  ↓
Final Review & Refinement
```

**Why this is better**:
- You're not writing code based on a high-level plan; you're writing code based on detailed specifications
- Claude helps you think through edge cases before you code
- You have a specification to validate against at the end
- Each phase completes with explicit validation

**How to do it**:
For each phase:
1. Take the phase tasks from your implementation plan
2. Create a Phase Spec using this prompt (below)
3. Have Claude help you detail acceptance criteria and edge cases
4. Develop using the phase spec as your guide
5. Use a validation prompt to confirm all acceptance criteria are met

**Phase Specification Prompt Template**:

```
CONTEXT
I'm in Phase [N] of [Project Name], which is focused on [Phase Goal].

From my implementation plan, Phase [N] includes these tasks:
[List tasks]

These tasks implement these PRD features:
[List features]

TASK
Please help me create a detailed specification for Phase [N]:

1. Break down each task into specific, testable acceptance criteria
2. Identify edge cases or tricky scenarios for each task
3. Define the data flows (what data comes in, what happens to it, what comes out)
4. Flag any places where I might make assumptions that could be wrong
5. Suggest validation points (how will I know Phase [N] is complete?)

OUTPUT FORMAT
For each task:
- Task Name
- Detailed Description (what the user will do/experience)
- Acceptance Criteria (specific, testable items)
- Edge Cases (unusual scenarios to handle)
- Data Flows (inputs → processing → outputs)
- Assumptions to Validate
- How to Test This Task

Overall Phase Validation Checklist: (complete list of all acceptance criteria for the phase)
```

**Time investment**: 1 Claude conversation per phase (~15 min per phase)  
**Value**: Specifications prevent ambiguity, validation prevents shipping incomplete work

---

## Using Claude During Active Development

### Development Prompts (When You're Actually Coding)

Rather than asking Claude "write this function," ask Claude to help you think through the specification:

**Good Development Prompts**:

```
I'm working on [Feature], and I'm uncertain about edge cases.

The feature should: [Description from spec]

I'm wondering: what happens if [edge case]? Should I [approach A] or [approach B]?

Here's my current specification: [Your spec]

Where might users run into problems?
```

```
I've written code for [Feature]. Does it implement this specification:

[Paste your specification]

Looking at my code:

[Paste relevant code]

Does this correctly implement the specification? What did I miss?
```

```
I'm about to refactor [section], and I want to make sure I'm not breaking anything.

Current behavior: [Description]
Current code: [Code]

I want to change it to: [Description]
Proposed code: [Code]

What tests would I need to pass to validate this refactor doesn't break anything?
```

### When NOT to Use Claude for Coding

- **Simple implementations**: "Add a button that does X" → just build it
- **Routine work**: Standard CRUD operations → you don't need validation
- **Obvious solutions**: There's one clear way to do it → do it

### When TO Use Claude for Coding

- **Complex logic**: Multiple conditions, state management, edge cases
- **Validation**: "Does this implement the spec correctly?"
- **Refactoring**: "Will this change break something?"
- **Testing strategy**: "What scenarios need test coverage?"

---

## Knowledge Preservation: Learning from Each Project

### Creating a Project Postmortem

When you complete a project, create a postmortem that captures:

**What Went Well**:
- Which phases ran smoothly?
- Which prompts were most useful?
- Which planning decisions were spot-on?

**What Was Harder Than Expected**:
- Which tasks took longer? Why?
- Which assumptions were wrong?
- Which risks materialized?

**Next Time**:
- What would you do differently at each phase?
- What should you be more careful about?
- What new techniques would help?

**Link to project**: [Project folder]

### Updating Your Templates

After 2-3 projects, you'll have learned what works for you specifically. Update your templates:
- Adjust estimated effort ranges
- Add domain-specific templates (if building APIs, add API design template)
- Refine prompt wording based on what got best Claude responses
- Add your own examples

---

## Optimizing Prompt Execution

### Sequencing Prompts in Conversations

**Good**: Run related prompts in one conversation
```
Conversation 1: Use inspiration_phase_prompts Prompt 1 + Prompt 3 + Prompt 5
(Claude maintains context across all three, outputs are cohesive)

Then, in a separate conversation:
Conversation 2: Use requirements_phase_prompts Prompt 1
(Fresh context, focused on PRD generation)
```

**Less optimal**: One prompt per conversation
(Claude has context, you have to re-paste project info each time)

**Also not ideal**: All prompts in one giant conversation
(Context window fills up, later prompts don't get full attention)

### When to Start a Fresh Conversation

- When moving between major phases (Inspiration → Requirements)
- When previous conversation has gotten long (15,000+ tokens)
- When you need focused attention on one specific output (PRD, plan validation)

### When to Continue a Conversation

- Within a phase, if building on previous outputs
- If you're iterating on the same artifact
- If Claude's responses depend on context from earlier in the conversation

---

## Measuring Success of Your Optimized Workflow

### Metrics to Track

**Phase Duration**:
- How long does each phase actually take vs. planned?
- Are later phases running into fewer surprises?

**Rework Rate**:
- How much code are you throwing away or heavily revising?
- Are specification sessions reducing rework?

**Timeline Accuracy**:
- Do your projects ship on time?
- Which phases tend to slip?

**Confidence**:
- Before shipping, how confident are you that everything works?
- Are you catching bugs before users do?

### Quick Health Check (every 2-3 projects)

- [ ] Are phases completing as planned, or are you discovering gaps mid-phase?
- [ ] Is the planning → development transition smooth, or are you rewriting plans after starting?
- [ ] Do code reviews surface implementation issues, or is the code following spec correctly?
- [ ] Are you still using all the templates, or have some become unnecessary?

If answering "no" to more than one, revisit and refine your process.

---

## Integration with Your Existing Tools

### Obsidian Integration

Store your templates in Obsidian, link them from your project vault:

```
Projects/
  └── Project Name/
      ├── 00_inspiration/
      │   └── inspo.md (link to template)
      ├── 01_requirements/
      │   └── prd.md (link to template)
      ├── 02_planning/
      │   └── implementation_plan.md (link to template)
      └── CLAUDE_CONVERSATIONS.md (index of important chats)
```

In CLAUDE_CONVERSATIONS.md:
```
# Claude Conversations Log

## Inspiration Phase
- [Concept Exploration](link to chat) - Clarified user personas
- [Scope Reality Check](link) - Validated timeline feasibility

## Requirements Phase
- [PRD Generation](link) - First draft
- [Feature Validation](link) - Refined acceptance criteria
```

### Git Workflow

Commit at natural phase completion points:

```
git commit -m "Phase 1: Inspiration complete, concept validated"
git commit -m "Phase 2: PRD locked, ready for planning"
git commit -m "Phase 3: Implementation plan validated, beginning development"
git commit -m "Phase 4: Feature X complete, passes acceptance criteria"
```

Each commit message should reference which phase you're in and what's validated/complete.

### Deployment Readiness Checklist

When moving to Development phase, copy this into your implementation_plan.md:

```
## Development Readiness Checklist

Before starting Phase 1 development:

PRD & Planning:
- [ ] PRD is locked (no more changes without documented rationale)
- [ ] Implementation plan is validated (Claude reviewed for realism)
- [ ] All team members have read and understand the plan
- [ ] Risks and mitigations are documented

Environment & Tools:
- [ ] Development environment is set up
- [ ] Repository is created and initial structure committed
- [ ] CI/CD pipeline is configured
- [ ] Testing tools are ready

Communication:
- [ ] Phase specifications are documented (not just in Claude conversations)
- [ ] Acceptance criteria are clear and in one place
- [ ] Code review process is defined
- [ ] Update mechanism for requirements changes is decided

Validation:
- [ ] Phase 1 spec has been reviewed by Claude for edge cases
- [ ] Acceptance criteria are testable (not subjective)
- [ ] Timeline assumes 20% buffer for unknowns
```

---

## Final Thoughts: Making Claude Your Thinking Partner

The core insight of your workflow is this: **Claude is great at thinking, not just executing**. Your optimization should focus on using Claude for:

- Clarifying your thinking (inspo phase)
- Validating your decisions (requirements → planning)
- Challenging your assumptions (risk analysis)
- Reviewing your work (specification thinking)

Rather than:
- Writing all the code
- Making all the decisions
- Creating all the documents

When you use Claude as a thinking partner on top of these templates, you get:
- Clearer requirements (fewer mid-project changes)
- Better planning (fewer surprises)
- Faster development (you know exactly what to build)
- Higher confidence (you've validated at each step)

Good luck with your projects!
