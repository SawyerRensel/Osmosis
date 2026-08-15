---
title: Osmosis
description: Absorb knowledge faster. An Obsidian plugin that turns your notes into interactive mind maps you study with spaced repetition.
hide:
  - navigation
  - toc
---

<div class="osmosis-home">

<!-- ===================== Hero ===================== -->
<section class="osmosis-hero">
  <div class="osmosis-hero__grid">
    <div class="osmosis-hero__copy">
      <h1>Absorb knowledge faster.</h1>
      <p class="osmosis-hero__sub">
        An Obsidian plugin that turns your notes into interactive mind maps you study with spaced repetition.
      </p>
      <div class="osmosis-hero__actions">
        <a class="osmosis-btn osmosis-btn--primary" href="obsidian://show-plugin?id=osmosis">Install Osmosis</a>
        <a class="osmosis-btn osmosis-btn--ghost" href="getting-started/quick-start/">Quick start &rarr;</a>
      </div>
      <p class="osmosis-hero__note">Free and open source &middot; GPL-3.0 &middot; Requires Obsidian 1.13+</p>
    </div>
    <div class="osmosis-hero__media">
      <!-- MEDIA SWAP — video V1 (note ↔ map two-way edit loop). Replace the <img>
           below with:

           <video class="osmosis-media" autoplay loop muted playsinline
                  poster="assets/media/osmosis_v1_poster.png">
             <source src="assets/media/osmosis_v1_two_way_edit.webm" type="video/webm">
             <source src="assets/media/osmosis_v1_two_way_edit.mp4" type="video/mp4">
           </video>
           <img class="osmosis-media osmosis-media__fallback"
                src="assets/media/osmosis_v1_poster.png"
                alt="An Obsidian note and its Osmosis mind map side by side">

           The fallback pair is what the reduced-motion rules in home.css expect. -->
      <img class="osmosis-media"
           src="assets/media/osmosis_note_mind_map_split_view_zoomed.png"
           alt="An Obsidian note and its Osmosis mind map side by side">
    </div>
  </div>
</section>

<!-- ===================== Pillars ===================== -->
<section class="osmosis-band osmosis-band--tight">
  <div class="osmosis-home__inner">
    <ul class="osmosis-pillars">
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 10 10 0 0 0-10-9z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/></svg>
        <h3>One note, three views</h3>
        <p>The same Markdown file is a note, an editable mind map, and a deck of flashcards.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>
        <h3>Study where you learned it</h3>
        <p>Review in a modal, inline in the note that taught you, or on the map itself.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>
        <h3>Your data stays yours</h3>
        <p>Cards, schedules, and review history are plain text in your vault. No database, no account.</p>
      </li>
    </ul>
  </div>
</section>

<!-- ===================== Mind maps ===================== -->
<section class="osmosis-band">
  <div class="osmosis-home__inner osmosis-band__head">
    <p class="osmosis-home__eyebrow">Mind maps</p>
    <h2>Think in shapes, write in Markdown.</h2>
    <p class="osmosis-band__lead">
      Headings become branches. Lists become nodes. Every edit on the map is an
      edit to the file.
    </p>
  </div>

  <div class="osmosis-home__inner">
    <ul class="osmosis-mediacards">
      <li>
        <h3>An editor, not a viewer</h3>
        <p>
          Add a node, drag a branch under a new parent, fold a subtree. Your
          Markdown updates immediately, block IDs and card history intact.
          <a class="osmosis-story__link" href="mind-mapping/editing/">Editing and shortcuts &rarr;</a>
        </p>
        <div class="osmosis-mediacards__shot">
          <!-- MEDIA SWAP: video V2 (add node, drag branch, fold subtree) -->
          <img src="assets/media/osmosis_mind_map_drag_and_drop_node_repositioning.png"
               alt="Dragging a node to a new parent in an Osmosis mind map">
        </div>
      </li>
      <li>
        <h3>Thirteen themes, or your own</h3>
        <p>
          Layout, spacing, branch lines, and per-node shape and colour — all
          saved in the note's frontmatter, so a map travels with its file.
          <a class="osmosis-story__link" href="mind-mapping/styling/">Styling &rarr;</a>
        </p>
        <div class="osmosis-mediacards__shot">
          <img src="assets/media/osmosis_mind_map_ocean_theme.png"
               alt="An Osmosis mind map in the Ocean theme">
        </div>
      </li>
      <li>
        <h3>Maps inside maps</h3>
        <p>
          Embed a note with <code>![[note]]</code> and its structure becomes a
          sub-branch you can edit in place.
          <a class="osmosis-story__link" href="mind-mapping/#transclusion">Transclusion &rarr;</a>
        </p>
        <div class="osmosis-mediacards__shot">
          <img src="assets/media/osmosis_mind_map_transclusion_split_view.png"
               alt="A master map with an embedded note rendered as a sub-branch">
        </div>
      </li>
      <li>
        <h3>Safe to explore</h3>
        <p>
          Reading mode makes a map read-only: pan, zoom, fold, and study still
          work, but nothing moves by accident.
          <a class="osmosis-story__link" href="mind-mapping/#reading-mode">Reading mode &rarr;</a>
        </p>
        <div class="osmosis-mediacards__shot">
          <!-- MEDIA SWAP: still S14 (mind map in reading mode on a phone) -->
          <img src="assets/media/osmosis_mind_map_default_theme.png"
               alt="Placeholder: a mind map open in reading mode">
        </div>
      </li>
    </ul>
  </div>
</section>

<!-- ===================== Flashcards ===================== -->
<section class="osmosis-band">
  <section class="osmosis-story">
    <div class="osmosis-story__copy">
      <p class="osmosis-home__eyebrow">Flashcards</p>
      <h2>Cards that live in your notes.</h2>
      <p class="osmosis-story__body">
        Write a card where the idea comes up. Six ways to make one, all landing
        in the Markdown file you were already writing.
      </p>
      <ul class="osmosis-story__list">
        <li>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m6.08 10.37-3.48 1.58a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59"/></svg>
          <p><strong>Five card types.</strong> Basic, bidirectional, type-in, cloze, and code cloze — all from one <code>osmosis</code> fence.</p>
        </li>
        <li>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></svg>
          <p><strong>Image occlusion.</strong> Mask a diagram with rectangles, ellipses, and polygons. Each group of masks is its own card.</p>
        </li>
        <li>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
          <p><strong>Rapid capture.</strong> Blank lines commit cards as you type — built for making them on a phone.</p>
        </li>
        <li>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M3 7.5h4"/><path d="M3 12h4"/><path d="M3 16.5h4"/><path d="M17 7.5h4"/><path d="M17 12h4"/><path d="M17 16.5h4"/></svg>
          <p><strong>Whole notes, as cards.</strong> One command turns every eligible line into a scheduled card, anchored by a native block ID.</p>
        </li>
      </ul>
      <a class="osmosis-story__link" href="flashcards/card-types/">See the card types &rarr;</a>
    </div>
    <div class="osmosis-story__media">
      <!-- MEDIA SWAP: video V3 (fence → review → flip → grade) -->
      <img class="osmosis-media"
           src="assets/media/osmosis_sequential_study_flashcard_answer_frontback.png"
           alt="An Osmosis flashcard showing its answer during review">
    </div>
  </section>
</section>

<!-- ===================== Studying ===================== -->
<section class="osmosis-band">
  <div class="osmosis-home__inner osmosis-band__head osmosis-band__head--start">
    <p class="osmosis-home__eyebrow">Studying</p>
    <h2>Three ways to study the same card.</h2>
    <p class="osmosis-band__lead">
      Every card type works in every mode, scheduled by FSRS — a scheduler
      built on memory research. Rate a card anywhere and its schedule moves
      everywhere.
    </p>
    <a class="osmosis-story__link" href="studying/study-modes/">Compare study modes &rarr;</a>
  </div>

  <div class="osmosis-home__inner">
    <ul class="osmosis-pillars">
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="6" height="6" x="16" y="16" rx="1"/><rect width="6" height="6" x="2" y="16" rx="1"/><rect width="6" height="6" x="9" y="2" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>
        <h3>On the map</h3>
        <p>Due nodes hide behind placeholders while the rest of the map stays visible — you recall a fact with everything it connects to still on screen.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M8 13h4"/><path d="M8 17h6"/></svg>
        <h3>In the note</h3>
        <p>Contextual study hides what's due, reveals it in place, and lets you rate it and keep reading. Peek mode hides everything and records nothing.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 8h8"/><path d="M8 13h5"/><path d="M8 18h3"/></svg>
        <h3>In a modal</h3>
        <p>Sequential study is the classic deck run: one card at a time, with multi-level undo that restores a card's previous schedule, not just the last screen.</p>
      </li>
    </ul>

    <div class="osmosis-band__media">
      <!-- MEDIA SWAP: video V4 (spatial study: reveal + grade) -->
      <img class="osmosis-media"
           src="assets/media/osmosis_spatial_study_mode_revealed.png"
           alt="Spatial study mode revealing a card answer on the mind map">
    </div>
  </div>
</section>

<!-- ===================== Dashboard ===================== -->
<section class="osmosis-band">
  <div class="osmosis-home__inner osmosis-band__head">
    <p class="osmosis-home__eyebrow">Dashboard</p>
    <h2>Know whether it's working.</h2>
    <p class="osmosis-band__lead">
      Decks and due counts in the sidebar; a full card browser and seventeen
      panels of statistics in the main area.
    </p>
  </div>

  <div class="osmosis-home__inner">
    <ul class="osmosis-mediacards">
      <li>
        <h3>Seventeen panels, one of them nobody else has</h3>
        <p>
          A year-long heatmap, true retention, interval and stability, answer
          buttons, and your load for the weeks ahead — plus recall by study mode,
          which tells you whether studying in context actually works.
          <a class="osmosis-story__link" href="dashboard/statistics/">Statistics &rarr;</a>
        </p>
        <div class="osmosis-mediacards__shot">
          <img src="assets/media/osmosis_stats_dashboard.png"
               alt="The Osmosis statistics dashboard, showing card counts, retrievability, reviews, and a calendar heatmap">
        </div>
      </li>
      <li>
        <h3>Every card in the vault, in one table</h3>
        <p>
          The browser is a Bases view, so Obsidian's own filtering narrows it to
          the notes you care about. Then suspend, reset, change deck, or delete —
          with session undo behind all four.
          <a class="osmosis-story__link" href="dashboard/card-browser/">Card browser &rarr;</a>
        </p>
        <div class="osmosis-mediacards__shot">
          <img src="assets/media/osmosis_browser_card_layout.png"
               alt="The Osmosis card browser in its cards layout">
        </div>
      </li>
    </ul>
  </div>
</section>

<!-- ===================== Your data ===================== -->
<section class="osmosis-band">
  <section class="osmosis-story osmosis-story--reverse">
    <div class="osmosis-story__copy">
      <p class="osmosis-home__eyebrow">Your data</p>
      <h2>Plain Markdown. Forever.</h2>
      <p class="osmosis-story__body">
        A card's schedule lives in the fence that holds it, or in the note's
        frontmatter beside the line it belongs to. Your vault syncs the way it
        always has — Obsidian Sync, iCloud, Dropbox, Git — and your review
        history goes with it.
      </p>
      <p class="osmosis-story__body">
        Because it is only ever text, an AI assistant can read and write your
        study material natively. No export, no conversion, no lock-in.
      </p>
      <a class="osmosis-story__link" href="reference/data-storage/">How it's stored &rarr;</a>
    </div>
    <div class="osmosis-story__media">

````markdown
## Ownership and borrowing

- Each value has exactly one owner ^b3f1a2

```osmosis
id: os-3jds9x
due: 2026-05-02T19:52:12.592Z
stability: 2.0215
difficulty: 6.3909
reps: 3
lapses: 0
state: review
last-review: 2026-04-30T19:52:12.592Z
learning-steps: 0

What happens when an owner goes out of scope?
***
The value is dropped and its memory freed.
```
````

  </div>
  </section>
</section>

<!-- ===================== Feature grid ===================== -->
<section class="osmosis-features">
  <div class="osmosis-home__inner">
    <h2>And a great deal more</h2>
    <ul class="osmosis-features__grid">
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
        <h3>Two-way everything</h3>
        <p>Edit the note, the map, or the card — the other two follow, immediately.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M6 12h.001"/><path d="M18 12h.001"/><path d="M10 12h4"/><path d="M7 16h10"/></svg>
        <h3>Keyboard first</h3>
        <p>Full keyboard control of map editing, navigation, and a review session.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/></svg>
        <h3>Built for mobile</h3>
        <p>Touch gestures throughout, a reading-mode default for phones, and capture designed for thumbs.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h3"/></svg>
        <h3>Rich nodes</h3>
        <p>Images, LaTeX, code blocks, tables, callouts, checkboxes, and embeds render inside the map.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
        <h3>Undo that fits the map</h3>
        <p>Map edits have their own history — one step per operation, with configurable depth and memory.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        <h3>Opt in, or opt out</h3>
        <p>Per note, per folder, per tag — and exclusion always wins, so a vault-in-a-vault stays out.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M3 7.5h4"/><path d="M3 12h4"/><path d="M3 16.5h4"/><path d="M17 7.5h4"/><path d="M17 12h4"/><path d="M17 16.5h4"/></svg>
        <h3>Native block IDs</h3>
        <p>Cards anchor to Obsidian's own <code>^block-ids</code>, so <code>[[note#^id]]</code> links work and history survives edits.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M12 7v5l3 3"/></svg>
        <h3>Every review, logged</h3>
        <p>An append-only history in your vault, per month and per device, that syncs with your notes.</p>
      </li>
      <li>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
        <h3>Free and open source</h3>
        <p>GPL-3.0, developed in the open, with no account and no paid tier.</p>
      </li>
    </ul>
  </div>
</section>

<!-- ===================== Closing CTA ===================== -->
<section class="osmosis-cta">
  <div class="osmosis-home__inner">
    <h2>Start with one note.</h2>
    <p>
      Open any Markdown file you already have, press the mind map button, and
      look at your own structure. Nothing to import, nothing to convert.
    </p>
    <div class="osmosis-cta__actions">
      <a class="osmosis-btn osmosis-btn--primary" href="obsidian://show-plugin?id=osmosis">Install Osmosis</a>
      <a class="osmosis-btn osmosis-btn--ghost" href="getting-started/">Read the docs &rarr;</a>
    </div>
  </div>
</section>

</div>
