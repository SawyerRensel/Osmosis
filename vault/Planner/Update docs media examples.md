---
title: Update docs media examples
summary: Current screenshots are outdated
tags:
  - task
calendar:
  - Documentation
context:
people:
location:
related:
status: To-Do
priority:
progress_current:
progress_total:
date_created: 2026-08-03T17:07:23.327Z
date_modified: 2026-08-03T21:48:05.081Z
date_start_scheduled:
date_start_actual:
date_end_scheduled:
date_end_actual:
all_day: false
repeat_frequency:
repeat_interval:
repeat_until:
repeat_count:
repeat_byday:
repeat_bymonth:
repeat_bymonthday:
repeat_bysetpos:
repeat_completed_dates:
parent:
children:
blocked_by:
cover:
color:
---
## Description of the Documentation Request

*Provide a clear and concise description of what documentation is missing, incorrect, or needs improvement.*



## Target Audience

*Who is this documentation for? (e.g., First-time users, Advanced developers, Contributors, System Admins)*



## Existing Material or Context

*Link to existing pages in this repository, external resources, or past discussions/issues that provide context for this request.* 

- Link to relevant doc: [Link text](URL)
- Related issue or PR: # 

## Proposed Content / Outline

*If you have ideas on what the new structure should look like, sketch out a brief outline or bullet points here.* 

## Media to capture

**Rules for all of them:**

- **Close the Map settings sidebar.** It's open in nearly every current screenshot and eats ~30% of the frame.
- **Use real content.** Every existing asset is the `mixed-content` test fixture — "First bullet point", "Animals → Mammals → Dogs". That's the bigger marketing problem, more than the layout was. Your `..._rust_crate_ecosystem.png` is the right instinct. Neutral domains: software architecture, music theory, history, statistics, language learning.
- One Obsidian theme + one map theme throughout (except V5). 1600×1000 logical, 2× DPI. Collapse the left ribbon.

**Videos** — MP4 (H.264 `yuv420p`) _and_ WebM (VP9), silent. Start and end on the same frame so the loop is seamless; move the cursor slowly. Export frame 1 of each as a PNG poster.

| | Len | Shot |
|---|---|---|
| **V1** | 10–12s | **Hero.** Split view, note left / map right. Type into a node — Markdown updates. Then edit a heading — the node updates. This one loop is the whole pitch.|
|**V2**|8–10s|Add a node, drag a branch, fold a subtree. Markdown pane visible.|
|**V3**|8–10s|`osmosis` fence in a note → launch review → flip → grade.|
|**V4**|8s|Spatial study: reveal a card in place, grade it. Frame wide enough that the surrounding map structure shows — that's the point of the mode.|
|**V5**|6s|_Optional._ Same map cycling Default → Ocean → Monokai → Solarized.|

**Stills** — PNG, 2×, cropped tight to the subject.

| |Shot|
|---|---|
|**S1**|V1's poster frame. Doubles as the social card.|
|**S2**|Study dashboard, realistic decks, non-zero due counts. The current one is unusably small.|
|**S3**|One card, question + answer — two files, identical framing, card modal only.|
|**S4**|Code cloze, question + answer, with real code.|
|**S5**|Transclusion: master map with an embedded sub-map, nesting obvious.|
|**S6**|_Optional_ — I already render this as a code block on the page. Skip unless you'd rather show the real editor.|
|**S7**|Map settings sidebar alone, cropped. For the docs pages, not the homepage.|

Plus a **1200×630 OG image** (S1 cropped) — link previews are currently pointing at a placeholder.

Send me a screenshot of the page as it stands and I'll fix whatever's off before the media swap. Headline wording (_"Absorb what you read."_) is a first draft — say the word if you want alternatives.

## Additional Information

*Add any other context, code snippets, or screenshots about the documentation request here.*