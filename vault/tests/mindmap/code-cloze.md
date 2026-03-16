---
osmosis-cards: true
osmosis-deck: programming
osmosis-styles:
  theme: Monokai
---


# Code Cloze Deletions

Examples of code cloze flashcards across different languages.

## Python - Fibonacci

````osmosis
id: py-fib01
c1-due: 2026-03-09T18:14:18.470Z
c1-stability: 0.0834
c1-difficulty: 8.8063
c1-reps: 2
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-03-09T18:13:18.470Z
c2-due: 2026-03-09T18:08:04.421Z
c2-stability: 2.3065
c2-difficulty: 2.1181
c2-reps: 1
c2-lapses: 0
c2-state: learning
c2-last-review: 2026-03-09T17:58:04.421Z

```python
def fibonacci(n):
    if n <= 1:
        return n  # osmosis-cloze
    # osmosis-cloze-start
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
    # osmosis-cloze-end
```
````

## JavaScript - Array Methods

````osmosis
id: js-array01
c1-due: 2026-03-09T18:14:20.536Z
c1-stability: 0.0834
c1-difficulty: 8.8063
c1-reps: 2
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-03-09T18:13:20.536Z

```javascript
function removeDuplicates(arr) {
    return [...new Set(arr)];  // osmosis-cloze
}
```
````

## TypeScript - Generic Constraint

````osmosis
id: ts-gen01
c1-due: 2026-03-15T15:03:17.839Z
c1-stability: 0.0834
c1-difficulty: 8.8063
c1-reps: 2
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-03-15T15:02:17.839Z

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
    return obj[key];  // osmosis-cloze
}
```
````

## Rust - Ownership and Borrowing

````osmosis
id: rs-own01
c1-due: 2026-03-09T18:04:35.061Z
c1-stability: 1.2931
c1-difficulty: 5.1122
c1-reps: 1
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-03-09T17:58:35.061Z

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    // osmosis-cloze-start
    if x.len() > y.len() {
        x
    } else {
        y
    }
    // osmosis-cloze-end
}
```
````

## Go - Error Handling

````osmosis
id: go-err01
c1-due: 2026-03-09T18:08:42.366Z
c1-stability: 2.3065
c1-difficulty: 2.1181
c1-reps: 1
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-03-09T17:58:42.366Z

```go
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, fmt.Errorf("division by zero")  // osmosis-cloze
    }
    return a / b, nil  // osmosis-cloze
}
```
````

## SQL - Window Function

````osmosis
id: sql-win01

```sql
SELECT
    employee_name,
    department,
    salary,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) as rank  -- osmosis-cloze
FROM employees;
```
````

## HTML/CSS - Flexbox Centering

````osmosis
id: css-flex01

```css
.container {
    display: flex;  /* osmosis-cloze */
    justify-content: center;  /* osmosis-cloze */
    align-items: center;  /* osmosis-cloze */
    height: 100vh;
}
```
````

## Mixed - Python with Hint

````osmosis
id: py-hint01
hint: Think about what makes a number not prime
deck: programming/python
c1-due: 2026-03-09T23:09:42.886Z
c1-stability: 0.2120
c1-difficulty: 6.4133
c1-reps: 1
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-03-09T23:08:42.886Z

```python
def is_prime(n):
    if n < 2:
        return False
    # osmosis-cloze-start
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    # osmosis-cloze-end
    return True
```
````
