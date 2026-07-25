---
osmosis-cards: true
osmosis-deck: media-cards
osmosis-styles:
  styles:
    _n:6d61ee4a:
      shape: diamond
    _n:53b2470e:
      shape: hexagon
  theme: Default
---

# Media & Rich Content Cards

## Card with a Local Image

```osmosis
id: img-pine
due: 2026-03-11T04:36:24.671Z
stability: 0.1775
difficulty: 8.3926
reps: 3
lapses: 0
state: review
last-review: 2026-03-10T04:36:24.671Z

What type of tree is shown in this image?

![[pine_tree.webp|200]]
***
A **pine tree** (*Pinus*), an evergreen conifer recognizable by its needle-like leaves and woody cones.
```

## Card with an External Image

```osmosis
id: img-earth
due: 2026-03-12T04:36:53.573Z
stability: 2.2982
difficulty: 3.4642
reps: 2
lapses: 0
state: review
last-review: 2026-03-10T04:36:53.573Z

Identify this planet:

![Earth from space](https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=400)
***
**Earth** — the third planet from the Sun and the only known planet to harbor life.
```

## Card with Code Block

````osmosis
id: code-python
due: 2026-03-10T20:28:30.258Z
stability: 0.0834
difficulty: 8.8063
reps: 2
lapses: 0
state: learning
last-review: 2026-03-10T20:27:30.258Z

What does this Python function return for `fibonacci(6)`?

```python
def fibonacci(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
```
***
It returns **8**.

The sequence: 0, 1, 1, 2, 3, 5, **8**
````

## Card with Inline Code

```osmosis
id: code-inline
due: 2026-03-10T20:28:20.446Z
stability: 0.0035
difficulty: 9.9643
reps: 6
lapses: 0
state: learning
last-review: 2026-03-10T20:27:20.446Z

In JavaScript, what is the difference between `===` and `==`?
***
- `===` is the **strict equality** operator — compares both value and type
- `==` is the **loose equality** operator — performs type coercion before comparing

Examples:
- `"5" == 5` → `true` (coerced)
- `"5" === 5` → `false` (different types)
- `null == undefined` → `true`
- `null === undefined` → `false`
```

## Card with Math-like Content

```osmosis
id: math-quadratic
due: 2026-03-10T20:28:21.778Z
stability: 0.0035
difficulty: 9.9643
reps: 6
lapses: 0
state: learning
last-review: 2026-03-10T20:27:21.778Z

State the quadratic formula for solving `ax² + bx + c = 0`.
***
**x = (-b ± √(b² - 4ac)) / 2a**

Where:
- `a` = coefficient of x²
- `b` = coefficient of x
- `c` = constant term
- The discriminant `b² - 4ac` determines the number of real solutions
```

## Card with Blockquote

```osmosis
id: quote-einstein
hint: Famous physicist
due: 2026-03-11T04:36:48.272Z
stability: 0.2945
difficulty: 6.7889
reps: 3
lapses: 0
state: review
last-review: 2026-03-10T04:36:48.272Z

Who said this?

> Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.
***
**Albert Einstein**, from a 1929 interview in *The Saturday Evening Post*.
```

## Card with Horizontal Rules and Formatting

```osmosis
id: format-mixed
due: 2026-03-10T17:03:26.859Z
stability: 0.4244
difficulty: 5.2000
reps: 2
lapses: 0
state: review
last-review: 2026-03-09T17:03:26.859Z

Explain the difference between *italic*, **bold**, and ***bold italic*** in Markdown.
***
| Syntax | Renders As | Use For |
|--------|-----------|---------|
| `*text*` or `_text_` | *italic* | Emphasis, titles |
| `**text**` or `__text__` | **bold** | Strong emphasis |
| `***text***` | ***bold italic*** | Maximum emphasis |

> **Tip**: You can also use ~~strikethrough~~ with `~~text~~` and ==highlight== with `==text==`.
```

## Type-in Card with Code

```osmosis
id: typein-sql
type-in: true
due: 2026-03-10T20:28:26.210Z
stability: 0.0155
difficulty: 9.8514
reps: 4
lapses: 0
state: learning
last-review: 2026-03-10T20:27:26.210Z

Write a SQL query to select all users older than 30.
***
SELECT * FROM users WHERE age > 30
```

## Card with a Link

```osmosis
id: link-obsidian
due: 2026-03-11T04:36:41.398Z
stability: 0.1032
difficulty: 8.7927
reps: 3
lapses: 0
state: review
last-review: 2026-03-10T04:36:41.398Z

What is Obsidian?
***
[Obsidian](https://obsidian.md) is a powerful **knowledge base** that works on top of a local folder of plain text Markdown files.

Key features:
- Graph view of linked notes
- Community plugins
- Local-first — your data stays on your device
- Supports backlinks via `[[wiki-links]]`
```
