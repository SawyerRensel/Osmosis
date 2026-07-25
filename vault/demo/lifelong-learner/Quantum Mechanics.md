---
osmosis-cards: true
osmosis-deck: history-of-science/physics
osmosis-styles:
  theme: Everforest
  balance: both-sides
  branchLineStyle: straight
  baseStyle:
    text:
      size: 14
      weight: 600
---

# Quantum Mechanics

Quantum mechanics governs the behavior of matter and energy at the smallest scales. It is spectacularly successful — no experiment has ever contradicted it — yet its implications remain deeply strange and hotly debated.

![Double-slit experiment](https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Double-slit.svg/400px-Double-slit.svg.png)

## Origins

- **1900 — Max Planck** introduces the quantum hypothesis
	- Energy is emitted and absorbed in discrete packets called **quanta** (`E = hf`)
	- Solved the "ultraviolet catastrophe" in blackbody radiation
- **1905 — Albert Einstein** explains the photoelectric effect
	- Light itself comes in quanta — **photons**
	- Won the Nobel Prize (1921) for this work, not for relativity
- **1913 — Niels Bohr** proposes the Bohr model of the atom
	- Electrons orbit in quantized energy levels
	- Transitions between levels emit or absorb photons of specific frequencies

## The Double-Slit Experiment

- Arguably the most important experiment in quantum physics
- Setup
	- Fire particles (photons, electrons) at a barrier with two narrow slits
	- Detect where they land on a screen behind the barrier
- Results
	- **Many particles** → an interference pattern (waves!)
	- **Observed one at a time** → each lands as a single point (particles!)
	- But over many single particles, the interference pattern builds up
	- **If you detect which slit each particle goes through** → the pattern disappears
- Implication: the act of measurement changes the outcome

## The Uncertainty Principle (1927)

- Formulated by **Werner Heisenberg**
- You cannot simultaneously know both the exact position and exact momentum of a particle
	- `Δx · Δp ≥ ℏ/2`
- This is not a limitation of instruments — it is a fundamental property of nature
- The more precisely you measure one, the less precisely you can know the other

## Erwin Schrödinger (1887–1961)

- Developed the **Schrödinger equation** — the master equation of quantum mechanics
	- Describes how the quantum state (wave function) evolves over time
- **Schrödinger's cat** — a thought experiment (1935)
	- A cat in a sealed box is simultaneously alive and dead until observed
	- Intended as a *critique* of the Copenhagen interpretation, not a literal proposal
	- Highlights the absurdity of superposition at macroscopic scales

## Interpretations of Quantum Mechanics

### Copenhagen Interpretation
- The dominant textbook view (Bohr, Heisenberg)
- The wave function represents our **knowledge** of the system
- Measurement causes **wave function collapse** — superposition resolves into a definite outcome
- It is meaningless to ask what a particle "really is" between measurements

### Many-Worlds Interpretation
- Proposed by Hugh Everett III (1957)
- **No collapse** — every possible outcome happens, each in a separate branch of reality
- The universe constantly splits into parallel versions
- Elegant mathematically; philosophically extravagant

### Pilot Wave Theory (de Broglie-Bohm)
- Particles have definite positions at all times, guided by a "pilot wave"
- Fully **deterministic** — restores classical-like intuition
- Reproduces all quantum predictions but requires nonlocal interactions
- Less popular but never refuted

### QBism (Quantum Bayesianism)
- The wave function reflects an **agent's personal beliefs**, not objective reality
- Measurement updates beliefs, like Bayesian inference
- Sidesteps the measurement problem entirely
- Controversial: critics say it's solipsistic

## Key Concepts Summary

- **Superposition** — a particle exists in multiple states simultaneously until measured
- **Entanglement** — two particles become correlated; measuring one instantly affects the other, regardless of distance
- **Quantization** — energy, angular momentum, and other properties come in discrete amounts
- **Wave-particle duality** — matter and light exhibit both wave and particle behavior

---

```osmosis
id: sci-qm-001
stability: 6.1
difficulty: 0.48
due: 2026-03-14T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 4
lapses: 0
state: review

![Double-slit experiment diagram](https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Double-slit.svg/220px-Double-slit.svg.png)

What happens in the double-slit experiment when you detect which slit each particle passes through?
***
The **interference pattern disappears** and you get two bands — as if the particles behave as classical particles. The act of measurement collapses the wave-like behavior.
```

```osmosis
id: sci-qm-002
c1-stability: 15.7
c1-difficulty: 0.33
c1-due: 2026-03-22T10:00:00.000Z
c1-last-review: 2026-03-07T10:00:00.000Z
c1-reps: 8
c1-lapses: 0
c1-state: review
c2-stability: 7.3
c2-difficulty: 0.45
c2-due: 2026-03-15T10:00:00.000Z
c2-last-review: 2026-03-08T10:00:00.000Z
c2-reps: 5
c2-lapses: 0
c2-state: review
c3-stability: 2.1
c3-difficulty: 0.58
c3-due: 2026-03-12T10:00:00.000Z
c3-last-review: 2026-03-10T10:00:00.000Z
c3-reps: 3
c3-lapses: 1
c3-state: learning

![Bohr atom model](https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Bohr_atom_model.svg/220px-Bohr_atom_model.svg.png)

==Heisenberg's== uncertainty principle states that you cannot simultaneously know both the exact ==position== and exact ==momentum== of a particle
```

```osmosis
id: sci-qm-003
stability: 22.3
difficulty: 0.32
due: 2026-03-24T10:00:00.000Z
last-review: 2026-03-06T10:00:00.000Z
reps: 11
lapses: 1
state: review

What is the Many-Worlds interpretation of quantum mechanics?
***
Proposed by Hugh Everett III — every possible measurement outcome actually occurs, each in a **separate branch of reality**. There is no wave function collapse; the universe constantly splits. Mathematically elegant but implies an enormous number of parallel worlds.
```

```osmosis
id: sci-qm-004
stability: 0.6
difficulty: 0.72
due: 2026-03-10T13:00:00.000Z
last-review: 2026-03-10T09:00:00.000Z
reps: 7
lapses: 2
state: relearning

What was Schrödinger's cat thought experiment intended to demonstrate?
***
It was intended as a **critique** of the Copenhagen interpretation — showing that applying quantum superposition to macroscopic objects (a cat being simultaneously alive and dead) leads to absurd conclusions. Schrödinger meant it as a *reductio ad absurdum*, not as a serious proposal.
```
