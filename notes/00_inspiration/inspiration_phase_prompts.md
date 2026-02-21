# Inspiration Phase: Prompts for Claude

Use these prompts to accelerate your brainstorming with Claude. Each prompt is designed around Claude 4.5's strengths: clear structure, appreciation for explicit context, and ability to generalize from examples.

## Prompt 1: Initial Concept Exploration

Use this when you have a rough idea but need to clarify and expand your thinking.

---

**CONTEXT**

I'm in the early brainstorming phase of a new project. I have an initial concept but I want to explore it thoroughly with you before committing to requirements.

**TASK**

Help me explore and validate this concept:

**PROJECT CONCEPT**: [Paste your 2-3 sentence core idea from inspo.md]

I want you to:

1. Ask clarifying questions about what problem this solves and who it's for
2. Identify the core value proposition (the one thing it does better than alternatives)
3. Suggest 3-5 variations of this idea that lean into different aspects
4. Flag potential scope creep issues before I build a PRD

**OUTPUT FORMAT**

- Clarifying Questions (5-7 bullets, with explanation of why each matters)
- Core Value Proposition (1-2 sentences)
- Three Concept Variations (each 2-3 sentences describing a different approach or focus)
- Scope Creep Warnings (what features sound good but might expand scope problematically)

---

## Prompt 2: Competitive Landscape & Positioning

Use this after you've clarified your core concept to understand the landscape.

---

**CONTEXT**

I want to understand where my concept fits in the existing landscape and how it's different.

**TASK**

Given this concept: [Your core concept]

Please:

1. Identify 3-5 existing products/tools that address similar problems (broadly or narrowly)
2. For each one, note what they do well and what gaps they have
3. Identify the specific niche or approach where my concept could be unique
4. Suggest 2-3 positioning statements I could use to describe this project

**OUTPUT FORMAT**

- Competitive Landscape Table (Product/Tool, Strengths, Gaps, Target User)
- Your Unique Angle (1-2 paragraphs about where you fit differently)
- Three Positioning Statements (each a single sentence you could use to describe this to someone unfamiliar with it)

---

## Prompt 3: User & Use Case Definition

Use this to think through who this is actually for and how they'll use it.

---

**CONTEXT**

I want to define the user personas and primary use cases clearly before moving to requirements.

**TASK**

Based on this project concept: [Your concept]

Please:

1. Describe 2-3 user personas who would benefit from this project
2. For each persona, describe their primary use case (what they'd do, why it matters to them)
3. Identify secondary use cases or user types
4. Flag any user needs that seem in tension (where serving one user type might conflict with serving another)

**OUTPUT FORMAT**

For each primary persona:
- Name & Role
- Current Problem (what's hard right now)
- How Your Project Helps (specific benefit)
- Success Metric for This User (how would they know it's working?)

Secondary Personas: (bullet list)

Potential Tensions: (conflicts between user needs, with suggested mitigation)

---

## Prompt 4: Feature Brainstorm with Prioritization

Use this after you understand the user to brainstorm features strategically.

---

**CONTEXT**

I want to brainstorm possible features but organize them by importance and scope impact, not just capture everything.

**TASK**

Given this project: [Brief concept description]

These are my target users: [Brief description of 1-2 primary personas]

Please:

1. Generate 15-20 possible features this project could include
2. For each feature, categorize it as: Core (must-have), Enhancement (nice-to-have), or Future (interesting but not essential)
3. Identify which features would be highest-effort to implement
4. Suggest the minimum feature set to create value for at least one user persona

**OUTPUT FORMAT**

- Core Features (with brief description of why each is core)
- Enhancement Features (with estimated scope impact: small/medium/large)
- Future Features (interesting possibilities)
- Minimum Viable Feature Set (the 3-5 features you'd build first)

---

## Prompt 5: Scope & Feasibility Check

Use this toward the end of inspiration phase to reality-check your ambitions.

---

**CONTEXT**

Before I write formal requirements, I want to honestly assess whether this project's scope matches the time and resources I can commit.

**TASK**

Given this project concept:

[Your concept description]

Core Features (as you currently envision them):
- [Feature 1]
- [Feature 2]
- [Feature 3]
- [Feature 4]

Constraints (what I'm working with):
- Estimated time: [e.g., "2 weeks", "1 month", "3 months"]
- Team size: [e.g., "just me", "me + 1 developer"]
- Tech stack: [Your general tech thoughts, or "TBD"]

Please:

1. Estimate realistic timeline for core features
2. Identify what might need to be cut if timeline is tight
3. Suggest a "phased launch" approach (what ships in v1, v2, etc.)
4. Flag any features that seem disproportionately complex relative to their value
5. Identify the riskiest assumptions (things that might take longer than expected)

**OUTPUT FORMAT**

- Honest Timeline Assessment (how long realistically?)
- Scope Reduction Suggestions (if needed)
- Phased Launch Plan (v1 includes X, v2 includes Y)
- Complexity-to-Value Analysis (any features that might not be worth the effort?)
- Key Risks (technical, scope, or otherwise)

---

## Tips for These Prompts

**Adapt them to your style**: These are templates. Feel free to adjust language, remove sections you don't need, or combine prompts if you're in a long conversation with Claude.

**Stack prompts in sequence**: You can run Prompt 1 → Prompt 3 → Prompt 5 in a single conversation. Claude maintains context well across multiple requests.

**Use examples if format matters**: If you want the output in a specific format, show Claude an example first.

**Validate Claude's assumptions**: When Claude asks clarifying questions or makes assumptions, validate them. This trains Claude to understand your specific situation.

**Export for team review**: If others will review your work, copy Claude's output into your inspo.md or a shared document for feedback.

---

## How to Use These in Claude

1. Copy the prompt you want to use
2. Paste it into Claude
3. Fill in the bracketed sections [like this]
4. Run it
5. Review Claude's output for accuracy (Claude sometimes makes assumptions—validate them)
6. Copy key insights into the relevant section of inspo.md
7. Ask follow-up questions to deepen specific areas

**Pro tip**: Don't try to do all 5 prompts in one session. Space them across 2-3 conversations so you have time to reflect and refine your thinking between Claude interactions.
