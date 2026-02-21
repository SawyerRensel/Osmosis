# Requirements Phase: Prompts for Claude (PRD Generation)

These prompts are optimized to help Claude generate a comprehensive PRD from your inspiration phase work. Claude 4.5 is particularly good at taking structured input and producing well-organized documents—leverage that.

## Prompt 1: PRD Generation from Inspiration

Use this to generate your first PRD draft in one go.

---

**CONTEXT**

I've completed the inspiration phase of my project and I want to move to formal requirements. I have clear thinking on the problem, users, and feature ideas. Now I need you to help me draft a complete PRD.

**INSPIRATION PHASE SUMMARY**

Project Concept: [Copy your core concept from inspo.md]

Primary Users: [Copy description of 1-2 key personas]

Core Problems Being Solved: [List the 2-3 main problems]

Planned Features: [List your must-have and nice-to-have features]

Tech Stack Thinking: [Any initial tech thoughts]

Scope: [Your rough timeline/scope estimate]

**TASK**

Generate a comprehensive PRD using the structure below. Make it specific enough that a developer could read it and understand exactly what to build, but not so detailed that implementation decisions are locked in.

For each feature, create a user story that follows the pattern: "As a [persona], I want to [action], so that [benefit]."

Flag any requirements that seem in tension or might create complexity.

**OUTPUT FORMAT**

Structure the PRD with these sections:
- Executive Summary (2 paragraphs)
- Problem Statement
- Goals & Success Metrics (with specific, measurable targets)
- User Personas (detailed profiles of your 1-2 primary users)
- Core Features (5-8 features, each with user story and acceptance criteria)
- Technical Considerations (tech stack, integrations, performance)
- User Experience (primary user flows)
- Launch Criteria
- Risks & Assumptions
- Open Questions

---

## Prompt 2: Feature & Acceptance Criteria Refinement

Use this after your first PRD draft to strengthen the feature specifications.

---

**CONTEXT**

I have a PRD draft, but I want to make sure my feature definitions and acceptance criteria are specific and testable. Vague acceptance criteria lead to misunderstandings during development.

**TASK**

Here are my planned features for [Project Name]:

[List your features, current descriptions, and acceptance criteria]

For each feature, please:

1. Tighten the description to be more specific (what exactly does the user see/do?)
2. Rewrite acceptance criteria to be testable (avoid subjective terms like "performant" or "user-friendly")
3. Identify any acceptance criteria that might be ambiguous and flag them
4. Suggest any missing acceptance criteria that would make the feature clearer

**OUTPUT FORMAT**

For each feature:
- Current Description → Refined Description
- Acceptance Criteria (before/after)
- Ambiguous Items & Clarifications Needed
- Missing Criteria (suggested additions)

---

## Prompt 3: User Story Validation

Use this to validate that your user stories are well-formed and that features solve real needs.

---

**CONTEXT**

I want to validate that my user stories are clear and that each feature actually solves a real user problem.

**TASK**

Here are my user personas and planned features:

**Personas**:
[Copy your persona descriptions]

**Feature List**:
[List your features with their current user stories]

For each feature:

1. Validate that the user story clearly states who, what, and why
2. Check if the feature actually solves the problem stated in the user story
3. Identify any features that might be solving the wrong problem or solving a problem for the wrong user
4. Flag any features where the "why" (benefit) is unclear

Also, identify any user persona needs that aren't addressed by your features.

**OUTPUT FORMAT**

- Well-Formed User Stories (which ones are good as-is)
- User Stories Needing Refinement (why, and suggested rewording)
- Features vs. User Needs Gap Analysis (needs that aren't covered)
- Orphaned Features (features that don't clearly solve a user need)

---

## Prompt 4: Success Metrics Definition

Use this to define specific, measurable success criteria.

---

**CONTEXT**

I want to define how I'll know if this project is successful. Success metrics should be specific and measurable, not vague aspirations.

**TASK**

Here's what I'm trying to build:

[Project concept and goals]

Here's who I'm building it for:

[Persona descriptions]

Here's the problem I'm solving:

[Problem statement]

Please help me define success metrics that are:

1. Specific (not vague)
2. Measurable (I can collect data on these)
3. User-focused (they measure real user value, not just technical metrics)
4. Achievable (reasonable to hit in your timeframe)

For each goal, provide:
- Metric name
- How to measure it
- Current baseline (if known)
- Target / success threshold
- Measurement frequency

**OUTPUT FORMAT**

Primary Goals:
- Goal 1: [Metric, How to Measure, Target]
- Goal 2: [Metric, How to Measure, Target]

Secondary Metrics (optional to hit, but good to track):
- Metric 1: [Metric, How to Measure, Target]

---

## Prompt 5: Risk & Assumption Analysis

Use this to think through what could go wrong and validate your core assumptions.

---

**CONTEXT**

Before I lock in my requirements, I want to identify the risks and validate that my core assumptions are sound.

**TASK**

Here's my project:

[Project concept]

Here are my core assumptions:

[List what you're assuming about users, technology, market, or feasibility]

Please:

1. Validate which assumptions are safe (you're pretty confident about these)
2. Flag which assumptions are risky (these could easily be wrong)
3. For each risky assumption, suggest how you could validate it before or early in development
4. Identify technical or scope risks that could cause problems
5. For each risk, suggest mitigation strategies

Also note: are there any hidden assumptions I haven't listed?

**OUTPUT FORMAT**

Safe Assumptions: (low risk, don't need validation)

Risky Assumptions: (could derail the project if wrong)
- Assumption: [Description]
- Risk Level: High / Medium
- How to Validate: [What would prove this right or wrong?]
- Mitigation: [What would you do if this assumption is wrong?]

Technical / Scope Risks: (things that could go wrong during implementation)
- Risk: [Description]
- Likelihood: High / Medium / Low
- Impact: High / Medium / Low
- Mitigation: [How would you handle this?]

Suggested Pre-Development Validation: (small tests before starting development)

---

## Prompt 6: PRD Review & Feedback Loop

Use this late in the Requirements phase if you want Claude to review your PRD draft for completeness and clarity.

---

**CONTEXT**

I've drafted a complete PRD and want feedback before I lock it in and move to Planning phase. Is it clear? Are there gaps?

**TASK**

Please review this PRD and assess whether it provides enough clarity for someone to start planning implementation:

[Paste your complete PRD draft]

For each section, please:

1. Note what's clear and specific
2. Flag anything that's vague or could be misunderstood
3. Identify missing sections or information
4. Suggest what could be cut (is anything redundant or unnecessary?)
5. Highlight any requirements that seem in tension or might conflict

**OUTPUT FORMAT**

Section-by-Section Review:
- Section Name: [Strengths] | [Gaps or Vague Areas] | [Suggestions]

Overall Assessment:
- Ready to Lock In? Yes / No / Mostly
- Key Issues: [Top 2-3 things to address before moving to Planning]
- Missing from PRD: [What should be added?]

---

## Workflow: How to Use These Prompts

**Step 1**: Use Prompt 1 to generate initial PRD from inspiration work

**Step 2**: Review Claude's output; identify sections that need refinement

**Step 3**: Use Prompt 2 or 3 to refine the specific sections that are weak

**Step 4**: If you're unsure about success metrics, use Prompt 4

**Step 5**: Use Prompt 5 to validate assumptions before locking in

**Step 6**: Do a final review with Prompt 6 or just review yourself

**Step 7**: Lock the PRD and move to Planning phase

---

## Pro Tips for Requirements Phase

**Don't Over-Specify Implementation**: Your PRD should define the "what" and "why," not the "how." Avoid prescribing specific code patterns or technical approaches at this stage.

**User-Centered Thinking**: Every feature and acceptance criterion should tie back to a user need or problem. If you can't explain why something is there, it might not be necessary.

**Testability**: Write acceptance criteria you can actually test. "The UI is intuitive" is not testable. "New users can complete onboarding in under 3 minutes without external help" is testable.

**Lock When Ready, Not When Perfect**: Your PRD doesn't need to be perfect to move to Planning. It needs to be clear enough to guide design and development. You can refine details during Planning phase.

**Reference Inspiration Work**: Keep your inspo.md and PRD linked. The PRD should feel like a natural evolution of the inspiration work, not a departure from it.

---

## When PRD is Complete

✓ You have a clear problem statement and know exactly who you're solving for  
✓ Each feature has a user story that explains why it matters  
✓ Acceptance criteria are specific and testable  
✓ Success metrics are measurable  
✓ Risks and assumptions are documented  
✓ You could hand this to a developer and they'd understand what to build  
✓ You feel confident enough to move to detailed Planning
