---
osmosis-cards: true
osmosis-deck: Full Stack Engineering/Overview/Internet & Web Development/HTML Elements
---

# HTML Elements

Inline code cloze cards for every current HTML element listed in [[HTML Element Reference]]. One fence per element: the description is the question, and the element's tag name is blanked in both the opening and closing tag under a single `c1` group, so each element is exactly one card.  Obsolete and deprecated elements are deliberately excluded.

## Main root

### Document root

````osmosis
id: f884b283
c1:
  due: 2026-09-03T11:31:23.085Z
  stability: 1.2931
  difficulty: 5.1122
  reps: 1
  lapses: 0
  state: learning
  lastReview: 2026-09-03T11:25:23.085Z
  learningSteps: 0

Represents the root (top-level) element of an HTML document; every other element must be a descendant of it.

```html
<!DOCTYPE html>
<:::c1:html::: lang="en">
  <head></head>
  <body></body>
</:::c1:html:::>
```
````

## Document metadata

### Default URL that relative paths resolve against

````osmosis
id: e2850f2a

Specifies the base URL used for all relative URLs in a document; there can be only one per document.

```html
<head>
  <:::c1:base::: href="https://example.com/docs/" target="_self">
</head>
```
````

### Container for information about the document

````osmosis
id: 1fa3343c

Contains machine-readable information (metadata) about the document, such as its title, scripts, and style sheets.

```html
<:::c1:head:::>
  <meta charset="utf-8">
  <title>Quarterly report</title>
</:::c1:head:::>
```
````

### External resource relationship

````osmosis
id: 386b27f4

Specifies a relationship between the current document and an external resource, most commonly a stylesheet or a site icon.

```html
<:::c1:link::: rel="stylesheet" href="main.css">
<:::c1:link::: rel="icon" href="favicon.ico">
```
````

### Catch-all document information

````osmosis
id: a43860a0

Represents metadata that cannot be expressed by the other meta-related elements such as `<base>`, `<link>`, `<script>`, `<style>`, and `<title>`.

```html
<:::c1:meta::: charset="utf-8">
<:::c1:meta::: name="viewport" content="width=device-width, initial-scale=1">
```
````

### Embedded CSS rules

````osmosis
id: ef48e403

Contains style information for a document or part of a document; its CSS applies to the contents of the containing document.

```html
<:::c1:style:::>
  body { margin: 0; }
</:::c1:style:::>
```
````

### Name shown in the browser tab

````osmosis
id: afff6355

Defines the document title shown in the browser's title bar or the page's tab; it contains text only, and any tags inside it are treated as plain text.

```html
<head>
  <:::c1:title:::>Quarterly report</:::c1:title:::>
</head>
```
````

## Sectioning root

### Document content container

````osmosis
id: 6c26afe7

Represents the content of an HTML document; there can be only one per document.

```html
<:::c1:body:::>
  <h1>Quarterly report</h1>
  <p>Revenue rose in every region.</p>
</:::c1:body:::>
```
````

## Content sectioning

### Contact information for a person or organization

````osmosis
id: 6fc1fb8a

Indicates that the enclosed HTML provides contact information for a person, for people, or for an organization.

```html
<:::c1:address:::>
  Written by <a href="mailto:ops@example.com">the ops team</a>.
</:::c1:address:::>
```
````

### Independently distributable composition

````osmosis
id: b4505192

Represents a self-contained composition intended to be independently distributable or reusable, such as a forum post, a blog entry, or a product card.

```html
<:::c1:article:::>
  <h2>Rolling out the new build cache</h2>
  <p>Cold builds dropped from nine minutes to two.</p>
</:::c1:article:::>
```
````

### Tangentially related content

````osmosis
id: ed655625

Represents a portion of a document whose content is only indirectly related to the main content, frequently presented as a sidebar or call-out box.

```html
<:::c1:aside:::>
  <h3>Related reading</h3>
  <p>See the caching guide for the full configuration.</p>
</:::c1:aside:::>
```
````

### Closing content for a section

````osmosis
id: 13fc6983

Represents a footer for its nearest sectioning content or sectioning root ancestor, typically holding authorship, copyright data, or links to related documents.

```html
<article>
  <p>Cold builds dropped from nine minutes to two.</p>
  <:::c1:footer:::>Posted 5 February 2026</:::c1:footer:::>
</article>
```
````

### Introductory content for a section

````osmosis
id: acced117

Represents introductory content, typically a group of introductory or navigational aids; it may contain headings, a logo, a search form, or an author name.

```html
<:::c1:header:::>
  <h1>Engineering notes</h1>
  <nav><a href="/archive">Archive</a></nav>
</:::c1:header:::>
```
````

### First of six section title levels

````osmosis
id: f3aa27a1

The highest of the six section heading levels, used for the most important heading of a section.

```html
<article>
  <:::c1:h1:::>Annual review</:::c1:h1:::>
  <h2>Highlights</h2>
</article>
```
````

### Second of six section title levels

````osmosis
id: 02ba1d58

The second of the six section heading levels, one step below `<h1>`.

```html
<article>
  <h1>Annual review</h1>
  <:::c1:h2:::>Highlights</:::c1:h2:::>
</article>
```
````

### Third of six section title levels

````osmosis
id: 3c506e52

The third of the six section heading levels, one step below `<h2>`.

```html
<section>
  <h2>Highlights</h2>
  <:::c1:h3:::>Build times</:::c1:h3:::>
</section>
```
````

### Fourth of six section title levels

````osmosis
id: 9929da4f

The fourth of the six section heading levels, one step below `<h3>`.

```html
<section>
  <h3>Build times</h3>
  <:::c1:h4:::>Cold builds</:::c1:h4:::>
</section>
```
````

### Fifth of six section title levels

````osmosis
id: 4d008d01

The fifth of the six section heading levels, one step below `<h4>`.

```html
<section>
  <h4>Cold builds</h4>
  <:::c1:h5:::>Cache misses</:::c1:h5:::>
</section>
```
````

### Sixth of six section title levels

````osmosis
id: 066dca0d

The lowest of the six section heading levels, one step below `<h5>`.

```html
<section>
  <h5>Cache misses</h5>
  <:::c1:h6:::>By package</:::c1:h6:::>
</section>
```
````

### A title paired with its subtitle or tagline

````osmosis
id: 4385bd9d

Represents a heading grouped with any secondary content, such as a subheading, an alternative title, or a tagline.

```html
<:::c1:hgroup:::>
  <h1>Annual review</h1>
  <p>Twelve months of build metrics</p>
</:::c1:hgroup:::>
```
````

### Dominant content of the document

````osmosis
id: a97e3889

Represents the dominant content of the body of a document — the content directly related to or expanding upon its central topic.

```html
<body>
  <:::c1:main:::>
    <h1>Annual review</h1>
  </:::c1:main:::>
</body>
```
````

### Links for getting around a site

````osmosis
id: 4d7870c4

Represents a section whose purpose is to provide navigation links, such as a menu, a table of contents, or an index.

```html
<:::c1:nav:::>
  <a href="/">Home</a>
  <a href="/archive">Archive</a>
</:::c1:nav:::>
```
````

### Generic standalone part of a document

````osmosis
id: 5e0cdfba

Represents a generic standalone section of a document that has no more specific semantic element; it should almost always carry a heading.

```html
<:::c1:section:::>
  <h2>Highlights</h2>
  <p>Three regions beat their targets.</p>
</:::c1:section:::>
```
````

### Controls for finding or filtering content

````osmosis
id: 6efd6ca0

Represents a part containing a set of form controls or other content related to performing a search or filtering operation.

```html
<:::c1:search:::>
  <label for="q">Find a note</label>
  <input id="q" type="search">
</:::c1:search:::>
```
````

## Text content

### Long passage quoted from elsewhere

````osmosis
id: f799bf23

Indicates that the enclosed text is an extended quotation, usually rendered with indentation; the source URL may be given with the `cite` attribute.

```html
<:::c1:blockquote::: cite="https://example.com/report">
  <p>Latency is a feature you only notice when it is missing.</p>
</:::c1:blockquote:::>
```
````

### Definition or value for a preceding term

````osmosis
id: 3a4d0c10

Provides the description, definition, or value for the preceding term in a description list.

```html
<dl>
  <dt>Cache hit</dt>
  <:::c1:dd:::>A build step served from stored output.</:::c1:dd:::>
</dl>
```
````

### Generic block container

````osmosis
id: 6a04e4b8

The generic container for flow content, with no effect on content or layout until it is styled with CSS.

```html
<:::c1:div::: class="card">
  <p>Nothing semantic here — just a styling hook.</p>
</:::c1:div:::>
```
````

### List of terms and their descriptions

````osmosis
id: 2d254e27

Represents a description list enclosing groups of terms and their descriptions, commonly used for a glossary or key-value metadata.

```html
<:::c1:dl:::>
  <dt>Cache hit</dt>
  <dd>A build step served from stored output.</dd>
</:::c1:dl:::>
```
````

### Term being described in a list

````osmosis
id: 680537ac

Specifies a term in a description list; it must be used inside a `<dl>` and is usually followed by a `<dd>`.

```html
<dl>
  <:::c1:dt:::>Cache hit</:::c1:dt:::>
  <dd>A build step served from stored output.</dd>
</dl>
```
````

### Label describing a self-contained illustration

````osmosis
id: 243574a8

Represents a caption or legend describing the rest of the contents of its parent `<figure>`.

```html
<figure>
  <img src="build-times.png" alt="Build times by month">
  <:::c1:figcaption:::>Build times, 2026</:::c1:figcaption:::>
</figure>
```
````

### Self-contained illustration referenced as a unit

````osmosis
id: f8e90d32

Represents self-contained content with an optional caption; the figure, its caption, and its contents are referenced as a single unit.

```html
<:::c1:figure:::>
  <img src="build-times.png" alt="Build times by month">
  <figcaption>Build times, 2026</figcaption>
</:::c1:figure:::>
```
````

### Thematic break between paragraphs

````osmosis
id: 08774d2d

Represents a thematic break between paragraph-level elements, such as a change of scene in a story or a shift of topic within a section.

```html
<p>The first proposal was withdrawn.</p>
<:::c1:hr:::>
<p>A year later, a second one arrived.</p>
```
````

### Single item in a list

````osmosis
id: f50f1a8c

Represents an item in a list; it must be contained in an `<ol>`, a `<ul>`, or a `<menu>`.

```html
<ul>
  <:::c1:li:::>Warm the cache</:::c1:li:::>
  <:::c1:li:::>Run the suite</:::c1:li:::>
</ul>
```
````

### Semantic alternative to a bulleted list

````osmosis
id: 42c23d54

A semantic alternative to `<ul>` for an unordered list of items, treated by browsers and the accessibility tree as no different from `<ul>`.

```html
<:::c1:menu:::>
  <li><button>Copy</button></li>
  <li><button>Paste</button></li>
</:::c1:menu:::>
```
````

### Numbered list

````osmosis
id: 1835f6cd

Represents an ordered list of items, typically rendered as a numbered list.

```html
<:::c1:ol:::>
  <li>Install the toolchain</li>
  <li>Run the build</li>
</:::c1:ol:::>
```
````

### Block of running text

````osmosis
id: 8540ce54

Represents a paragraph, usually rendered as a block of text separated from adjacent blocks by blank lines or first-line indentation.

```html
<:::c1:p:::>Revenue rose in every region this quarter.</:::c1:p:::>
```
````

### Text shown exactly as written

````osmosis
id: 3c1be40b

Represents preformatted text presented exactly as written in the HTML file, with whitespace preserved and a monospaced font by default.

```html
<:::c1:pre:::>
  total   elapsed
     42     1.8s
</:::c1:pre:::>
```
````

### Bulleted list

````osmosis
id: c8d587b6

Represents an unordered list of items, typically rendered as a bulleted list.

```html
<:::c1:ul:::>
  <li>Warm the cache</li>
  <li>Run the suite</li>
</:::c1:ul:::>
```
````

## Inline text semantics

### Hyperlink to another resource

````osmosis
id: 9f759e6a

Together with its `href` attribute, creates a hyperlink to web pages, files, email addresses, locations within the current page, or anything else a URL can address.

```html
<p>Read the <:::c1:a::: href="/guide">caching guide</:::c1:a:::>.</p>
```
````

### Shortened form of a word or phrase

````osmosis
id: 08833d67

Represents an abbreviation or acronym.

```html
<p>The <:::c1:abbr::: title="HyperText Markup Language">HTML</:::c1:abbr:::> spec.</p>
```
````

### Attention-drawing text without added importance

````osmosis
id: 581136e8

Draws the reader's attention to its contents without granting them special importance; use `<strong>` for importance and CSS for styling.

```html
<p>The <:::c1:b:::>keywords</:::c1:b:::> in this abstract are set apart.</p>
```
````

### Text isolated from the surrounding text direction

````osmosis
id: a6d41eb9

Tells the browser's bidirectional algorithm to treat the text it contains in isolation from the surrounding text, useful for dynamically inserted text of unknown directionality.

```html
<li>User <:::c1:bdi:::>hafez</:::c1:bdi:::>: 3 points</li>
```
````

### Overridden text direction

````osmosis
id: dabcc662

Overrides the current directionality of text so that the text within is rendered in a different direction.

```html
<p><:::c1:bdo::: dir="rtl">This renders right to left.</:::c1:bdo:::></p>
```
````

### Forced new line within text

````osmosis
id: 5d294758

Produces a line break in text, useful where the division of lines is significant, such as in a poem or an address.

```html
<p>
  1 Riverside Way<:::c1:br:::>
  Portland, OR
</p>
```
````

### Title of a creative work

````osmosis
id: 81deb4aa

Marks up the title of a creative work, possibly in an abbreviated form according to citation conventions.

```html
<p>First described in <:::c1:cite:::>The Mythical Man-Month</:::c1:cite:::>.</p>
```
````

### Short fragment of program source

````osmosis
id: 1f9b3428

Displays its contents styled to indicate a short fragment of computer code, by default in the user agent's monospace font.

```html
<p>Run <:::c1:code:::>npm run build</:::c1:code:::> to compile.</p>
```
````

### Machine-readable value for content

````osmosis
id: 013c7f12

Links a given piece of content with a machine-readable translation; for time- or date-related content the `<time>` element must be used instead.

```html
<li><:::c1:data::: value="8814">Mechanical keyboard</:::c1:data:::></li>
```
````

### The term being defined in a sentence

````osmosis
id: e7d3a90f

Indicates the term being defined within the context of a definition phrase or sentence.

```html
<p>A <:::c1:dfn:::>cache hit</:::c1:dfn:::> is a step served from stored output.</p>
```
````

### Text spoken with stress

````osmosis
id: 133b6cc5

Marks text that has stress emphasis, and can be nested, with each level indicating a greater degree of emphasis.

```html
<p>The suite must pass <:::c1:em:::>before</:::c1:em:::> you push.</p>
```
````

### Text set off from normal prose

````osmosis
id: c3c2bad9

Represents a range of text set off from the normal text, such as idiomatic text, technical terms, or taxonomical designations, historically rendered in italics.

```html
<p>The term <:::c1:i:::>ad hoc</:::c1:i:::> appears twice in the charter.</p>
```
````

### Text the user types or speaks as input

````osmosis
id: 879d9c5b

Represents a span of inline text denoting textual user input from a keyboard, voice input, or any other text entry device.

```html
<p>Press <:::c1:kbd:::>Ctrl</:::c1:kbd:::> + <:::c1:kbd:::>R</:::c1:kbd:::> to reload.</p>
```
````

### Highlighted text relevant in context

````osmosis
id: 0be74109

Represents text marked or highlighted for reference or notation purposes, given the marked passage's relevance in the enclosing context.

```html
<p>Search results for <:::c1:mark:::>latency</:::c1:mark:::> in the report.</p>
```
````

### Brief quoted phrase within a sentence

````osmosis
id: 245adaae

Indicates a short inline quotation, which most browsers render surrounded by quotation marks; use `<blockquote>` for long quotations.

```html
<p>She replied, <:::c1:q:::>the cache was cold</:::c1:q:::>, and moved on.</p>
```
````

### Fallback parentheses for ruby annotations

````osmosis
id: 8a855d40

Provides fall-back parentheses for browsers that do not support the display of ruby annotations.

```html
<ruby>
  漢 <:::c1:rp:::>(</:::c1:rp:::><rt>kan</rt><:::c1:rp:::>)</:::c1:rp:::>
</ruby>
```
````

### Pronunciation text of a ruby annotation

````osmosis
id: 1cdfdd34

Specifies the ruby text component of a ruby annotation, giving pronunciation, translation, or transliteration; it must always sit inside a `<ruby>` element.

```html
<ruby>
  漢 <:::c1:rt:::>kan</:::c1:rt:::>
</ruby>
```
````

### Small annotations above East Asian characters

````osmosis
id: 875f486d

Represents small annotations rendered above, below, or next to base text, usually to show the pronunciation of East Asian characters.

```html
<:::c1:ruby:::>
  漢 <rt>kan</rt>
</:::c1:ruby:::>
```
````

### Text no longer relevant or accurate

````osmosis
id: 70ca51e7

Renders text with a strikethrough to represent things that are no longer relevant or accurate; use `<del>` and `<ins>` for document edits instead.

```html
<p><:::c1:s:::>Ships Tuesday</:::c1:s:::> Ships Thursday.</p>
```
````

### Quoted output from a computer program

````osmosis
id: 799b9619

Encloses inline text representing sample or quoted output from a computer program, typically rendered in a monospaced font.

```html
<p>The build printed <:::c1:samp:::>2 warnings</:::c1:samp:::> and exited.</p>
```
````

### Side comments and fine print

````osmosis
id: 4eab962e

Represents side comments and small print, such as copyright and legal text, independent of its styled presentation.

```html
<footer><:::c1:small:::>© 2026 Example Corp.</:::c1:small:::></footer>
```
````

### Generic inline container

````osmosis
id: 1021aafa

A generic inline container for phrasing content that does not inherently represent anything; the inline counterpart to `<div>`, used only when no semantic element fits.

```html
<p>Total: <:::c1:span::: class="cost">$42</:::c1:span:::></p>
```
````

### Contents of serious importance or urgency

````osmosis
id: 2835e2b4

Indicates that its contents have strong importance, seriousness, or urgency, typically rendered in bold type.

```html
<p><:::c1:strong:::>Do not</:::c1:strong:::> force-push to the release branch.</p>
```
````

### Text lowered below the baseline

````osmosis
id: dea46b69

Specifies inline text displayed as subscript for solely typographical reasons, rendered with a lowered baseline in smaller text.

```html
<p>The formula H<:::c1:sub:::>2</:::c1:sub:::>O appears in the caption.</p>
```
````

### Text raised above the baseline

````osmosis
id: 513dbb0a

Specifies inline text displayed as superscript for solely typographical reasons, rendered with a raised baseline in smaller text.

```html
<p>The 4<:::c1:sup:::>th</:::c1:sup:::> revision shipped in March.</p>
```
````

### A specific date or moment, machine-readable

````osmosis
id: 37b1c0cf

Represents a specific period in time, optionally carrying a `datetime` attribute that gives a machine-readable form.

```html
<p>Published <:::c1:time::: datetime="2026-02-05">5 February</:::c1:time:::>.</p>
```
````

### Text carrying a non-textual annotation

````osmosis
id: e6c112dc

Represents a span of inline text with a non-textual annotation, rendered by default as a single solid underline.

```html
<p>A misspelling is flagged here: <:::c1:u:::>recieve</:::c1:u:::>.</p>
```
````

### Name of a quantity in an expression or program

````osmosis
id: 71a4a9bf

Represents the name of a variable in a mathematical expression or a programming context, typically presented in italics.

```html
<p>Solve for <:::c1:var:::>x</:::c1:var:::> given <:::c1:var:::>y</:::c1:var:::>.</p>
```
````

### A place where a line may optionally wrap

````osmosis
id: a3e80b4f

Represents a word break opportunity — a position where the browser may optionally break a line, though its own rules would not break there.

```html
<p>https://example.com/<:::c1:wbr:::>very/long/path</p>
```
````

## Image and multimedia

### One clickable region of a graphic

````osmosis
id: c75ba6df

Defines a clickable area inside an image map, associating a geometric region of an image with a hyperlink.

```html
<map name="floors">
  <:::c1:area::: shape="rect" coords="0,0,80,40" href="/ground" alt="Ground floor">
</map>
```
````

### Embedded sound content

````osmosis
id: 96a41280

Embeds sound content in a document, with one or more sources given by the `src` attribute or by `<source>` elements.

```html
<:::c1:audio::: controls>
  <source src="briefing.ogg" type="audio/ogg">
</:::c1:audio:::>
```
````

### Embedded graphic

````osmosis
id: 410664ea

Embeds an image into the document.

```html
<:::c1:img::: src="build-times.png" alt="Build times by month">
```
````

### Container grouping the clickable regions of a graphic

````osmosis
id: 47005c3c

Used with `<area>` elements to define an image map, a clickable link area over an image.

```html
<:::c1:map::: name="floors">
  <area shape="rect" coords="0,0,80,40" href="/ground" alt="Ground floor">
</:::c1:map:::>
```
````

### Timed text such as subtitles

````osmosis
id: 72099432

A child of `<audio>` or `<video>` that specifies timed text tracks, such as subtitles, formatted in WebVTT.

```html
<video controls src="talk.mp4">
  <:::c1:track::: kind="subtitles" src="talk.vtt" srclang="en" label="English">
</video>
```
````

### Embedded player for moving pictures

````osmosis
id: e1b197b0

Embeds a media player supporting video playback into the document.

```html
<:::c1:video::: controls width="640">
  <source src="talk.mp4" type="video/mp4">
</:::c1:video:::>
```
````

## Embedded content

### External plug-in content at a point in the document

````osmosis
id: d1d78723

Embeds external content at the specified point in the document, provided by an external application or another source of interactive content such as a browser plug-in.

```html
<:::c1:embed::: type="video/webm" src="clip.webm" width="640" height="360">
```
````

### Nested browsing context with privacy features

````osmosis
id: 66e2be8c

Represents a nested browsing context like `<iframe>`, but with more native privacy features built in.

```html
<:::c1:fencedframe::: width="320" height="240"></:::c1:fencedframe:::>
```
````

### Nested browsing context embedding another page

````osmosis
id: 74cfb235

Represents a nested browsing context, embedding another HTML page into the current one.

```html
<:::c1:iframe::: src="/preview" title="Preview" width="640" height="360"></:::c1:iframe:::>
```
````

### External resource handled as image, page, or plugin

````osmosis
id: e83cfa96

Represents an external resource, which can be treated as an image, a nested browsing context, or a resource handled by a plugin.

```html
<:::c1:object::: type="application/pdf" data="report.pdf" width="640"></:::c1:object:::>
```
````

### Alternative image versions for different displays

````osmosis
id: 4c092e24

Contains zero or more `<source>` elements and one `<img>` element to offer alternative versions of an image for different display or device scenarios.

```html
<:::c1:picture:::>
  <source srcset="wide.avif" media="(min-width: 800px)">
  <img src="narrow.jpg" alt="Build times by month">
</:::c1:picture:::>
```
````

### One of several media resources to choose from

````osmosis
id: de616f37

Specifies multiple media resources for `<picture>`, `<audio>`, or `<video>`; it is a void element with no content and no closing tag.

```html
<video controls>
  <:::c1:source::: src="talk.webm" type="video/webm">
  <:::c1:source::: src="talk.mp4" type="video/mp4">
</video>
```
````

## SVG and MathML

### Root of a drawing with its own coordinate system

````osmosis
id: 2defc66c

Container defining a new coordinate system and viewport, used as the outermost element of SVG documents and to embed an SVG fragment inside another document.

```html
<:::c1:svg::: viewBox="0 0 100 100" width="100" height="100">
  <circle cx="50" cy="50" r="40" />
</:::c1:svg:::>
```
````

### Top-level wrapper for a formula

````osmosis
id: b5e45dac

The top-level element in MathML; every valid MathML instance must be wrapped in it, and it must not be nested inside another one.

```html
<:::c1:math:::>
  <mfrac><mn>1</mn><mn>2</mn></mfrac>
</:::c1:math:::>
```
````

## Scripting

### Drawing surface for scripted graphics

````osmosis
id: e40d2831

Container element used with either the canvas scripting API or the WebGL API to draw graphics and animations.

```html
<:::c1:canvas::: id="plot" width="600" height="300"></:::c1:canvas:::>
```
````

### Fallback for browsers without JavaScript enabled

````osmosis
id: d3fb0cbe

Defines a section of HTML to be inserted if a script type on the page is unsupported or if scripting is currently turned off in the browser.

```html
<:::c1:noscript:::>
  <p>This report needs JavaScript enabled.</p>
</:::c1:noscript:::>
```
````

### Embedded or referenced executable JavaScript

````osmosis
id: 62ec9417

Embeds executable code or data, typically JavaScript, either written inline or referenced through the `src` attribute.

```html
<:::c1:script::: src="app.js" defer></:::c1:script:::>
```
````

## Demarcating edits

### Text removed from the document

````osmosis
id: d0257e29

Represents a range of text that has been deleted from a document, as when rendering track changes or a source diff.

```html
<p>Ships <:::c1:del:::>Tuesday</:::c1:del:::> <ins>Thursday</ins>.</p>
```
````

### Text added to the document

````osmosis
id: 90d64eb5

Represents a range of text that has been added to a document, the counterpart of `<del>`.

```html
<p>Ships <del>Tuesday</del> <:::c1:ins:::>Thursday</:::c1:ins:::>.</p>
```
````

## Table content

### Title of a data table

````osmosis
id: 7ed7c346

Specifies the caption, or title, of a table.

```html
<table>
  <:::c1:caption:::>Build times by month</:::c1:caption:::>
  <tr><td>January</td></tr>
</table>
```
````

### One or more vertical bands within a group

````osmosis
id: e92e54c6

Defines one or more columns in a column group; it is valid only as a child of a `<colgroup>` that has no `span` attribute.

```html
<colgroup>
  <:::c1:col::: span="2" class="numeric">
</colgroup>
```
````

### A named group of vertical bands in a table

````osmosis
id: 5a22539a

Defines a group of columns within a table.

```html
<table>
  <:::c1:colgroup:::>
    <col span="2" class="numeric">
  </:::c1:colgroup:::>
</table>
```
````

### Two-dimensional grid of rows and columns

````osmosis
id: 8d29d5c8

Represents tabular data — information presented in a two-dimensional grid of rows and columns of cells.

```html
<:::c1:table:::>
  <tr><th>Month</th><td>January</td></tr>
</:::c1:table:::>
```
````

### Rows forming the main data of a table

````osmosis
id: de29b11b

Encapsulates the set of table rows comprising the body of a table's main data.

```html
<table>
  <:::c1:tbody:::>
    <tr><td>January</td></tr>
  </:::c1:tbody:::>
</table>
```
````

### Cell containing data

````osmosis
id: b10c6b0e

A child of `<tr>` that defines a table cell containing data.

```html
<tr>
  <:::c1:td:::>January</:::c1:td:::>
  <:::c1:td:::>1.8s</:::c1:td:::>
</tr>
```
````

### Rows summarizing a table's columns

````osmosis
id: d6c0cbb1

Encapsulates the set of table rows comprising the foot of a table, usually a summary of its columns such as a total.

```html
<table>
  <:::c1:tfoot:::>
    <tr><td>Total</td><td>21.4s</td></tr>
  </:::c1:tfoot:::>
</table>
```
````

### Cell acting as a header for others

````osmosis
id: b63b7e3d

A child of `<tr>` that defines a cell as the header of a group of table cells, with the group defined by the `scope` and `headers` attributes.

```html
<tr>
  <:::c1:th::: scope="col">Month</:::c1:th:::>
  <:::c1:th::: scope="col">Elapsed</:::c1:th:::>
</tr>
```
````

### Rows forming a table's column headers

````osmosis
id: 3a60eb84

Encapsulates the set of table rows comprising the head of a table, usually in the form of column headers.

```html
<table>
  <:::c1:thead:::>
    <tr><th scope="col">Month</th></tr>
  </:::c1:thead:::>
</table>
```
````

### A row of cells

````osmosis
id: bdaf83ee

Defines a row of cells in a table, whose cells are established with a mix of `<td>` and `<th>` elements.

```html
<table>
  <:::c1:tr:::><th scope="row">January</th><td>1.8s</td></:::c1:tr:::>
</table>
```
````

## Forms

### Clickable control that performs an action

````osmosis
id: bb2261a7

An interactive element activated by mouse, keyboard, finger, voice, or assistive technology, which then performs an action such as submitting a form or opening a dialog.

```html
<:::c1:button::: type="submit">Save changes</:::c1:button:::>
```
````

### Suggested values offered to another control

````osmosis
id: b6a2b686

Contains a set of `<option>` elements representing the permissible or recommended options available within another control.

```html
<input list="regions" name="region">
<:::c1:datalist::: id="regions">
  <option value="North">
</:::c1:datalist:::>
```
````

### Group of related form controls and labels

````osmosis
id: 4c43bf99

Groups several controls, as well as their labels, within a web form.

```html
<:::c1:fieldset:::>
  <legend>Delivery</legend>
  <input type="text" name="street">
</:::c1:fieldset:::>
```
````

### Section of interactive controls for submitting information

````osmosis
id: 92153a0d

Represents a document section containing interactive controls for submitting information.

```html
<:::c1:form::: action="/subscribe" method="post">
  <button type="submit">Subscribe</button>
</:::c1:form:::>
```
````

### Control that accepts data from the user

````osmosis
id: d8f524fb

Creates interactive controls for web forms to accept data from the user, with a wide variety of input types and control widgets available.

```html
<:::c1:input::: type="email" name="address" required>
```
````

### Caption for a user interface item

````osmosis
id: 7c773718

Represents a caption for an item in a user interface.

```html
<:::c1:label::: for="address">Email address</:::c1:label:::>
<input id="address" type="email">
```
````

### Caption for a group of form controls

````osmosis
id: 52506654

Represents a caption for the content of its parent `<fieldset>`.

```html
<fieldset>
  <:::c1:legend:::>Delivery</:::c1:legend:::>
  <input type="text" name="street">
</fieldset>
```
````

### Scalar value within a known range

````osmosis
id: 1d36318b

Represents either a scalar value within a known range or a fractional value.

```html
<:::c1:meter::: min="0" max="100" value="72">72%</:::c1:meter:::>
```
````

### Grouping of choices within a drop-down control

````osmosis
id: f56c852c

Creates a grouping of options within a `<select>` element.

```html
<select>
  <:::c1:optgroup::: label="Americas">
    <option>North</option>
  </:::c1:optgroup:::>
</select>
```
````

### A single choice in a drop-down control

````osmosis
id: 9da7fe16

Defines an item contained in a `<select>`, an `<optgroup>`, or a `<datalist>`.

```html
<select name="region">
  <:::c1:option::: value="north">North</:::c1:option:::>
  <:::c1:option::: value="south">South</:::c1:option:::>
</select>
```
````

### Container for the result of a calculation

````osmosis
id: 7ffb0699

Container element into which a site or app can inject the result of a calculation or the outcome of a user action.

```html
<:::c1:output::: name="total" for="price qty">42</:::c1:output:::>
```
````

### Indicator of a task's completion

````osmosis
id: 598e0c04

Displays an indicator showing the completion progress of a task, typically rendered as a progress bar.

```html
<:::c1:progress::: max="100" value="64">64%</:::c1:progress:::>
```
````

### Control offering a drop-down list of choices

````osmosis
id: 24a62334

Represents a control that provides a menu of options.

```html
<:::c1:select::: name="region">
  <option value="north">North</option>
</:::c1:select:::>
```
````

### The chosen item shown in a closed drop-down

````osmosis
id: 2834a41f

Displays the content of the currently selected `<option>` inside a closed `<select>` element.

```html
<select>
  <button><:::c1:selectedcontent:::></:::c1:selectedcontent:::></button>
  <option>North</option>
</select>
```
````

### Control for entering several lines at once

````osmosis
id: 9a04d209

Represents a multi-line plain-text editing control, for when the user should be able to enter a sizeable amount of free-form text.

```html
<:::c1:textarea::: name="feedback" rows="4" cols="40"></:::c1:textarea:::>
```
````

## Interactive elements

### Disclosure widget toggled open and closed

````osmosis
id: 24672723

Creates a disclosure widget whose information is visible only when it is toggled into an open state; its label must be provided by a `<summary>`.

```html
<:::c1:details:::>
  <summary>Build log</summary>
  <p>Compiled 214 modules in 1.8s.</p>
</:::c1:details:::>
```
````

### Modal box, alert, or subwindow

````osmosis
id: d88335dc

Represents a dialog box or other interactive component, such as a dismissible alert, an inspector, or a subwindow.

```html
<:::c1:dialog::: open>
  <p>Discard unsaved changes?</p>
</:::c1:dialog:::>
```
````

### Control for sharing where the user is

````osmosis
id: 8a774487

Creates an interactive control for the user to share their geolocation data with the page.

```html
<:::c1:geolocation:::></:::c1:geolocation:::>
```
````

### Label that toggles a disclosure widget

````osmosis
id: c864c493

Specifies a summary, caption, or legend for a `<details>` disclosure box; clicking it toggles the parent open and closed.

```html
<details>
  <:::c1:summary:::>Build log</:::c1:summary:::>
  <p>Compiled 214 modules in 1.8s.</p>
</details>
```
````

## Web Components

### Placeholder filled with the user's own markup

````osmosis
id: 9c98ca74

A placeholder inside a web component that you fill with your own markup, letting you create separate DOM trees and present them together.

```html
<template id="card">
  <:::c1:slot::: name="title">Untitled</:::c1:slot:::>
</template>
```
````

### Markup held back until instantiated by script

````osmosis
id: f3eafad9

A mechanism for holding HTML that is not rendered when the page loads but may be instantiated later at runtime using JavaScript.

```html
<:::c1:template::: id="card">
  <p>Cloned into the DOM on demand.</p>
</:::c1:template:::>
```
````
