# Planning Phase: Prompts for Claude

These prompts help you move from requirements to a detailed implementation plan. Claude excels at architectural thinking, task breakdown, and risk analysis—use these prompts to extract that capability.

## Prompt 1: Architecture & Tech Stack Decision

Use this early in the Planning phase to validate your tech choices and think through architecture.

---

**CONTEXT**

I have a locked PRD for my project and I need to make technology and architecture decisions before detailed planning. I want to think through these choices systematically.

**PROJECT OVERVIEW**

What we're building: [1-2 sentence overview]

Core requirements: [List 3-5 key requirements from your PRD]

Expected scale: [Who will use this? How many users/requests?]

Timeline: [How long do we have to build this?]

Team: [Who's building it? What are their skills?]

**INITIAL TECH THINKING**

Current thoughts on tech stack: [Your preliminary choices, if any]

Constraints: [Budget constraints, team expertise, company standards, etc.]

**TASK**

Please help me think through technology and architecture decisions:

1. For the requirements I've listed, what technology choices make sense? (Consider: languages, frameworks, databases, deployment platforms)
2. What are the tradeoffs between different choices? (Speed to build vs. long-term maintainability? Simplicity vs. scalability?)
3. Diagram a high-level architecture: how do components talk to each other?
4. What are the riskiest technology decisions? Where should I be conservative vs. experimental?
5. What does the data model look like at a conceptual level?

**OUTPUT FORMAT**

- Recommended Tech Stack (with rationale for each choice)
- Alternative Stacks & Tradeoffs (what would change if we chose differently?)
- High-Level Architecture Diagram (describe in text or ASCII art)
- Data Model (conceptual schema)
- Technical Risks (areas where tech choices could cause problems)
- "Keep Simple" Recommendations (where overengineering is tempting but unnecessary)

---

## Prompt 2: Task Breakdown & Work Sequencing

Use this to break down your PRD into implementable tasks and figure out the right sequence.

---

**CONTEXT**

I have a locked PRD with core features defined. Now I need to break this down into specific, sequenced tasks that can be executed.

**PRD SUMMARY**

Core features I'm building: [List your 3-5 core features]

Acceptance criteria: [Brief summary of what "done" means for each feature]

Timeline: [How long do I have?]

**TASK**

Please help me:

1. Break down each feature into specific, implementable tasks (each task should be 1-2 days of work, max)
2. Create a dependency graph: which tasks depend on other tasks being done first?
3. Suggest an implementation sequence that makes sense (why this order?)
4. Estimate effort for each task
5. Group related tasks into development phases
6. Identify critical path (what can't slip without affecting the overall timeline?)

**OUTPUT FORMAT**

For Each Feature:
- Feature: [Name]
- Sub-tasks: (List with brief description and estimated effort)
- Dependencies: (What must be done first?)
- Implementation Notes: (Any tricky aspects to watch for?)

Implementation Sequence Rationale: (Why this order? What are we optimizing for?)

Timeline:
- Phase 1 (Foundation): Tasks [X], est. [Y days]
- Phase 2 (Features): Tasks [X], est. [Y days]
- Phase 3 (Integration): Tasks [X], est. [Y days]

Critical Path: (What can't slip?)

---

## Prompt 3: Data Model & Schema Design

Use this to think through your data structure before writing code.

---

**CONTEXT**

I want to design my data model before I start coding. A solid data structure will prevent pain later.

**PROJECT CONTEXT**

What I'm building: [Brief description]

Core features: [What are the main things users do with this system?]

Expected data volume: [Roughly how much data will this system handle?]

User personas: [Who's using this? What matters to them?]

**TASK**

Please design a conceptual data model for this project:

1. Identify the main entities (User, Project, Document, etc.)
2. Define the attributes of each entity (what data does each have?)
3. Define relationships between entities (one-to-many? Many-to-many? How do they relate?)
4. Identify what queries/lookups will be common (what will users ask for?)
5. Flag any data design decisions that could cause problems later
6. Suggest indexes or performance optimizations needed early

**OUTPUT FORMAT**

Entity Reference:
- Entity Name
  - Attributes: (list with types)
  - Primary Key: (what uniquely identifies this?)
  - Relationships: (how it connects to other entities)

Relationships Diagram: (describe or ASCII art showing how entities connect)

Key Queries/Lookups: (the most common data retrieval patterns)

Performance Considerations: (what might slow down as data grows? How to address?)

Design Trade-offs: (decisions and why you made them)

---

## Prompt 4: Risk & Mitigation Planning

Use this to identify risks early and plan mitigation strategies.

---

**CONTEXT**

Before I start development, I want to identify what could go wrong and plan mitigation strategies.

**PROJECT OVERVIEW**

What I'm building: [Brief description]

Timeline: [How long do I have?]

Team: [Who's building this?]

Technology: [What's the tech stack?]

Unknown/Risky areas: [What parts of this project feel uncertain?]

**TASK**

Please identify:

1. Technical risks: What could go wrong with the technology choices or architecture?
2. Scope risks: What features or requirements might be harder than expected?
3. Timeline risks: What tasks are most likely to take longer than estimated?
4. Integration risks: Are there any external dependencies that could cause problems?
5. Team risks: Are there areas where team skill/experience could be a bottleneck?

For each risk:
- Describe the risk
- Estimate likelihood (high/medium/low) and impact (high/medium/low)
- Suggest mitigation (what would you do if this happens? How can you prevent it?)
- Suggest early validation (what could you test or validate before it becomes a problem?)

**OUTPUT FORMAT**

High-Risk Items: (likelihood H and/or impact H)
- Risk: [Description]
- Likelihood: H/M/L | Impact: H/M/L
- Mitigation: [How you'd handle it]
- Early Validation: [What could you test/validate early?]

Medium-Risk Items: (mention but less detail)

Key Assumptions to Validate: (what are you assuming that could be wrong?)

Suggested Risk Reduction Activities Before Development: (small tests or prototypes)

---

## Prompt 5: Testing Strategy & Quality Plan

Use this to plan how you'll ensure quality without getting bogged down.

---

**CONTEXT**

I want to plan a testing strategy that ensures quality without being overly burdensome.

**PROJECT OVERVIEW**

What I'm building: [Brief description]

Key user journeys: [What's the most important thing users do with this?]

Non-negotiables: [What absolutely must work? What can be fixed later?]

Team size: [How much testing capacity do I have?]

**TASK**

Please suggest:

1. A testing pyramid (unit tests, integration tests, end-to-end tests) appropriate for this project
2. What specifically should be tested at each level?
3. What shouldn't be tested (where is testing effort wasted?)
4. Quality thresholds (when can you ship?)
5. Automation vs. manual testing strategy

**OUTPUT FORMAT**

Testing Strategy:
- Unit Tests: (What gets tested? Coverage target?)
- Integration Tests: (What workflows need testing?)
- End-to-End Tests: (What user journeys are critical?)
- Manual Testing: (What can't/shouldn't be automated?)

Quality Thresholds:
- Ready to Launch When: (specific criteria)
- Must Have: [List]
- Nice to Have: [List]
- Can Defer: [List]

Automation Plan: (what can be automated, and how?)

---

## Prompt 6: Implementation Plan Review & Validation

Use this late in Planning phase to validate your plan before development starts.

---

**CONTEXT**

I've created a detailed implementation plan and want to validate it before starting development. Is it realistic? Are there gaps?

**TASK**

Please review this implementation plan and assess whether it's realistic and complete:

[Paste your full implementation plan]

Please evaluate:

1. Are the task estimates realistic? (Consider: team experience, complexity, unknowns)
2. Is the sequencing logical? (Are dependencies ordered correctly?)
3. Are there gaps? (Anything missing from the plan?)
4. Are timeline estimates padded appropriately for unknowns?
5. What's the biggest risk to this plan succeeding on time?
6. What would make this plan more likely to succeed?

**OUTPUT FORMAT**

Realistic Assessment:
- Timeline: Likely to hit estimated date? Why or why not?
- Task Estimates: Any that seem too optimistic?
- Team Capacity: Is the plan realistic given team size/skill?

Gaps or Issues:
- Missing from Plan: [What should be added?]
- Sequencing Issues: [Any tasks out of order?]
- Unclear Items: [What needs more detail?]

Risk Assessment:
- Biggest Risk to Timeline: [What could cause delays?]
- Biggest Technical Risk: [What might not work as expected?]

Recommendations:
- How to increase success probability: [Specific suggestions]
- Where to cut scope if timeline pressures: [If needed]

---

## Quick Reference: Planning Phase Workflow

**Step 1**: Use Prompt 1 to nail down architecture and tech stack decisions

**Step 2**: Use Prompt 2 to break down PRD into sequenced tasks

**Step 3**: Use Prompt 3 to design your data model

**Step 4**: Use Prompt 4 to identify and plan risk mitigation

**Step 5**: Use Prompt 5 to plan your testing strategy

**Step 6**: Use Prompt 6 to validate the overall plan

**Step 7**: Lock the plan and start development

---

## Claude for Specification Thinking (Your Transition Zone)

As you move into Planning, you're in the sweet spot for your "specification thinking" approach. Rather than asking Claude to write code, use it for:

- Validating your architecture decisions
- Thinking through edge cases
- Planning what specifications you need
- Reviewing proposed approaches
- Identifying risks and unknowns

This is where Claude's strength lies: helping you think clearly about what to build before building it.

---

## When Planning Phase is Complete

✓ You have a clear tech stack with rationale for each choice  
✓ Your data model is designed and makes sense  
✓ Tasks are broken down into 1-2 day chunks  
✓ Implementation sequence is logical and dependencies are clear  
✓ Risks are identified with mitigation strategies  
✓ Testing strategy is defined  
✓ Timeline is realistic with buffer for unknowns  
✓ You're ready to start Development phase with clarity
