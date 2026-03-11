---
osmosis-cards: true
osmosis-styles:
  theme: dracula
---

# Data Structures

Rust's standard library provides a rich set of collection types. Choosing the right one depends on your access patterns, ordering requirements, and performance constraints.

## Core Collections

| Collection | Ordered | Unique Keys | Access | Insert | Search |
|-----------|---------|-------------|--------|--------|--------|
| `Vec<T>` | Yes (by index) | No | O(1) | O(1) amortized | O(n) |
| `VecDeque<T>` | Yes (by index) | No | O(1) | O(1) both ends | O(n) |
| `HashMap<K, V>` | No | Yes | O(1) avg | O(1) avg | O(1) avg |
| `BTreeMap<K, V>` | Yes (sorted) | Yes | O(log n) | O(log n) | O(log n) |
| `HashSet<T>` | No | Yes (values) | O(1) avg | O(1) avg | O(1) avg |
| `BTreeSet<T>` | Yes (sorted) | Yes (values) | O(log n) | O(log n) | O(log n) |

## Vec

- Contiguous, growable array — the most commonly used collection
  - Heap-allocated, dynamically sized
  - Excellent cache locality
  - Automatic resizing (doubles capacity)
- Key operations
  - `push()` / `pop()` — add/remove from end
  - `insert(i, v)` / `remove(i)` — O(n) due to shifting
  - `iter()`, `iter_mut()`, `into_iter()` — iteration

```rust
let mut scores: Vec<i32> = Vec::new();
scores.push(95);
scores.push(87);
scores.push(92);

// Functional operations
let high_scores: Vec<&i32> = scores.iter()
    .filter(|&&s| s > 90)
    .collect();

// Vec macro shorthand
let fibonacci = vec![1, 1, 2, 3, 5, 8, 13];
```

## HashMap

- Hash table with O(1) average lookups
  - Uses SipHash by default (DoS-resistant, slightly slower)
  - Can swap hasher for performance: `ahash`, `FxHashMap`
- Key operations
  - `insert(k, v)` — overwrites existing
  - `entry(k).or_insert(v)` — insert if absent
  - `get(&k)` — returns `Option<&V>`

```rust
use std::collections::HashMap;

let mut word_count: HashMap<String, u32> = HashMap::new();
let text = "hello world hello rust hello world";

for word in text.split_whitespace() {
    let count = word_count.entry(word.to_string()).or_insert(0);
    *count += 1;
}

// {"hello": 3, "world": 2, "rust": 1}
```

## BTreeMap

- Self-balancing binary tree with sorted keys
  - Ordered iteration guaranteed
  - Supports range queries: `range(start..end)`
  - Slightly slower than HashMap for single lookups
  - Requires `Ord` on keys (not just `Hash + Eq`)

```rust
use std::collections::BTreeMap;

let mut temps: BTreeMap<String, f64> = BTreeMap::new();
temps.insert("2026-03-01".into(), 18.5);
temps.insert("2026-03-02".into(), 21.0);
temps.insert("2026-03-03".into(), 19.8);

// Range query: all entries from March 2nd onward
for (date, temp) in temps.range("2026-03-02".to_string()..) {
    println!("{date}: {temp}°C");
}
```

## VecDeque

- Double-ended queue backed by a ring buffer
  - O(1) push/pop at both ends
  - O(1) indexed access
  - Great for queues, sliding windows, and BFS

```rust
use std::collections::VecDeque;

let mut queue: VecDeque<String> = VecDeque::new();
queue.push_back("first".into());
queue.push_back("second".into());
queue.push_front("zeroth".into());

while let Some(item) = queue.pop_front() {
    println!("Processing: {item}");
}
```

## HashSet and BTreeSet

- Set operations: union, intersection, difference, symmetric difference
  - `HashSet` — unordered, O(1) average operations
  - `BTreeSet` — sorted, O(log n) operations, ordered iteration

```rust
use std::collections::HashSet;

let a: HashSet<i32> = [1, 2, 3, 4].into();
let b: HashSet<i32> = [3, 4, 5, 6].into();

let union: HashSet<_> = a.union(&b).collect();
let intersection: HashSet<_> = a.intersection(&b).collect();
let difference: HashSet<_> = a.difference(&b).collect();
```

## Flashcards

```osmosis
id: dev-ds-001
stability: 28.1
difficulty: 0.28
due: 2026-03-28T10:00:00.000Z
last-review: 2026-03-07T10:00:00.000Z
reps: 14
lapses: 0
state: review

When should you use BTreeMap instead of HashMap?
***
Use BTreeMap when you need sorted key ordering, range queries (`range()`), or deterministic iteration order. HashMap is faster for individual lookups (O(1) vs O(log n)) but provides no ordering guarantees.
```

```osmosis
id: dev-ds-002
type-in: true
stability: 4.8
difficulty: 0.42
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 6
lapses: 1
state: review

HashMap's `entry(key).or_insert(value)` method inserts a value only if the key is ___
***
absent
```

```osmosis
id: dev-ds-003
stability: 0.4
difficulty: 0.65
due: 2026-03-10T15:00:00.000Z
last-review: 2026-03-10T11:00:00.000Z
reps: 8
lapses: 3
state: relearning

==VecDeque== provides O(1) push and pop at both ends using a ring buffer, while ==Vec== only provides O(1) push and pop at the back.
```

```osmosis
id: dev-ds-004

What is the default hash algorithm used by Rust's HashMap, and why?
***
SipHash. It is designed to be resistant to HashDoS attacks (where an attacker crafts inputs that cause hash collisions), trading a small amount of speed for security. For performance-critical code, you can swap in faster hashers like `ahash` or `FxHashMap`.
```
