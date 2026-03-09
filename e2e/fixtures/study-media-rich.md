---
osmosis-cards: true
osmosis-deck: media-cards
---

# Media & Rich Content Cards

## Card with a Local Image

```osmosis
id: img-pine

What type of tree is shown in this image?

![[pine_tree.webp]]
***
A **pine tree** (*Pinus*), an evergreen conifer recognizable by its needle-like leaves and woody cones.
```

## Card with an External Image

```osmosis
id: img-earth

Identify this planet:

![Earth from space](https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=400)
***
**Earth** — the third planet from the Sun and the only known planet to harbor life.
```

## Card with Code Block

````osmosis
id: code-python

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

Who said this?

> Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.
***
**Albert Einstein**, from a 1929 interview in *The Saturday Evening Post*.
```

## Card with Horizontal Rules and Formatting

```osmosis
id: format-mixed

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

Write a SQL query to select all users older than 30.
***
SELECT * FROM users WHERE age > 30
```

## Card with a Link

```osmosis
id: link-obsidian

What is Obsidian?
***
[Obsidian](https://obsidian.md) is a powerful **knowledge base** that works on top of a local folder of plain text Markdown files.

Key features:
- Graph view of linked notes
- Community plugins
- Local-first — your data stays on your device
- Supports backlinks via `[[wiki-links]]`
```
