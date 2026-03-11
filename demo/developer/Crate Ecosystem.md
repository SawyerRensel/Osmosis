---
osmosis-cards: true
osmosis-styles:
  theme: Dracula
---

# Crate Ecosystem

Rust's package registry, [crates.io](https://crates.io), hosts over 150,000 crates. These are the foundational crates every Rust developer should know.

## Web Frameworks

| Crate | Type | Async | Key Feature |
|-------|------|-------|-------------|
| `actix-web` | Full framework | Yes (Actix) | High performance, actor model |
| `axum` | Full framework | Yes (Tokio) | Tower ecosystem, ergonomic extractors |
| `warp` | Filter-based | Yes (Tokio) | Composable filters, lightweight |
| `rocket` | Full framework | Yes (Tokio) | Batteries-included, code generation |

## Async Runtimes

- `tokio` — the de facto standard async runtime
  - Multi-threaded work-stealing scheduler
  - I/O, timers, channels, synchronization primitives
  - Powers most of the async ecosystem
- `async-std` — mirrors `std` API with async versions
  - Lower learning curve for beginners
  - Smaller ecosystem than Tokio
- `smol` — minimal, lightweight runtime
  - Very small API surface
  - Good for embedded or minimal use cases

## Serialization

- `serde` — the universal serialization framework
  - Derive macros: `#[derive(Serialize, Deserialize)]`
  - Format-agnostic: works with JSON, TOML, YAML, MessagePack, etc.
  - Zero-copy deserialization with `#[serde(borrow)]`
- Format crates
  - `serde_json` — JSON (the most common)
  - `toml` — TOML (config files, Cargo.toml)
  - `serde_yaml` — YAML
  - `bincode` — compact binary format

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct Config {
    host: String,
    port: u16,
    #[serde(default)]
    debug: bool,
}

let config: Config = toml::from_str(r#"
    host = "localhost"
    port = 8080
"#)?;
```

## CLI Tools

- `clap` — the standard argument parser
  - Derive API and builder API
  - Shell completions, man page generation
  - Subcommands, value validation
- `indicatif` — progress bars and spinners
- `dialoguer` — interactive prompts and selections
- `colored` / `owo-colors` — terminal colors

## Error Handling

- `anyhow` — convenient error handling for applications
  - `anyhow::Result<T>` wraps any error type
  - `.context("message")` adds context to errors
  - Best for binaries, not libraries
- `thiserror` — derive macro for custom error types
  - `#[error("message")]` for Display impl
  - `#[from]` for automatic From conversions
  - Best for libraries

## Database

- `sqlx` — async, compile-time checked SQL
  - Verifies queries against a real database at compile time
  - Supports PostgreSQL, MySQL, SQLite
  - Zero-overhead query builder
- `diesel` — type-safe ORM and query builder
  - Compile-time query validation
  - Migrations built in
  - Synchronous (async support via `diesel-async`)
- `sea-orm` — async ORM built on `sqlx`

## Testing and Development

- `criterion` — statistical benchmarking
- `proptest` — property-based testing
- `mockall` — mock generation for traits
- `tracing` — structured, async-aware logging
  - Spans and events instead of log levels
  - Subscriber-based architecture
  - Integrates with OpenTelemetry

## Flashcards

```osmosis
id: dev-crate-001
stability: 0.4
difficulty: 0.65
due: 2026-03-10T15:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 8
lapses: 3
state: relearning

What are the two main error handling crates in Rust, and when do you use each?
***
`anyhow` — for applications. Provides `anyhow::Result<T>` that wraps any error type with context. `thiserror` — for libraries. Provides derive macros to create custom error types with `#[error()]` and `#[from]` attributes.
```

```osmosis
id: dev-crate-002
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

What is `serde` and what makes it unique in the Rust ecosystem?
***
Serde is Rust's universal serialization/deserialization framework. It is format-agnostic — the same `#[derive(Serialize, Deserialize)]` works with JSON, TOML, YAML, MessagePack, and many other formats via separate format crates. It supports zero-copy deserialization and is used by virtually every Rust project.
```

```osmosis
id: dev-crate-003
stability: 0.9
difficulty: 0.55
due: 2026-03-10T19:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 2
lapses: 0
state: learning

What is the key advantage of `sqlx` over traditional database crates?
***
sqlx verifies SQL queries against a real database at compile time, catching syntax errors, type mismatches, and missing columns before the code ever runs. It is also fully async and supports PostgreSQL, MySQL, and SQLite.
```

```osmosis
id: dev-crate-004
type-in: true

The ___ crate is the de facto standard async runtime in Rust, powering most of the async ecosystem
***
tokio
```
