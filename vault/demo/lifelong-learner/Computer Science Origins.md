---
osmosis-cards: true
osmosis-deck: history-of-science/computing
osmosis-styles:
  theme: Everforest
  topicShape: rounded-rect
  branchLineStyle: rounded-elbow
  branchLineTaper: grow
---

# The Origins of Computer Science

Modern computing emerged from a convergence of mathematics, engineering, and wartime urgency. The foundational concepts — algorithms, stored programs, universal computation — were established decades before the first personal computer.

![Alan Turing portrait](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Alan_Turing_Aged_16.jpg/400px-Alan_Turing_Aged_16.jpg)

## Alan Turing (1912–1954)

- British mathematician and logician
- **1936 — "On Computable Numbers"**
	- Introduced the **Turing machine** — a theoretical device that can compute anything computable
	- Proved that some problems are **undecidable** (the halting problem)
	- Established the mathematical foundations of computer science
- **World War II — Bletchley Park**
	- Led the effort to crack the German Enigma cipher
	- Designed the **Bombe** — an electromechanical device for breaking Enigma
	- Estimated to have shortened the war by two years, saving millions of lives
- **1950 — "Computing Machinery and Intelligence"**
	- Proposed the **Turing test** for machine intelligence
	- Asked: "Can machines think?"
- Prosecuted for homosexuality in 1952; died in 1954. Posthumously pardoned in 2013.

## John von Neumann (1903–1957)

- Hungarian-American mathematician and polymath
- Contributed to quantum mechanics, game theory, nuclear physics, and computing
- **The von Neumann Architecture** (1945)
	- A stored-program computer where **instructions and data share the same memory**
	- Components: CPU (control unit + ALU), memory, input/output
	- Nearly all modern computers follow this architecture
- Worked on EDVAC — one of the first stored-program computers
- Also contributed to the Manhattan Project and early Monte Carlo simulations

## Early Machines

| Machine | Year | Location | Key Innovation |
|---|---|---|---|
| **Colossus** | 1943 | Bletchley Park, UK | First programmable electronic digital computer; cracked Lorenz cipher |
| **ENIAC** | 1945 | University of Pennsylvania | First general-purpose electronic computer; 17,468 vacuum tubes |
| **EDVAC** | 1949 | University of Pennsylvania | First stored-program computer (von Neumann architecture) |
| **Manchester Baby** | 1948 | University of Manchester | First to run a stored program from electronic memory |
| **UNIVAC I** | 1951 | Remington Rand | First commercial computer; predicted Eisenhower's 1952 election victory |

## Foundational Concepts

### The Algorithm
- A finite sequence of well-defined instructions for solving a problem
- Predates computers by centuries — named after the Persian mathematician **al-Khwarizmi** (c. 780–850)
- Turing formalized what it means for a problem to be "computable"

### Boolean Logic
- **George Boole** (1815–1864) developed an algebra of logic using AND, OR, NOT
- **Claude Shannon** (1916–2001) showed in his 1937 master's thesis that Boolean algebra maps directly onto electrical circuits
	- This insight is the theoretical foundation of all digital hardware

### Information Theory
- Also developed by **Claude Shannon** (1948)
- Defined the **bit** as the fundamental unit of information
- Established limits on data compression and reliable communication
- Shannon is often called the "father of the information age"

## Legacy

- From room-sized vacuum-tube machines to billions of transistors on a chip
- Turing's theoretical framework still defines what computers can and cannot do
- Von Neumann's architecture remains the blueprint for modern processors
- The concepts of algorithms, Boolean logic, and information theory underpin every digital system

---

```osmosis
id: sci-cs-001
stability: 6.1
difficulty: 0.48
due: 2026-03-14T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 4
lapses: 0
state: review

![Alan Turing](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Alan_Turing_Aged_16.jpg/220px-Alan_Turing_Aged_16.jpg)

What is a Turing machine, and why is it important?
***
A **theoretical device** (proposed by Alan Turing in 1936) consisting of an infinite tape, a read/write head, and a set of rules. It can compute anything that is computable. It established the **mathematical foundations of computer science** and defined the limits of computation.
```

```osmosis
id: sci-cs-002
type-in: true
stability: 0.7
difficulty: 0.58
due: 2026-03-10T17:00:00.000Z
last-review: 2026-03-10T09:00:00.000Z
reps: 1
lapses: 0
state: learning

In the von Neumann architecture, instructions and data share the same ___
***
memory
```

```osmosis
id: sci-cs-003
stability: 0.6
difficulty: 0.72
due: 2026-03-10T13:00:00.000Z
last-review: 2026-03-10T09:00:00.000Z
reps: 7
lapses: 2
state: relearning

Who showed that Boolean algebra could be implemented with electrical circuits, forming the basis of all digital hardware?
***
**Claude Shannon**, in his 1937 master's thesis at MIT. He demonstrated that Boolean logic (AND, OR, NOT) maps directly onto relay circuits, bridging abstract mathematics and physical engineering.
```

```osmosis
id: sci-cs-004
type-in: true

The ENIAC, completed in 1945, used 17,468 ___ as its switching elements
***
vacuum tubes
```
