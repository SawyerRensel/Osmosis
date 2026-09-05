---
osmosis-cards: true
osmosis-deck: Full Stack Engineering/Overview/Internet & Web Development/HTML Attributes
---

# HTML Attributes

Inline code cloze cards for every current HTML attribute listed in
[[HTML Attribute Reference]]. One fence per attribute: the description is the
question, and the attribute's name is blanked everywhere it appears in the
example markup under a single `c1` group, so each attribute is exactly one card.
Each description closes with the elements the attribute is used on.

Legacy and obsolete attributes (`align`, `background`, `bgcolor`, `border`,
`color`, `language`, `summary`) are deliberately excluded, as are the wildcard
families `aria-*` and `data-*` and the event handler content attributes.
Deprecated elements such as `<marquee>` and `<param>` are dropped from the
"used on" lists.

## Global attributes

### Keyboard shortcut that focuses or activates an element

````osmosis
id: 3180b77f

Keyboard shortcut to activate or add focus to the element. Used on any element (global attribute).

```html
<button :::c1:accesskey:::="s">Save draft</button>
```
````

### Whether typed input is automatically capitalized

````osmosis
id: 49501ed6

Sets whether input is automatically capitalized when entered by the user. Used on any element (global attribute).

```html
<input type="text" :::c1:autocapitalize:::="words" name="city">
```
````

### Names a group of elements to style together

````osmosis
id: 1dd141d9

Often used with CSS to style elements with common properties. Used on any element (global attribute).

```html
<p :::c1:class:::="note note--warning">Check the build log.</p>
```
````

### Whether the user can edit an element's content

````osmosis
id: dc253e33
c1:
  due: 2026-09-03T11:56:58.059Z
  stability: 0.2120
  difficulty: 6.4133
  reps: 1
  lapses: 0
  state: learning
  lastReview: 2026-09-03T11:55:58.059Z
  learningSteps: 0

Indicates whether the element's content is editable. Used on any element (global attribute).

```html
<div :::c1:contenteditable:::="true">Type here.</div>
```
````

### Text direction of an element's content

````osmosis
id: 6d99c093

Defines the text direction. Allowed values are `ltr` (Left-To-Right) or `rtl` (Right-To-Left). Used on any element (global attribute).

```html
<p :::c1:dir:::="rtl">This paragraph runs right to left.</p>
```
````

### Whether an element can be picked up and dragged

````osmosis
id: a330b16e

Defines whether the element can be dragged. Used on any element (global attribute).

```html
<div :::c1:draggable:::="true">Drag me onto the board.</div>
```
````

### Suppresses rendering while leaving children active

````osmosis
id: 231e2c95

Prevents rendering of the given element, while keeping child elements, e.g. script elements, active. Used on any element (global attribute).

```html
<div :::c1:hidden:::>Not rendered until the results arrive.</div>
```
````

### Unique identifier for one element

````osmosis
id: 3ae6bd0f

Often used with CSS to style a specific element. The value of this attribute must be unique. Used on any element (global attribute).

```html
<section :::c1:id:::="results">Revenue rose in every region.</section>
```
````

### Attaches a microdata property to an item

````osmosis
id: dd056c81

Adds a named property, with the element's content as its value, to an item of structured microdata. Used on any element (global attribute).

```html
<span :::c1:itemprop:::="author">The ops team</span>
```
````

### Language of an element's content

````osmosis
id: 714b6f08

Defines the language used in the element. Used on any element (global attribute).

```html
<p :::c1:lang:::="fr">Bonjour tout le monde.</p>
```
````

### Overrides what assistive technology reports an element as

````osmosis
id: 539b046b

Defines an explicit purpose for an element for use by assistive technologies, overriding its implicit semantics. Used on any element (global attribute).

```html
<div :::c1:role:::="alert">Upload failed.</div>
```
````

### Assigns an element to a named placeholder in a shadow tree

````osmosis
id: 95de982b

Assigns a named placeholder in a shadow DOM shadow tree to an element. Used on any element (global attribute).

```html
<span :::c1:slot:::="title">Quarterly report</span>
```
````

### Whether spell checking is allowed

````osmosis
id: 82403f06

Indicates whether spell checking is allowed for the element. Used on any element (global attribute).

```html
<textarea :::c1:spellcheck:::="false"></textarea>
```
````

### CSS applied to one element inline

````osmosis
id: 9d314c57

Declares CSS for this one element, overriding rules set previously. Used on any element (global attribute).

```html
<p :::c1:style:::="color: teal;">Highlighted</p>
```
````

### Overrides the default keyboard navigation order

````osmosis
id: 6dfb1799

Overrides the browser's default tab order and follows the one specified instead. Used on any element (global attribute).

```html
<div :::c1:tabindex:::="0">Focusable panel</div>
```
````

### Tooltip text shown on hover

````osmosis
id: c800fa93

Text to be displayed in a tooltip when hovering over the element. Used on any element (global attribute).

```html
<abbr :::c1:title:::="HyperText Markup Language">HTML</abbr>
```
````

### Whether text should be translated when the page is localized

````osmosis
id: 86db33c9

Specifies whether an element's attribute values and the values of its `Text` node children are to be translated when the page is localized, or whether to leave them unchanged. Used on any element (global attribute).

```html
<span :::c1:translate:::="no">Osmosis</span>
```
````

## Document metadata

### Declares the page's character encoding

````osmosis
id: 06870dce

Declares the character encoding of the page or script. Used on `<meta>`.

```html
<meta :::c1:charset:::="utf-8">
```
````

### Carries the value paired with a metadata key

````osmosis
id: e70425f3

A value associated with `http-equiv` or `name` depending on the context. Used on `<meta>`.

```html
<meta name="viewport" :::c1:content:::="width=device-width, initial-scale=1">
```
````

### Defines a pragma directive

````osmosis
id: 28052e7b

Defines a pragma directive, letting a `<meta>` element stand in for an HTTP response header. Used on `<meta>`.

```html
<meta :::c1:http-equiv:::="refresh" content="30">
```
````

## Links and resource relationships

### URL of a linked resource

````osmosis
id: 67a80b90

The URL of a linked resource. Used on `<a>`, `<area>`, `<base>`, and `<link>`.

```html
<a :::c1:href:::="/docs/">Documentation</a>
```
````

### Language of the resource at the other end of a link

````osmosis
id: fdb2139a

Specifies the language of the linked resource. Used on `<a>` and `<link>`.

```html
<a href="/docs/fr/" :::c1:hreflang:::="fr">Documentation en français</a>
```
````

### Where to open a link or show a form response

````osmosis
id: be8b499b

Specifies where to open the linked document (in the case of an `<a>` element) or where to display the response received (in the case of a `<form>` element). Used on `<a>`, `<area>`, `<base>`, and `<form>`.

```html
<a href="/report.pdf" :::c1:target:::="_blank" rel="noopener">Report</a>
```
````

### How the linked resource relates to this document

````osmosis
id: 1ea3f893

Specifies the relationship of the target object to the link object. Used on `<a>`, `<area>`, and `<link>`.

```html
<link :::c1:rel:::="stylesheet" href="main.css">
```
````

### Saves the resource to disk instead of navigating

````osmosis
id: 36cabaef

Indicates that the hyperlink is to be used for saving a resource rather than navigating to it, optionally naming the saved file. Used on `<a>` and `<area>`.

```html
<a href="/report.pdf" :::c1:download:::="quarterly-report.pdf">Report</a>
```
````

### URLs notified when the user follows a link

````osmosis
id: b607730b

Specifies a space-separated list of URLs to be notified if a user follows the hyperlink. Used on `<a>` and `<area>`.

```html
<a href="/docs/" :::c1:ping:::="https://example.com/track">Documentation</a>
```
````

### How much referrer information to send when fetching

````osmosis
id: 4ec7f130
c1:
  due: 2026-09-03T11:57:24.942Z
  stability: 0.2120
  difficulty: 6.4133
  reps: 1
  lapses: 0
  state: learning
  lastReview: 2026-09-03T11:56:24.942Z
  learningSteps: 0

Specifies which referrer is sent when fetching the resource. Used on `<a>`, `<area>`, `<iframe>`, `<img>`, `<link>`, and `<script>`.

```html
<img src="chart.png" :::c1:referrerpolicy:::="no-referrer" alt="Revenue by region">
```
````

### Conditions the linked resource was designed for

````osmosis
id: 9ea1b7a9

Specifies a hint of the presentation medium for which the linked resource was designed. Used on `<a>`, `<area>`, `<link>`, `<source>`, and `<style>`.

```html
<link rel="stylesheet" href="print.css" :::c1:media:::="print">
```
````

### Kind of content a preload is fetching

````osmosis
id: 71ffca24

Specifies the type of content being loaded by the link, so the browser can apply the right priority and policies. Used on `<link>`.

```html
<link rel="preload" href="main.js" :::c1:as:::="script">
```
````

## Scripts and stylesheets

### Runs a script asynchronously

````osmosis
id: 40b12af7

Executes the script asynchronously, without blocking parsing and without waiting its turn in document order. Used on `<script>`.

```html
<script src="analytics.js" :::c1:async:::></script>
```
````

### Delays a script until parsing finishes

````osmosis
id: 433d1610

Indicates that the script should be executed after the page has been parsed. Used on `<script>`.

```html
<script src="app.js" :::c1:defer:::></script>
```
````

### Hash that verifies a fetched resource is unaltered

````osmosis
id: 2c31c61d

Contains one or more hashes of the resource, used to ensure that the content of the resource is what the developer expects it to be and has not been replaced with a malicious copy in a supply chain attack. Used on `<link>` and `<script>`.

```html
<script src="https://cdn.example.com/app.js" :::c1:integrity:::="sha384-oqVuAfXRKap7fdgcCY5u"></script>
```
````

### How the element handles cross-origin requests

````osmosis
id: d11a6fe5

How the element handles requests to another origin, and whether credentials are sent with them. Used on `<audio>`, `<img>`, `<link>`, `<script>`, and `<video>`.

```html
<img src="https://cdn.example.com/chart.png" :::c1:crossorigin:::="anonymous" alt="Revenue by region">
```
````

### Hints how urgently a resource should be fetched

````osmosis
id: ed9db32b

Signals that fetching a particular resource early in the loading process has more or less impact on user experience than a browser can reasonably infer when assigning an internal priority. Used on `<img>`, `<link>`, and `<script>`.

```html
<img src="hero.png" :::c1:fetchpriority:::="high" alt="">
```
````

## Images and embedded content

### URL of the embeddable content

````osmosis
id: ec84ebc5

The URL of the embeddable content. Used on `<audio>`, `<embed>`, `<iframe>`, `<img>`, `<input>`, `<script>`, `<source>`, `<track>`, and `<video>`.

```html
<img :::c1:src:::="chart.png" alt="Revenue by region">
```
````

### The candidate images a browser may choose from

````osmosis
id: 317d424a

One or more responsive image candidates, each with the width or pixel density it is suited to. Used on `<img>` and `<source>`.

```html
<source :::c1:srcset:::="chart.avif 600w, chart-lg.avif 1200w" type="image/avif">
```
````

### The layout width an image will occupy

````osmosis
id: 3505a2f5

Describes the width the image will be displayed at under given media conditions, so the browser can pick from the candidates; on `<link>`, the dimensions of an icon. Used on `<link>`, `<img>`, and `<source>`.

```html
<img srcset="chart.png 600w, chart-lg.png 1200w"
     :::c1:sizes:::="(max-width: 40em) 100vw, 600px"
     src="chart.png" alt="Revenue by region">
```
````

### Text shown when an image cannot be displayed

````osmosis
id: 0e985848

Alternative text in case an image can't be displayed. Used on `<area>`, `<img>`, and `<input>`.

```html
<img src="chart.png" :::c1:alt:::="Revenue by region">
```
````

### Preferred way to decode an image

````osmosis
id: 7a800783

Indicates the preferred method to decode the image. Used on `<img>`.

```html
<img src="chart.png" :::c1:decoding:::="async" alt="Revenue by region">
```
````

### Whether to defer fetching until the element is near the viewport

````osmosis
id: c36b2df4

Indicates if the element should be fetched lazily (`lazy`) or immediately (`eager`). Used on `<img>` and `<iframe>`.

```html
<img src="chart.png" :::c1:loading:::="lazy" alt="Revenue by region">
```
````

### Flags an element for render-timing measurement

````osmosis
id: 22c60633

Indicates that an element is flagged for tracking by `PerformanceObserver` objects using the `"element"` type. Used on `<img>`, poster images of `<video>` elements, and elements containing text.

```html
<img src="hero.png" :::c1:elementtiming:::="hero-image" alt="">
```
````

### Intrinsic vertical size of an embedded element

````osmosis
id: 6ccec23d

Specifies the vertical size, in pixels, of the elements listed here. For all other elements, the corresponding CSS property should be used instead. Used on `<canvas>`, `<embed>`, `<iframe>`, `<img>`, `<input>`, `<object>`, and `<video>`.

```html
<img src="chart.png" width="600" :::c1:height:::="400" alt="Revenue by region">
```
````

### Intrinsic horizontal size of an embedded element

````osmosis
id: d25af995

For the elements listed here, this establishes the element's horizontal size in pixels. For all other instances this is a legacy attribute, in which case the corresponding CSS property should be used instead. Used on `<canvas>`, `<embed>`, `<iframe>`, `<img>`, `<input>`, `<object>`, and `<video>`.

```html
<img src="chart.png" :::c1:width:::="600" height="400" alt="Revenue by region">
```
````

### URL of the resource an object embeds

````osmosis
id: 7c5a703a

Specifies the URL of the resource an external object should display. Used on `<object>`.

```html
<object :::c1:data:::="report.pdf" type="application/pdf"></object>
```
````

## Image maps

### Points an image at the map defining its clickable regions

````osmosis
id: 5daf5905

References, by fragment identifier, the `<map>` whose clickable regions apply to this element. Used on `<img>`, `<input>`, and `<object>`.

```html
<img src="floorplan.png" :::c1:usemap:::="#rooms" alt="Office floor plan">
```
````

### Marks an image as a server-side image map

````osmosis
id: 87b9bc94

Indicates that the image is part of a server-side image map, so click coordinates are appended to the enclosing link's URL. Used on `<img>`.

```html
<a href="/lookup"><img src="floorplan.png" :::c1:ismap::: alt="Office floor plan"></a>
```
````

### Geometry of a clickable region

````osmosis
id: 9950f910

Gives the geometry of a hot-spot region: `rect`, `circle`, `poly`, or `default`. Used on `<a>` and `<area>`.

```html
<area :::c1:shape:::="circle" coords="120,80,40" href="/rooms/kitchen" alt="Kitchen">
```
````

### Coordinates of a clickable region

````osmosis
id: f3e09fba

A set of values specifying the coordinates of the hot-spot region. Used on `<area>`.

```html
<area shape="circle" :::c1:coords:::="120,80,40" href="/rooms/kitchen" alt="Kitchen">
```
````

## Audio and video

### Starts playback as soon as possible

````osmosis
id: 14367454

The audio or video should play as soon as possible, without waiting for the user to start it. Used on `<audio>` and `<video>`.

```html
<video src="tour.mp4" :::c1:autoplay::: muted></video>
```
````

### Shows the browser's playback interface

````osmosis
id: 1a05a947

Indicates whether the browser should show its playback interface to the user. Used on `<audio>` and `<video>`.

```html
<audio src="theme.mp3" :::c1:controls:::></audio>
```
````

### Restarts the media when it reaches the end

````osmosis
id: c8edfa9a

Indicates whether the media should start playing from the start when it's finished. Used on `<audio>` and `<video>`.

```html
<video src="tour.mp4" :::c1:loop:::></video>
```
````

### Silences the media initially

````osmosis
id: a9f96109

Indicates whether the audio will be initially silenced on page load. Used on `<audio>` and `<video>`.

```html
<video src="tour.mp4" autoplay :::c1:muted:::></video>
```
````

### Keeps video within its own playback area

````osmosis
id: 05028059

A Boolean attribute indicating that the video is to be played "inline"; that is, within the element's playback area. Note that the absence of this attribute does not imply that the video will always be played in fullscreen. Used on `<video>`.

```html
<video src="tour.mp4" :::c1:playsinline::: controls></video>
```
````

### Still frame shown before playback starts

````osmosis
id: b1b5c47f

A URL indicating the frame to show until the user plays or seeks. Used on `<video>`.

```html
<video src="tour.mp4" :::c1:poster:::="tour-cover.png" controls></video>
```
````

### How much of the media to fetch ahead of playback

````osmosis
id: 6711718d

Indicates whether the whole resource, parts of it, or nothing should be fetched before the user starts playback. Used on `<audio>` and `<video>`.

```html
<audio src="theme.mp3" :::c1:preload:::="metadata" controls></audio>
```
````

### What sort of timed text a track carries

````osmosis
id: aa51fefc

Specifies what the text track is for, such as subtitles, captions, or chapters. Used on `<track>`.

```html
<track :::c1:kind:::="subtitles" src="tour.vtt" srclang="en" label="English">
```
````

### Language of a timed text track

````osmosis
id: d6b69947

Gives the language of the text track's contents. Used on `<track>`.

```html
<track kind="subtitles" src="tour.vtt" :::c1:srclang:::="en" label="English">
```
````

### Enables a track unless the user prefers otherwise

````osmosis
id: 7c96215c

Indicates that the track should be enabled unless the user's preferences indicate something different. Used on `<track>`.

```html
<track kind="captions" src="tour.vtt" srclang="en" :::c1:default:::>
```
````

## Embedded browsing contexts

### Restricts what an embedded document may do

````osmosis
id: 7ce3fa07

Stops a document loaded in an inline frame from using certain features (such as submitting forms or opening new windows). Used on `<iframe>`.

```html
<iframe src="widget.html" :::c1:sandbox:::="allow-scripts"></iframe>
```
````

### Policy an embedded document must enforce on itself

````osmosis
id: 1cf7ed58

Specifies the Content Security Policy that an embedded document must agree to enforce upon itself. Used on `<iframe>`.

```html
<iframe src="widget.html" :::c1:csp:::="script-src 'self'"></iframe>
```
````

### Permissions policy applied to a frame

````osmosis
id: 749246e6

Specifies a feature policy for the inline frame, controlling which browser features the embedded document may use. Used on `<iframe>`.

```html
<iframe src="map.html" :::c1:allow:::="geolocation"></iframe>
```
````

### Inline markup a frame displays instead of fetching a URL

````osmosis
id: f4cecc04

Holds the HTML that the inline frame renders, in place of fetching a document over the network. Used on `<iframe>`.

```html
<iframe :::c1:srcdoc:::="&lt;p&gt;Rendered without a request.&lt;/p&gt;"></iframe>
```
````

## Forms

### Where the submitted form data is sent

````osmosis
id: b3a8b371

The URI of a program that processes the information submitted via the form. Used on `<form>`.

```html
<form :::c1:action:::="/subscribe" method="post">
  <button>Subscribe</button>
</form>
```
````

### Which HTTP verb submits the form

````osmosis
id: 2c574c84

Defines which HTTP verb to use when submitting the form. Can be `GET` (default) or `POST`. Used on `<form>`.

```html
<form action="/subscribe" :::c1:method:::="post">
  <button>Subscribe</button>
</form>
```
````

### How form data is encoded when posted

````osmosis
id: 013f4cb9

Defines the content type of the form data when the `method` is POST. Used on `<form>`.

```html
<form action="/upload" method="post" :::c1:enctype:::="multipart/form-data">
  <input type="file" name="report">
</form>
```
````

### Skips constraint checking on submit

````osmosis
id: 9d31990e

This attribute indicates that the form shouldn't be checked against its constraints when submitted. Used on `<form>`.

```html
<form action="/subscribe" method="post" :::c1:novalidate:::>
  <button>Subscribe</button>
</form>
```
````

### Which file types a picker should offer

````osmosis
id: b20ae14d

List of types the server takes, typically a file type given as an extension or MIME type. Used on `<form>` and `<input>`.

```html
<input type="file" :::c1:accept:::=".png,.jpg,.pdf" name="report">
```
````

### Character encoding used for form submission

````osmosis
id: c752119c

The character set, which if provided must be `"UTF-8"`. Used on `<form>`.

```html
<form action="/subscribe" method="post" :::c1:accept-charset:::="UTF-8">
  <button>Subscribe</button>
</form>
```
````

### Whether the browser may fill in values automatically

````osmosis
id: 530a66b8

Indicates whether controls in this form can by default have their values automatically completed by the browser. Used on `<form>`, `<input>`, `<select>`, and `<textarea>`.

```html
<input type="email" name="email" :::c1:autocomplete:::="email">
```
````

### Associates a control with a form elsewhere in the document

````osmosis
id: 6b8cb4a9

Indicates which owner, named by its `id`, the control belongs to even when it sits outside that owner's markup. Used on `<button>`, `<fieldset>`, `<input>`, `<object>`, `<output>`, `<select>`, and `<textarea>`.

```html
<input type="email" name="email" :::c1:form:::="signup">
```
````

### Submit button's override for where data is sent

````osmosis
id: 05b832d5

Indicates the destination of the element, overriding the `action` defined in the `<form>`. Used on `<input>` and `<button>`.

```html
<button type="submit" :::c1:formaction:::="/save-draft">Save draft</button>
```
````

### Submit button's override for the encoding type

````osmosis
id: 4009a745

If the button or input is a submit button, this attribute sets the encoding type to use during form submission, overriding the `enctype` attribute of the button's form owner. Used on `<button>` and `<input>`.

```html
<button type="submit" :::c1:formenctype:::="multipart/form-data">Upload</button>
```
````

### Submit button's override for the HTTP verb

````osmosis
id: 23865cda

If the button or input is a submit button, this attribute sets the submission method to use during form submission (`GET`, `POST`, etc.), overriding the `method` attribute of the button's form owner. Used on `<button>` and `<input>`.

```html
<button type="submit" :::c1:formmethod:::="get">Search</button>
```
````

### Submit button's override that skips validation

````osmosis
id: 72f28211

If the button or input is a submit button, this boolean attribute specifies that the form is not to be checked against its constraints when it is submitted, overriding the `novalidate` attribute of the button's form owner. Used on `<button>` and `<input>`.

```html
<button type="submit" :::c1:formnovalidate:::>Save draft</button>
```
````

### Submit button's override for where the response appears

````osmosis
id: 907f2a1f

If the button or input is a submit button, this attribute specifies the browsing context (for example, tab, window, or inline frame) in which to display the response that is received after submitting the form, overriding the `target` attribute of the button's form owner. Used on `<button>` and `<input>`.

```html
<button type="submit" :::c1:formtarget:::="_blank">Open results</button>
```
````

## Form controls

### Identifies a control in the submitted data

````osmosis
id: 0311f5ac

Identifies the element — for example, used by the server to tell the fields apart in form submits. Used on `<button>`, `<form>`, `<fieldset>`, `<iframe>`, `<input>`, `<object>`, `<output>`, `<select>`, `<textarea>`, `<map>`, and `<meta>`.

```html
<input type="email" :::c1:name:::="email">
```
````

### Ties a caption to the control it describes

````osmosis
id: 8da49408

Describes which elements belong to this one, by their `id`. Used on `<label>` and `<output>`.

```html
<label :::c1:for:::="email">Email address</label>
<input id="email" type="email" name="email">
```
````

### Human-readable title of an option or track

````osmosis
id: 4c3ff15f

Specifies a user-readable title of the element. Used on `<optgroup>`, `<option>`, and `<track>`.

```html
<optgroup :::c1:label:::="Europe">
  <option>France</option>
</optgroup>
```
````

### The data a control starts with and submits

````osmosis
id: 61dc9cd7

Defines a default which will be displayed in the element on page load and sent when the form is submitted. Used on `<button>`, `<data>`, `<input>`, `<li>`, `<meter>`, `<option>`, and `<progress>`.

```html
<input type="text" name="quantity" :::c1:value:::="1">
```
````

### Ticks a box or radio button on load

````osmosis
id: 057db1be

Indicates whether the element should be ticked on page load. Used on `<input>`.

```html
<input type="radio" name="plan" value="pro" :::c1:checked:::>
```
````

### Marks the option chosen when the page loads

````osmosis
id: 4e0307ad

Defines an entry in a drop-down which will be chosen on page load. Used on `<option>`.

```html
<option value="eu" :::c1:selected:::>Europe</option>
```
````

### Whether the user can interact with a control

````osmosis
id: 6f202667

Indicates whether the user can interact with the element. Used on `<button>`, `<fieldset>`, `<input>`, `<optgroup>`, `<option>`, `<select>`, and `<textarea>`.

```html
<button :::c1:disabled:::>Submit</button>
```
````

### Whether a control's value can be edited

````osmosis
id: d62aa7f6

Indicates whether the element can be edited, while still being focusable and submitted. Used on `<input>` and `<textarea>`.

```html
<input type="text" name="reference" value="EU-2026" :::c1:readonly:::>
```
````

### Allows more than one value in a control

````osmosis
id: 7bbf92c5

Indicates whether several values can be entered in an input of the type `email` or `file`. Used on `<input>` and `<select>`.

```html
<input type="file" name="attachments" :::c1:multiple:::>
```
````

### Visible width of a control

````osmosis
id: 81f9fbc3

Defines the width of the element (in pixels). If the element's `type` attribute is `text` or `password` then it's the number of characters. Used on `<input>` and `<select>`.

```html
<input type="text" name="postcode" :::c1:size:::="10">
```
````

### Visible character columns in a text area

````osmosis
id: d26e4287

Defines the number of vertical bands of characters shown in a textarea. Used on `<textarea>`.

```html
<textarea name="comment" :::c1:cols:::="40" rows="6"></textarea>
```
````

### Visible lines in a text area

````osmosis
id: bf42e901

Defines the number of horizontal lines shown in a text area. Used on `<textarea>`.

```html
<textarea name="comment" cols="40" :::c1:rows:::="6"></textarea>
```
````

### Whether soft line breaks are submitted

````osmosis
id: 17efda1f

Indicates whether the line breaks the browser inserts to fit the text are included in the submitted value. Used on `<textarea>`.

```html
<textarea name="comment" cols="40" :::c1:wrap:::="hard"></textarea>
```
````

### Points a control at a set of suggested values

````osmosis
id: a8f51c84

Identifies a pre-defined set of options to suggest to the user, by the `id` of the `<datalist>` holding them. Used on `<input>`.

```html
<input type="text" name="region" :::c1:list:::="regions">
```
````

### Hint shown in an empty field

````osmosis
id: d2dbe808

Provides a hint to the user of what can be entered in the field. Used on `<input>` and `<textarea>`.

```html
<input type="email" name="email" :::c1:placeholder:::="you@example.com">
```
````

### Submits the text direction alongside a value

````osmosis
id: f3d62224

Names the extra field that carries the text direction of this control's contents when the form is submitted. Used on `<input>` and `<textarea>`.

```html
<input type="text" name="comment" :::c1:dirname:::="comment.dir">
```
````

## Input validation and entry

### Field must be filled out before submitting

````osmosis
id: 0b6fdaa6

Indicates whether this element must be filled out or not before the form can be submitted. Used on `<input>`, `<select>`, and `<textarea>`.

```html
<input type="email" name="email" :::c1:required:::>
```
````

### Regular expression a value must match

````osmosis
id: 4d8473af

Defines a regular expression which the element's value will be validated against. Used on `<input>`.

```html
<input type="text" name="code" :::c1:pattern:::="[A-Z]{3}-[0-9]{4}">
```
````

### Smallest value allowed

````osmosis
id: 67800045

Indicates the lowest value allowed. Used on `<input>` and `<meter>`.

```html
<input type="number" name="quantity" :::c1:min:::="1" max="10">
```
````

### Largest value allowed

````osmosis
id: d096001f

Indicates the highest value allowed. Used on `<input>`, `<meter>`, and `<progress>`.

```html
<input type="number" name="quantity" min="1" :::c1:max:::="10">
```
````

### Fewest characters accepted

````osmosis
id: b38cd3f8

Defines the minimum number of characters allowed in the element. Used on `<input>` and `<textarea>`.

```html
<input type="password" name="passphrase" :::c1:minlength:::="12">
```
````

### Most characters accepted

````osmosis
id: 8ca76767

Defines the maximum number of characters allowed in the element. Used on `<input>` and `<textarea>`.

```html
<input type="text" name="headline" :::c1:maxlength:::="80">
```
````

### Granularity a numeric value must land on

````osmosis
id: 009fa2e9

Sets the interval that the value must adhere to as it is incremented or decremented. Used on `<input>`.

```html
<input type="number" name="rating" min="0" :::c1:step:::="0.5">
```
````

### Requests a file straight from the device's camera or microphone

````osmosis
id: 2468a60d

Specifies that a new file should be recorded with the device's camera or microphone rather than chosen from storage. Used on `<input>`.

```html
<input type="file" accept="image/*" :::c1:capture:::="environment">
```
````

### Lets a color picker expose opacity

````osmosis
id: e6f78e1b

Allow the user to select a color's opacity on a `type="color"` input. Used on `<input>`.

```html
<input type="color" name="brand" :::c1:alpha:::>
```
````

### Which gamut a color picker works in

````osmosis
id: d886750d

Defines the coordinate system of colors that is used by a `type="color"` input, such as `srgb` or `display-p3`. Used on `<input>`.

```html
<input type="color" name="brand" :::c1:colorspace:::="display-p3">
```
````

### Hints which virtual keyboard to show

````osmosis
id: 43a7e212

Provides a hint as to the type of data that might be entered by the user while editing the element or its contents. Used on `<textarea>` and elements with `contenteditable`.

```html
<textarea :::c1:inputmode:::="decimal"></textarea>
```
````

### Chooses the label on the virtual enter key

````osmosis
id: fdcb3eb0

Specifies what action label (or icon) to present for the enter key on virtual keyboards. Used on `<textarea>` and elements with `contenteditable`.

```html
<textarea :::c1:enterkeyhint:::="send"></textarea>
```
````

## Meter and progress

### Lower bound of a gauge's upper range

````osmosis
id: 0ef1c743

Indicates the lower bound of the upper range of a gauge. Used on `<meter>`.

```html
<meter min="0" max="100" low="30" :::c1:high:::="70" optimum="90" value="85"></meter>
```
````

### Upper bound of a gauge's lower range

````osmosis
id: b34411a0

Indicates the upper bound of the lower range of a gauge. Used on `<meter>`.

```html
<meter min="0" max="100" :::c1:low:::="30" high="70" optimum="90" value="85"></meter>
```
````

### The ideal point on a gauge

````osmosis
id: 446e3f8e

Indicates the optimal numeric value, which tells the browser which end of the gauge is the good end. Used on `<meter>`.

```html
<meter min="0" max="100" low="30" high="70" :::c1:optimum:::="90" value="85"></meter>
```
````

## Tables

### How many columns a cell stretches across

````osmosis
id: b8beccec

Defines the number of vertical bands a cell should stretch across. Used on `<td>` and `<th>`.

```html
<td :::c1:colspan:::="2">Total</td>
```
````

### How many rows a cell stretches down

````osmosis
id: 248eda1f

Defines the number of horizontal lines of cells a table cell should stretch down over. Used on `<td>` and `<th>`.

```html
<td :::c1:rowspan:::="3">Europe</td>
```
````

### Which header cells describe this cell

````osmosis
id: 2cb43e80

IDs of the `<th>` elements which apply to this element. Used on `<td>` and `<th>`.

```html
<td :::c1:headers:::="q1 region">1.2M</td>
```
````

### Which cells a header cell applies to

````osmosis
id: 495f1472

Defines the cells that the header cell (defined in the `th` element) relates to. Used on `<th>`.

```html
<th :::c1:scope:::="col">Region</th>
```
````

### How many columns a column definition covers

````osmosis
id: 2728ae48

Sets how many consecutive vertical bands a column definition or group covers. Used on `<col>` and `<colgroup>`.

```html
<colgroup :::c1:span:::="2"></colgroup>
```
````

## Lists

### Numbers a list downwards

````osmosis
id: edcdf869

Indicates whether the list should be displayed in a descending order instead of an ascending order. Used on `<ol>`.

```html
<ol :::c1:reversed:::>
  <li>Publish the release</li>
  <li>Tag the commit</li>
</ol>
```
````

### First number of an ordered list

````osmosis
id: 81ff808f

Defines the first number if other than 1. Used on `<ol>`.

```html
<ol :::c1:start:::="4">
  <li>Tag the commit</li>
</ol>
```
````

## Quotations and edits

### URL of the source of a quote or change

````osmosis
id: 1e54009c

Contains a URI which points to the source of the quote or change. Used on `<blockquote>`, `<del>`, `<ins>`, and `<q>`.

```html
<blockquote :::c1:cite:::="https://example.com/report">
  Revenue rose in every region.
</blockquote>
```
````

### Machine-readable date and time

````osmosis
id: a589e91d

Indicates the date and time associated with the element. Used on `<del>`, `<ins>`, and `<time>`.

```html
<time :::c1:datetime:::="2026-09-03">3 September</time>
```
````

## Interactive elements

### Whether a disclosure or dialog is currently showing

````osmosis
id: 074f39be

Indicates whether the contents are currently visible (in the case of a `<details>` element) or whether the dialog is active and can be interacted with (in the case of a `<dialog>` element). Used on `<details>` and `<dialog>`.

```html
<details :::c1:open:::>
  <summary>Build log</summary>
  <p>Compiled 214 modules in 1.8s.</p>
</details>
```
````

## Element variant

### Which variant of an element this is

````osmosis
id: d8591570

Defines which kind of the element this is, such as the control an input renders as or the language a script is written in. Used on `<button>`, `<input>`, `<embed>`, `<object>`, `<ol>`, `<script>`, `<source>`, `<style>`, `<menu>`, and `<link>`.

```html
<input :::c1:type:::="email" name="email">
<button :::c1:type:::="submit">Subscribe</button>
```
````
