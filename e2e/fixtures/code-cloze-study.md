---
osmosis-cards: true
osmosis-deck: Testing/Code Cloze
---

# Code cloze, studied in every mode

`code_cloze` is the one card type that has never been put in front of a reader.
It rides the same path every other fence type takes — the note and the map play
whatever cards the store holds for a fence, and the generator fans a code cloze
out per `cN` exactly as it does a prose one — so it is *expected* to work. This
fixture is what proves it.

Four questions are due here: two in the SQL fence, one in the TypeScript fence,
one in the CSS fence. The pill in Note view and the banner in Mind Map View
should both read `0/4`.

What makes a code cloze different from a prose one is **height**. A prose cloze
swaps a word for `░░░░░░░░`; a code cloze swaps a whole line — or a whole
region — for one blank line, so its front and its back are different sizes. On
the map a node keeps the size it was laid out at, so the TypeScript fence below
is the case most likely to clip. That is the thing to watch here.

**A cloze reveals in place, in every surface.** Answering one replaces the
blanked passage with the filled-in one rather than printing the answer
underneath — one body of text, in the note and on the map alike. Only a basic or
bidirectional fence keeps both halves on screen, because there the answer does
not contain the question. Before this was fixed, a cloze node on the map carried
its passage twice and was twice as tall as it needed to be.

## Two lines, two cards — the trailing-comment marker

Each `-- osmosis-cloze` with no `cN` label is its own group, so this fence is
**two** questions: `1/2` blanks the `FROM` line and leaves `GROUP BY` readable,
`2/2` does the reverse. Both are due.

Before anyone presses Study, the fence reads the way live preview draws it:
every marked line blanked above, the whole query below. Blanking is a question,
and nobody has asked one yet.

````osmosis
id: ccs-sql01
c1:
  due: 2026-08-09T09:00:00.000Z
  stability: 4.1000
  difficulty: 5.7000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-05T09:00:00.000Z
  learningSteps: 0
c2:
  due: 2026-08-10T09:00:00.000Z
  stability: 3.4000
  difficulty: 6.0000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-06T09:00:00.000Z
  learningSteps: 0

```sql
SELECT department, AVG(salary) AS avg_salary
FROM employees  -- osmosis-cloze
GROUP BY department  -- osmosis-cloze
HAVING AVG(salary) > 50000;
```
````

Answer both and press **Stop**: `c1:` and `c2:` should each carry a new `due`
and an incremented `reps`, on separate timestamps.

## One region, one card — the start/end block

`osmosis-cloze-start` … `osmosis-cloze-end` blanks everything between the two
markers as a single card, so this fence is **one** question and shows no step
counter. The region is eight lines long and collapses to one blank line, which
is the height gap to watch: on the map the answer is revealed underneath a
question a third its size, inside a node measured for the fence's full text.

````osmosis
id: ccs-retry01
c1:
  due: 2026-08-08T09:00:00.000Z
  stability: 2.6000
  difficulty: 6.4000
  reps: 1
  lapses: 0
  state: review
  lastReview: 2026-08-06T09:00:00.000Z
  learningSteps: 0

```typescript
async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
    // osmosis-cloze-start
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === attempts - 1) throw err;
            await delay(2 ** i * 100);
        }
    }
    // osmosis-cloze-end
    throw new Error("unreachable");
}
```
````

## Two lines, one card — the labelled marker

A `cN` label is how two lines become **one** question: both `-c1` lines blank
together, and the unlabelled `height` line stays put. One question, no step
counter.

This is also the section that shows a **known gap in the two source parsers**:
outside a session, Note view and the map strip a bare `# osmosis-cloze` comment
from the revealed half but not a labelled `# osmosis-cloze-c1`, so the marker
prints on the answer. The generator strips it correctly, so the leak disappears
the moment a session asks the card and reappears when the session ends. Expected
here, recorded, not a regression.

````osmosis
id: ccs-flex01
c1:
  due: 2026-08-09T09:00:00.000Z
  stability: 5.2000
  difficulty: 5.1000
  reps: 3
  lapses: 0
  state: review
  lastReview: 2026-08-04T09:00:00.000Z
  learningSteps: 0

```css
.card-grid {
    display: flex;  /* osmosis-cloze-c1 */
    justify-content: center;  /* osmosis-cloze-c1 */
    height: 100vh;
}
```
````

Reset this file after testing — and reload Obsidian (Ctrl+R) before testing it
again, or the reset does not take: the running plugin holds its own copy of a
note it has open and writes that copy back on the next schedule flush.
