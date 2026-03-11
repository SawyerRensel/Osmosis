---
osmosis-cards: true
osmosis-styles:
  theme: dracula
---

# Pattern Matching

Pattern matching is one of Rust's most powerful control flow constructs. The `match` expression and related syntax provide exhaustive, type-safe branching.

## The `match` Expression

- `match` must be **exhaustive** — every possible value must be covered
  - The compiler enforces this at compile time
  - Use `_` as a catch-all wildcard pattern
- Each arm consists of a **pattern** and an **expression**
  - Arms are evaluated top to bottom
  - The first matching arm executes
  - All arms must return the same type

```rust
enum Coin {
    Penny,
    Nickel,
    Dime,
    Quarter(UsState),
}

fn value_in_cents(coin: Coin) -> u32 {
    match coin {
        Coin::Penny => 1,
        Coin::Nickel => 5,
        Coin::Dime => 10,
        Coin::Quarter(state) => {
            println!("Quarter from {state:?}");
            25
        }
    }
}
```

## `if let` and `while let`

- `if let` — match a single pattern, ignore the rest
  - Cleaner than `match` when you only care about one variant
  - Can include an `else` branch
- `while let` — loop as long as a pattern matches
  - Commonly used with iterators and `Option`

```rust
// if let: concise single-pattern matching
let config_max = Some(3u8);
if let Some(max) = config_max {
    println!("Maximum is {max}");
}

// while let: loop until pattern stops matching
let mut stack = vec![1, 2, 3];
while let Some(top) = stack.pop() {
    println!("{top}");
}
```

## Destructuring Patterns

- **Structs** — extract fields by name
  - Can rename bindings: `Struct { field: new_name }`
  - Can use `..` to ignore remaining fields
- **Tuples** — extract by position
- **Nested** — patterns can be arbitrarily deep
- **Guards** — add conditional logic with `if`

```rust
struct Point { x: i32, y: i32 }

let point = Point { x: 0, y: 7 };

match point {
    Point { x: 0, y } => println!("On y-axis at {y}"),
    Point { x, y: 0 } => println!("On x-axis at {x}"),
    Point { x, y } if x == y => println!("On diagonal"),
    Point { x, y } => println!("({x}, {y})"),
}
```

## Pattern Binding with `@`

```rust
enum Message {
    Hello { id: i32 },
}

let msg = Message::Hello { id: 5 };

match msg {
    Message::Hello { id: id_val @ 3..=7 } => {
        println!("Found id in range: {id_val}");
    }
    Message::Hello { id: 10..=12 } => {
        println!("In another range");
    }
    Message::Hello { id } => {
        println!("Other id: {id}");
    }
}
```

## Flashcards

````osmosis
id: dev-match-001
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

```rust
let value = Some(42);
if let Some(v) = value { // osmosis-cloze
    println!("Got: {v}");
}
```
````

````osmosis
id: dev-match-002
stability: 28.1
difficulty: 0.28
due: 2026-03-28T10:00:00.000Z
last-review: 2026-03-07T10:00:00.000Z
reps: 14
lapses: 0
state: review

```rust
fn describe(point: (i32, i32)) -> &'static str {
    // osmosis-cloze-start
    match point {
        (0, 0) => "origin",
        (x, 0) => "on x-axis",
        (0, y) => "on y-axis",
        _ => "somewhere else",
    }
    // osmosis-cloze-end
}
```
````

````osmosis
id: dev-match-003
stability: 0.9
difficulty: 0.55
due: 2026-03-10T19:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 2
lapses: 0
state: learning

```rust
let mut stack = vec![1, 2, 3];
while let Some(top) = stack.pop() { // osmosis-cloze
    println!("{top}");
}
```
````

````osmosis
id: dev-match-004
stability: 0.4
difficulty: 0.65
due: 2026-03-10T15:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 8
lapses: 3
state: relearning

```rust
match msg {
    Message::Hello { id: id_val @ 3..=7 } => { // osmosis-cloze
        println!("Found id in range: {id_val}");
    }
    _ => {}
}
```
````
