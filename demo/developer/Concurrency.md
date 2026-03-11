---
osmosis-cards: true
osmosis-deck: rust/concurrency
osmosis-styles:
  theme: Dracula
  branchLineStyle: angular
  branchLinePattern: dashed
---

# Concurrency

Rust's ownership model extends naturally to concurrent programming. Data races are caught at compile time, making fearless concurrency a reality.

![Fearless Concurrency in Rust](https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Rust_Ferris.svg/240px-Rust_Ferris.svg.png)

[Rust Concurrency Explained — Let's Get Rusty](https://www.youtube.com/watch?v=06WcsNVUODQ)

## Threads

- `std::thread::spawn` creates OS threads
  - Takes a closure that runs on the new thread
  - Returns a `JoinHandle` for waiting on completion
  - Closures must own their data (`move` keyword) to ensure thread safety
- Thread panics are isolated
  - A panic in a spawned thread doesn't crash the main thread
  - `JoinHandle::join()` returns `Result` — `Err` if the thread panicked

```rust
use std::thread;

fn main() {
    let data = vec![1, 2, 3, 4, 5];

    let handle = thread::spawn(move || {
        let sum: i32 = data.iter().sum();
        println!("Sum: {sum}");
        sum
    });

    let result = handle.join().expect("Thread panicked");
    println!("Thread returned: {result}");
}
```

## Channels

- **Message passing** via `std::sync::mpsc`
  - `mpsc` = multiple producer, single consumer
  - `tx.send(value)` transfers ownership to the receiver
  - `rx.recv()` blocks until a message arrives
  - `rx.try_recv()` returns immediately
- Channel types
  - Unbounded: `mpsc::channel()` — infinite buffer
  - Bounded: `mpsc::sync_channel(n)` — blocks sender when full

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();
    let tx2 = tx.clone();  // multiple producers

    thread::spawn(move || {
        tx.send("hello from thread 1").unwrap();
    });

    thread::spawn(move || {
        tx2.send("hello from thread 2").unwrap();
    });

    for msg in rx {
        println!("Received: {msg}");
    }
}
```

## Shared State: Mutex and Arc

- `Mutex<T>` — mutual exclusion for shared data
  - `lock()` returns a `MutexGuard` (RAII lock)
  - Lock is automatically released when guard is dropped
  - Poisoned if a thread panics while holding the lock
- `Arc<T>` — atomically reference-counted pointer
  - Thread-safe version of `Rc<T>`
  - Enables shared ownership across threads
  - Combine as `Arc<Mutex<T>>` for shared mutable state

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();
            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Final count: {}", *counter.lock().unwrap());
}
```

## Async/Await

- Rust's async model uses **cooperative scheduling**
  - `async fn` returns a `Future` — lazy, does nothing until polled
  - `.await` suspends the current task and yields to the executor
  - Requires a runtime: `tokio`, `async-std`, or `smol`
- Key traits
  - `Future` — core async abstraction
  - `Send` — future can be sent across threads
  - `Sync` — future can be shared across threads

```rust
use tokio;

#[tokio::main]
async fn main() {
    let (result_a, result_b) = tokio::join!(
        fetch_data("https://api.example.com/a"),
        fetch_data("https://api.example.com/b"),
    );

    println!("A: {result_a:?}, B: {result_b:?}");
}

async fn fetch_data(url: &str) -> Result<String, reqwest::Error> {
    let response = reqwest::get(url).await?;
    response.text().await
}
```

## Send and Sync Traits

- `Send` — a type can be transferred across thread boundaries
  - Most types are `Send`; `Rc<T>` is not
- `Sync` — a type can be shared (via reference) across threads
  - `T` is `Sync` if `&T` is `Send`
  - `Mutex<T>` is `Sync` (even if `T` is only `Send`)

## Flashcards

````osmosis
id: dev-conc-001
c1-stability: 22.5
c1-difficulty: 0.30
c1-due: 2026-03-26T10:00:00.000Z
c1-last-review: 2026-03-07T10:00:00.000Z
c1-reps: 12
c1-lapses: 0
c1-state: review
c2-stability: 7.8
c2-difficulty: 0.44
c2-due: 2026-03-15T10:00:00.000Z
c2-last-review: 2026-03-09T10:00:00.000Z
c2-reps: 6
c2-lapses: 1
c2-state: review

```rust
use std::sync::{Arc, Mutex};

fn main() {
    let data = Arc::new(Mutex::new(vec![])); // osmosis-cloze
    let data_clone = Arc::clone(&data); // osmosis-cloze

    std::thread::spawn(move || {
        data_clone.lock().unwrap().push(42);
    }).join().unwrap();
}
```
````

```osmosis
id: dev-conc-002
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

What is the difference between `Arc<T>` and `Rc<T>` in Rust?
***
`Arc<T>` (Atomically Reference Counted) is thread-safe and can be shared across threads (`Send + Sync`). `Rc<T>` (Reference Counted) is single-threaded only — it is neither `Send` nor `Sync`. `Arc` uses atomic operations for the reference count, which adds a small performance cost.
```

```osmosis
id: dev-conc-003
type-in: true
stability: 0.9
difficulty: 0.55
due: 2026-03-10T19:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 2
lapses: 0
state: learning

The ___ keyword in a thread closure forces the closure to take ownership of captured variables
***
move
```

```osmosis
id: dev-conc-004

What does `mpsc` stand for in Rust's channel implementation?
***
Multiple Producer, Single Consumer. It allows many sending ends (`tx.clone()`) but only one receiving end (`rx`).
```
