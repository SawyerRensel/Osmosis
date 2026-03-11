---
osmosis-cards: true
osmosis-styles:
  theme: catppuccin-mocha
---

# Project Management

Obsidian can serve as a lightweight but powerful project management tool, especially for solo practitioners and small teams who want to keep project context alongside their knowledge base.

## Project Hierarchy

### Organization Structure
- Workspace
	- Contains all active and archived projects
	- One vault = one workspace (recommended)
- Program
	- Group of related projects with a shared goal
	- Example: "Q1 Product Launch" containing multiple projects
	- Has its own hub note linking to constituent projects
- Project
	- Defined goal, deadline, and deliverables
	- Has a dedicated project note
	- Contains tasks, references, and meeting notes
	- Statuses
		- Planning
		- Active
		- On hold
		- Complete
		- Archived
- Milestone
	- Major checkpoint within a project
	- Linked to specific deliverables
	- Has a target date
- Task
	- Atomic unit of work
	- Assignable, estimable, trackable
	- Lives in project notes or daily notes
	- Statuses
		- To do
		- In progress
		- Blocked
		- Done

## Project Status Tracking

| Project | Status | Priority | Due Date | Owner | Progress |
|---------|--------|----------|----------|-------|----------|
| Knowledge Base Audit | Active | High | 2026-03-15 | Self | 60% |
| Plugin Evaluation | Active | Medium | 2026-03-20 | Self | 30% |
| Workflow Documentation | Planning | Low | 2026-04-01 | Self | 10% |
| Template Library | On Hold | Medium | TBD | Self | 45% |
| Annual Review System | Complete | High | 2026-02-28 | Self | 100% |

## Project Note Template

Every project gets a dedicated note with this structure:

### Metadata
- Status, priority, due date, stakeholders
- Links to parent program or area

### Objective
- One sentence: what does "done" look like?
- Success criteria (measurable)

### Tasks
- [ ] Define project scope and deliverables
- [ ] Identify dependencies and blockers
- [ ] Create milestone schedule
- [ ] Set up tracking (status table or Kanban)
- [ ] Complete first deliverable
- [ ] Review and iterate
- [ ] Final delivery and retrospective

### References
- Links to relevant notes, articles, and resources
- Meeting notes linked chronologically

### Log
- Running journal of decisions, progress, and blockers
- Reverse chronological (newest first)

## Task Management Patterns

### Centralized Tasks (Tasks Plugin)
- All tasks live in their respective notes
- Query tasks across vault with Dataview or Tasks plugin
- Example query: "Show all tasks due this week, grouped by project"

### Kanban Boards
- Visual project tracking with the Kanban plugin
- Columns: Backlog, To Do, In Progress, Review, Done
- Cards link to detailed notes
- Best for: projects with many parallel tasks

### Daily Task Flow
1. Morning: pull tasks from project notes into today's daily note
2. During day: work through tasks, update status
3. Evening: move incomplete tasks back to project notes or forward to tomorrow

## Resource Allocation

### Time Blocking with Notes
- Create a "Week Plan" note each Monday
- Block time for each active project
- Link time blocks to project notes
- Review actual vs planned at week's end

### Energy-Based Scheduling
- High energy tasks
	- Deep writing and analysis
	- Architecture and design decisions
	- Learning new complex topics
- Medium energy tasks
	- Processing inbox and notes
	- Meeting preparation
	- Routine project updates
- Low energy tasks
	- Organizing and tagging notes
	- Reviewing flashcards
	- Filing and archiving

## Retrospectives

After each project completes:

### What Went Well
- Capture successes and effective patterns
- Link to relevant notes for future reference

### What Could Improve
- Identify friction points and bottlenecks
- Propose specific changes for next time

### Key Learnings
- Distill into permanent notes
- Create flashcards for important takeaways
- Link to relevant knowledge areas

---

## Flashcards

```osmosis
id: pkm-pm-001
stability: 30.5
difficulty: 0.25
due: 2026-03-30T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 15
lapses: 0
state: review

What are the five levels of project hierarchy in an Obsidian-based project management system?
***
Workspace, Program (group of related projects), Project (defined goal and deadline), Milestone (major checkpoint), and Task (atomic unit of work)
```

```osmosis
id: pkm-pm-002
stability: 0.3
difficulty: 0.68
due: 2026-03-10T16:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 9
lapses: 2
state: relearning

What three sections should a project retrospective include?
***
1) What went well (successes and effective patterns), 2) What could improve (friction points and proposed changes), 3) Key learnings (distilled into permanent notes and flashcards)
```

```osmosis
id: pkm-pm-003

What is the daily task flow pattern for Obsidian project management?
***
Morning: pull tasks from project notes into daily note. During day: work through tasks and update status. Evening: move incomplete tasks back to project notes or forward to tomorrow.
```
