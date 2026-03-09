# Code Cloze Deletions

Examples of code cloze flashcards across different languages.

## Python - Fibonacci

````osmosis
id: py-fib01

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

```javascript
function removeDuplicates(arr) {
    return [...new Set(arr)];  // osmosis-cloze
}
```
````

## TypeScript - Generic Constraint

````osmosis
id: ts-gen01

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
    return obj[key];  // osmosis-cloze
}
```
````

## Rust - Ownership and Borrowing

````osmosis
id: rs-own01

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
