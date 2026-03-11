---
osmosis-cards: true
osmosis-styles:
  theme: Dracula
---

# Error Handling

Rust distinguishes between **recoverable** errors (`Result<T, E>`) and **unrecoverable** errors (`panic!`). The type system forces you to handle errors explicitly.

[Rust Error Handling — Let's Get Rusty](https://www.youtube.com/watch?v=wM6o70NAWUI)

## Result and Option

| Type | Purpose | Variants | Use When |
|------|---------|----------|----------|
| `Result<T, E>` | Recoverable errors | `Ok(T)`, `Err(E)` | An operation can fail with an error |
| `Option<T>` | Optional values | `Some(T)`, `None` | A value might not exist |

- `Result` encodes success/failure with error context
  - `Ok(value)` — operation succeeded
  - `Err(error)` — operation failed, here's why
- `Option` encodes presence/absence
  - `Some(value)` — value exists
  - `None` — no value

```rust
use std::fs::File;
use std::io::Read;

fn read_file(path: &str) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}

fn find_user(id: u64) -> Option<String> {
    let users = vec!["Alice", "Bob", "Charlie"];
    users.get(id as usize).map(|s| s.to_string())
}
```

## The `?` Operator

- Propagates errors automatically up the call stack
  - On `Ok(value)`: unwraps and continues
  - On `Err(e)`: returns early with the error
- Works with both `Result` and `Option`
- Requires compatible return types
  - The function must return `Result` or `Option`
  - Error types must be convertible via `From`

```rust
use std::num::ParseIntError;

fn multiply_str(a: &str, b: &str) -> Result<i64, ParseIntError> {
    let x: i64 = a.parse()?;  // returns Err if parse fails
    let y: i64 = b.parse()?;
    Ok(x * y)
}
```

## Custom Error Types

- Implement `std::error::Error` for custom errors
  - Also requires `Display` and `Debug`
  - Enables use with `?` operator via `From` conversions
- Crates like `thiserror` and `anyhow` reduce boilerplate
  - `thiserror` — for library error types
  - `anyhow` — for application error handling

```rust
use std::fmt;

#[derive(Debug)]
enum AppError {
    Io(std::io::Error),
    Parse(std::num::ParseIntError),
    Custom(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(e) => write!(f, "IO error: {e}"),
            AppError::Parse(e) => write!(f, "Parse error: {e}"),
            AppError::Custom(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}
```

## Combinators

- `map()` — transform the inner value
- `and_then()` — chain fallible operations
- `unwrap_or()` / `unwrap_or_else()` — provide defaults
- `ok_or()` — convert `Option` to `Result`

```rust
let port: u16 = std::env::var("PORT")
    .unwrap_or_else(|_| "8080".to_string())
    .parse()
    .unwrap_or(8080);
```

## Flashcards

````osmosis
id: dev-err-001
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

```rust
fn read_config(path: &str) -> Result<String, std::io::Error> {
    // osmosis-cloze-start
    let mut file = File::open(path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
    // osmosis-cloze-end
}
```
````

```osmosis
id: dev-err-002
stability: 28.1
difficulty: 0.28
due: 2026-03-28T10:00:00.000Z
last-review: 2026-03-07T10:00:00.000Z
reps: 14
lapses: 0
state: review

What does the `?` operator do in Rust?
***
It propagates errors up the call stack. On `Ok(value)`, it unwraps and continues. On `Err(e)`, it returns early from the function with the error. The function must return a compatible `Result` or `Option` type.
```

```osmosis
id: dev-err-003
stability: 0.9
difficulty: 0.55
due: 2026-03-10T19:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 2
lapses: 0
state: learning

==Result<T, E>== is used for recoverable errors with variants Ok(T) and Err(E), while ==Option<T>== is used for optional values with variants Some(T) and None.
```

````osmosis
id: dev-err-004

```rust
let port: u16 = std::env::var("PORT")
    .unwrap_or_else(|_| "8080".to_string()) // osmosis-cloze
    .parse()
    .unwrap_or(8080); // osmosis-cloze
```
````
