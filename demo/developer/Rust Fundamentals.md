---
osmosis-cards: true
osmosis-styles:
  theme: Dracula
  branchLineStyle: straight
  topicShape: rect
  styles:
    "# Rust Fundamentals/## Ownership Rules":
      fill: "#ff79c6"
      text:
        color: "#282a36"
        weight: 700
      branchLine:
        color: "#ff79c6"
        thickness: 2
    "# Rust Fundamentals/## Borrowing":
      fill: "#50fa7b"
      text:
        color: "#282a36"
        weight: 700
      branchLine:
        color: "#50fa7b"
        thickness: 2
    "# Rust Fundamentals/## Lifetimes":
      fill: "#8be9fd"
      text:
        color: "#282a36"
        weight: 700
      branchLine:
        color: "#8be9fd"
        thickness: 2
    "# Rust Fundamentals/## The Drop Trait":
      fill: "#ffb86c"
      text:
        color: "#282a36"
        weight: 700
      branchLine:
        color: "#ffb86c"
        thickness: 2
---

# Rust Fundamentals

Rust's ownership system is the language's most distinctive feature. It enables memory safety guarantees without a garbage collector, enforced entirely at compile time.

![Rust logo](https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Rust_programming_language_black_logo.svg/240px-Rust_programming_language_black_logo.svg.png)

[Rust Ownership Explained — Let's Get Rusty](https://www.youtube.com/watch?v=VFIOSWy93H0)

## Ownership Rules

- Every value in Rust has exactly **one owner**
  - When the owner goes out of scope, the value is dropped
  - Ownership can be **transferred** (moved) to another variable
  - After a move, the original variable is **invalidated**
- Primitive types implement `Copy`
  - Integers, floats, booleans, characters
  - These are stack-allocated and cheap to duplicate
  - Assignment copies rather than moves

```rust
let s1 = String::from("hello");
let s2 = s1;        // s1 is MOVED to s2
// println!("{s1}"); // compile error: s1 no longer valid

let x = 42;
let y = x;          // x is COPIED (i32 implements Copy)
println!("{x}");     // works fine
```

## Borrowing

- **Immutable references** (`&T`)
  - Multiple immutable references allowed simultaneously
  - Cannot modify the borrowed value
  - The borrower does not own the data
- **Mutable references** (`&mut T`)
  - Only **one** mutable reference at a time
  - No immutable references can coexist with a mutable one
  - Prevents data races at compile time

```rust
fn calculate_length(s: &String) -> usize {
    s.len()  // borrows s, doesn't take ownership
}

fn append_world(s: &mut String) {
    s.push_str(", world");  // mutable borrow allows modification
}
```

## Lifetimes

- Lifetimes ensure references are valid for as long as they are used
  - The compiler's **borrow checker** validates lifetimes
  - Explicit lifetime annotations: `'a`, `'b`, `'static`
  - Most lifetimes are inferred through **lifetime elision rules**
- Lifetime elision rules
  - Each parameter gets its own lifetime
  - If there is exactly one input lifetime, it is assigned to all outputs
  - If `&self` or `&mut self` is a parameter, its lifetime is assigned to outputs

```rust
// Explicit lifetime: the return value lives as long as both inputs
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// Lifetime elision: compiler infers the lifetime automatically
fn first_word(s: &str) -> &str {
    let bytes = s.as_bytes();
    for (i, &byte) in bytes.iter().enumerate() {
        if byte == b' ' {
            return &s[..i];
        }
    }
    s
}
```

## The Drop Trait

- Rust automatically calls `drop()` when a value goes out of scope
  - Custom cleanup logic via `impl Drop for T`
  - Cannot call `drop()` explicitly — use `std::mem::drop()` instead
  - Drop order: variables are dropped in **reverse** declaration order

```rust
struct DatabaseConnection {
    url: String,
}

impl Drop for DatabaseConnection {
    fn drop(&mut self) {
        println!("Closing connection to {}", self.url);
    }
}
```

## Flashcards

````osmosis
id: dev-rust-001
stability: 28.1
difficulty: 0.28
due: 2026-03-28T10:00:00.000Z
last-review: 2026-03-07T10:00:00.000Z
reps: 14
lapses: 0
state: review

What are the three ownership rules in Rust?
***
1. Every value has exactly one owner
2. There can only be one owner at a time
3. When the owner goes out of scope, the value is dropped
````

````osmosis
id: dev-rust-002
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1; // osmosis-cloze
    println!("{s2}");
}
```
````

```osmosis
id: dev-rust-003
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

==Immutable references== allow multiple simultaneous borrows, while ==mutable references== are exclusive — only one can exist at a time.
```

````osmosis
id: dev-rust-004
stability: 28.1
difficulty: 0.28
due: 2026-03-28T10:00:00.000Z
last-review: 2026-03-07T10:00:00.000Z
reps: 14
lapses: 0
state: review

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    // osmosis-cloze-start
    if x.len() > y.len() { x } else { y }
    // osmosis-cloze-end
}
```
````

```osmosis
id: dev-rust-005
type-in: true
stability: 0.4
difficulty: 0.65
due: 2026-03-10T15:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 8
lapses: 3
state: relearning

The ___ trait allows custom cleanup logic when a value goes out of scope
***
Drop
```
