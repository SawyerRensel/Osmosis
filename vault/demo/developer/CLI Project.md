---
osmosis-cards: true
osmosis-deck: rust/projects
osmosis-styles:
  theme: Dracula
  topicShape: rect
  branchLineStyle: angular
---

# CLI Project

Build a production-quality command-line tool in Rust using `clap` for argument parsing, `anyhow` for error handling, and `serde` for configuration.

![Rust logo](https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Rust_programming_language_black_logo.svg/200px-Rust_programming_language_black_logo.svg.png)

## Step 1: Project Setup

1. Create a new project with `cargo new minigrep`
2. Add dependencies to `Cargo.toml`
3. Structure the project with `main.rs` and `lib.rs`

```toml
[package]
name = "minigrep"
version = "0.1.0"
edition = "2021"

[dependencies]
clap = { version = "4", features = ["derive"] }
anyhow = "1"
colored = "2"
regex = "1"
```

## Step 2: Define the CLI Interface

Use `clap`'s derive API to declaratively define your arguments, flags, and subcommands.

```rust
use clap::Parser;

/// A minimal grep implementation in Rust
#[derive(Parser, Debug)]
#[command(name = "minigrep", version, about)]
struct Cli {
    /// The pattern to search for (supports regex)
    pattern: String,

    /// Files to search in
    #[arg(required = true)]
    files: Vec<String>,

    /// Case-insensitive search
    #[arg(short, long)]
    ignore_case: bool,

    /// Show line numbers
    #[arg(short = 'n', long)]
    line_numbers: bool,

    /// Count matches instead of showing them
    #[arg(short, long)]
    count: bool,

    /// Maximum number of matches to show
    #[arg(short, long)]
    max_count: Option<usize>,
}
```

## Step 3: Implement the Search Logic

Separate the core logic from the CLI plumbing. This makes the code testable and reusable.

```rust
use anyhow::{Context, Result};
use regex::Regex;
use std::fs;

pub struct SearchResult {
    pub file: String,
    pub line_number: usize,
    pub line: String,
}

pub fn search(
    pattern: &str,
    file_path: &str,
    ignore_case: bool,
) -> Result<Vec<SearchResult>> {
    let regex_pattern = if ignore_case {
        format!("(?i){pattern}")
    } else {
        pattern.to_string()
    };

    let regex = Regex::new(&regex_pattern)
        .context("Invalid regex pattern")?;

    let contents = fs::read_to_string(file_path)
        .with_context(|| format!("Could not read file: {file_path}"))?;

    let results: Vec<SearchResult> = contents
        .lines()
        .enumerate()
        .filter(|(_, line)| regex.is_match(line))
        .map(|(i, line)| SearchResult {
            file: file_path.to_string(),
            line_number: i + 1,
            line: line.to_string(),
        })
        .collect();

    Ok(results)
}
```

## Step 4: Wire It Together

Connect the CLI parsing to the search logic with proper error handling and formatted output.

```rust
use anyhow::Result;
use clap::Parser;
use colored::Colorize;

mod search;

fn main() -> Result<()> {
    let cli = Cli::parse();
    let mut total_matches = 0;

    for file in &cli.files {
        let results = search::search(&cli.pattern, file, cli.ignore_case)?;

        if cli.count {
            println!("{}: {}", file.green(), results.len());
        } else {
            for result in results.iter().take(
                cli.max_count.unwrap_or(usize::MAX)
            ) {
                if cli.line_numbers {
                    print!("{}:", result.line_number.to_string().yellow());
                }
                if cli.files.len() > 1 {
                    print!("{}:", result.file.green());
                }
                println!("{}", result.line);
            }
        }

        total_matches += results.len();
    }

    std::process::exit(if total_matches > 0 { 0 } else { 1 });
}
```

## Step 5: Add Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_case_sensitive() {
        let results = search("Rust", "test_data.txt", false).unwrap();
        assert!(results.iter().all(|r| r.line.contains("Rust")));
    }

    #[test]
    fn test_case_insensitive() {
        let results = search("rust", "test_data.txt", true).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_regex_pattern() {
        let results = search(r"\d{3}-\d{4}", "test_data.txt", false).unwrap();
        assert!(results.iter().all(|r| r.line.contains('-')));
    }
}
```

## Flashcards

````osmosis
id: dev-cli-001
c1-stability: 4.2
c1-difficulty: 0.48
c1-due: 2026-03-14T10:00:00.000Z
c1-last-review: 2026-03-10T10:00:00.000Z
c1-reps: 4
c1-lapses: 0
c1-state: review
c2-stability: 0.9
c2-difficulty: 0.55
c2-due: 2026-03-10T19:00:00.000Z
c2-last-review: 2026-03-10T11:00:00.000Z
c2-reps: 2
c2-lapses: 0
c2-state: learning

```rust
/// A minimal grep implementation in Rust
#[derive(Parser, Debug)]
#[command(name = "minigrep", version, about)] // osmosis-cloze
struct Cli {
    /// The pattern to search for
    pattern: String,

    /// Case-insensitive search
    #[arg(short, long)] // osmosis-cloze
    ignore_case: bool,
}
```
````

````osmosis
id: dev-cli-002
stability: 28.1
difficulty: 0.28
due: 2026-03-28T10:00:00.000Z
last-review: 2026-03-07T10:00:00.000Z
reps: 14
lapses: 0
state: review

```rust
let contents = fs::read_to_string(file_path)
    .with_context(|| format!("Could not read file: {file_path}"))?; // osmosis-cloze
```
````

````osmosis
id: dev-cli-003
c1-stability: 10.3
c1-difficulty: 0.36
c1-due: 2026-03-19T10:00:00.000Z
c1-last-review: 2026-03-09T10:00:00.000Z
c1-reps: 7
c1-lapses: 0
c1-state: review
c2-stability: 1.5
c2-difficulty: 0.58
c2-due: 2026-03-11T16:00:00.000Z
c2-last-review: 2026-03-10T10:00:00.000Z
c2-reps: 3
c2-lapses: 1
c2-state: learning

```rust
fn main() -> Result<()> {
    let cli = Cli::parse(); // osmosis-cloze
    // ...
    std::process::exit(if total_matches > 0 { 0 } else { 1 }); // osmosis-cloze
}
```
````
