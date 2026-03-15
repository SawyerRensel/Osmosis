---
osmosis-cards: true
osmosis-deck: rust/type-system
osmosis-styles:
  theme: Dracula
  branchLineStyle: straight
  balance: both-sides
---

# Traits and Generics

Traits define shared behavior. Generics enable code reuse across types. Together, they form Rust's approach to polymorphism — zero-cost abstractions enforced at compile time.

[Rust Traits — No Boilerplate](https://www.youtube.com/watch?v=bnnacleqg6k)

## Defining Traits

- A trait declares a set of methods a type must implement
  - Can include **default implementations**
  - Can require **associated types** and **constants**
- Types implement traits via `impl Trait for Type`
  - Orphan rule: you can only implement a trait if either the trait or the type is defined in your crate

```rust
trait Summary {
    fn summarize_author(&self) -> String;

    // Default implementation that calls a required method
    fn summarize(&self) -> String {
        format!("(Read more from {}...)", self.summarize_author())
    }
}

struct Article {
    title: String,
    author: String,
    content: String,
}

impl Summary for Article {
    fn summarize_author(&self) -> String {
        self.author.clone()
    }

    fn summarize(&self) -> String {
        format!("{}, by {} — {}", self.title, self.author, &self.content[..50])
    }
}
```

## Trait Bounds and Generics

- Constrain generic types to require specific trait implementations
  - Syntax: `fn foo<T: Trait>(x: T)`
  - `where` clause for complex bounds
  - Multiple bounds: `T: Clone + Debug`
- **Monomorphization**: the compiler generates specialized code for each concrete type
  - Zero runtime overhead
  - Increased binary size

```rust
use std::fmt::Display;

// Trait bound syntax
fn print_summary<T: Summary + Display>(item: &T) {
    println!("{item}: {}", item.summarize());
}

// Equivalent with where clause (cleaner for multiple bounds)
fn process<T, U>(t: &T, u: &U) -> String
where
    T: Summary + Clone,
    U: Display + Debug,
{
    format!("{}: {u:?}", t.summarize())
}
```

## Associated Types

- Define placeholder types within a trait
  - Implementors specify the concrete type
  - Cleaner than generic parameters on the trait itself
  - Each type can only implement the trait once

```rust
trait Iterator {
    type Item;

    fn next(&mut self) -> Option<Self::Item>;
}

struct Counter {
    count: u32,
}

impl Iterator for Counter {
    type Item = u32;

    fn next(&mut self) -> Option<Self::Item> {
        self.count += 1;
        if self.count <= 5 { Some(self.count) } else { None }
    }
}
```

## Trait Objects and Dynamic Dispatch

- `dyn Trait` enables runtime polymorphism
  - Used behind a pointer: `Box<dyn Trait>`, `&dyn Trait`
  - Virtual method table (vtable) for dispatch
  - Small runtime cost vs. static dispatch
- Object safety rules
  - Methods cannot return `Self`
  - Methods cannot use generic type parameters
  - The trait cannot require `Sized`

```rust
trait Drawable {
    fn draw(&self);
    fn bounding_box(&self) -> (f64, f64, f64, f64);
}

struct Canvas {
    shapes: Vec<Box<dyn Drawable>>,  // heterogeneous collection
}

impl Canvas {
    fn render(&self) {
        for shape in &self.shapes {
            shape.draw();  // dynamic dispatch via vtable
        }
    }
}
```

## Supertraits

- A trait can require another trait as a prerequisite
  - `trait A: B` means any type implementing A must also implement B
  - Enables calling supertrait methods in the subtrait

```rust
use std::fmt;

trait PrettyPrint: fmt::Display {
    fn pretty_print(&self) {
        println!("=== {} ===", self);  // can use Display methods
    }
}
```

## Flashcards

```osmosis
id: dev-trait-001
stability: 28.1
difficulty: 0.28
due: 2026-03-28T10:00:00.000Z
last-review: 2026-03-07T10:00:00.000Z
reps: 14
lapses: 0
state: review

What is the orphan rule in Rust's trait system?
***
You can only implement a trait for a type if either the trait or the type (or both) is defined in your crate. This prevents conflicting implementations across crates.
```

````osmosis
id: dev-trait-002
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

```rust
trait Iterator {
    type Item; // osmosis-cloze

    fn next(&mut self) -> Option<Self::Item>;
}
```
````

```osmosis
id: dev-trait-003
c1-stability: 12.6
c1-difficulty: 0.35
c1-due: 2026-03-20T10:00:00.000Z
c1-last-review: 2026-03-09T10:00:00.000Z
c1-reps: 8
c1-lapses: 0
c1-state: review
c2-stability: 0.9
c2-difficulty: 0.55
c2-due: 2026-03-10T19:00:00.000Z
c2-last-review: 2026-03-10T11:00:00.000Z
c2-reps: 2
c2-lapses: 0
c2-state: learning

==Static dispatch== (generics) uses monomorphization with zero runtime cost, while ==dynamic dispatch== (`dyn Trait`) uses a vtable with a small runtime cost but enables heterogeneous collections.
```

````osmosis
id: dev-trait-004

```rust
fn process<T, U>(t: &T, u: &U) -> String
// osmosis-cloze-start
where
    T: Summary + Clone,
    U: Display + Debug,
// osmosis-cloze-end
{
    format!("{}: {u:?}", t.summarize())
}
```
````
