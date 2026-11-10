---
tags:
  - html-forms
osmosis-cards: true
---

# Form Field Cards

Spacing fixture for flashcard panels in the 3D graph (`3D Graph - Planets mode`, feedback fix 2). Open the 3D graph here and fly up close to the cards: their live panels sit side by side and should not cover each other, in Planets, Organic and flat slices.

## Text areas

````osmosis
id: ff-rows
due: 2026-10-25T09:00:00.000Z
stability: 4.0000
difficulty: 5.5000
reps: 2
lapses: 0
state: review
lastReview: 2026-10-21T09:00:00.000Z
learningSteps: 0

Defines the number of visible text lines in a text area. Used on `<textarea>`.
***
```html
<textarea name="comment" rows="4">
</textarea>
```
````

````osmosis
id: ff-cols

Defines the number of visible character columns in a text area, which sets its width.
***
```html
<textarea name="comment" cols="40" rows="4">
</textarea>
```
````

````osmosis
id: ff-wrap

Indicates whether the line breaks the browser inserts to fit the text are included in the submitted value. Used on `<textarea>` with `cols`.
***
```html
<textarea name="comment" cols="40" wrap="hard">
</textarea>
```
````

## Inputs

````osmosis
id: ff-list

Identifies a predefined set of options to suggest to the user, by the `id` of the `<datalist>` holding them. Used on `<input>`.
***
```html
<input name="harbour" list="harbours">
<datalist id="harbours">
  <option value="Falmouth">
  <option value="Cowes">
</datalist>
```
````

````osmosis
id: ff-size

```html
<input type="text" name="postcode" size="10">
```
***
The `size` attribute: how many characters wide the input is drawn.
````

```osmosis
id: ff-check

A checkbox is ticked on load with the ==checked== attribute.
```
