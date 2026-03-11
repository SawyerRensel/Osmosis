---
osmosis-cards: true
osmosis-styles:
  theme: Ocean
  topicShape: ellipse
  balance: both-sides
  styles:
    "# ECG Interpretation/## Systematic Approach to ECG Reading":
      fill: "#1a6fc4"
      shape: hexagon
      text:
        color: "#ffffff"
        weight: 700
      branchLine:
        color: "#4a9eff"
        thickness: 2
    "# ECG Interpretation/## ECG Waves and Their Significance":
      fill: "#2d9a4e"
      text:
        color: "#ffffff"
        weight: 700
      branchLine:
        color: "#4ade80"
        thickness: 2
    "# ECG Interpretation/## Key Intervals and Normal Values":
      fill: "#d97706"
      text:
        color: "#ffffff"
        weight: 700
      branchLine:
        color: "#fbbf24"
        thickness: 2
    "# ECG Interpretation/## Common ECG Patterns (High-Yield)":
      fill: "#c43a3a"
      text:
        color: "#ffffff"
        weight: 700
      border:
        color: "#ff6b6b"
        width: 2
      branchLine:
        color: "#f87171"
        thickness: 2.5
---

# ECG Interpretation

The electrocardiogram (ECG/EKG) is the most widely used cardiac diagnostic tool. A systematic approach to ECG interpretation is critical for identifying arrhythmias, ischemia, and structural abnormalities.

![Normal sinus rhythm ECG](https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/SinusRhythmLabels.svg/800px-SinusRhythmLabels.svg.png)

## Systematic Approach to ECG Reading

1. **Rate** — normal 60-100 bpm
2. **Rhythm** — regular or irregular? Sinus rhythm?
3. **Axis** — normal, left axis deviation, right axis deviation
4. **Intervals** — PR, QRS, QT
5. **Segments** — ST segment (elevation or depression)
6. **Waves** — P wave, QRS morphology, T wave, U wave

## ECG Waves and Their Significance

### P Wave

- Represents **atrial depolarization**
- Normal duration: < 0.12 seconds (< 3 small boxes)
- Normal amplitude: < 2.5 mm in lead II
- Best seen in leads II and V1
- **Absent P waves**: atrial fibrillation, junctional rhythm
- **P mitrale** (wide, notched in lead II): left atrial enlargement
- **P pulmonale** (tall, peaked in lead II): right atrial enlargement

### QRS Complex

- Represents **ventricular depolarization**
- Normal duration: 0.06–0.10 seconds (1.5–2.5 small boxes)
- **Wide QRS (> 0.12 s)**: bundle branch block, ventricular rhythm, hyperkalemia
- **LBBB pattern**: W in V1, M in V5-V6 ("WiLLiaM")
- **RBBB pattern**: M in V1, W in V5-V6 ("MaRRoW")
- Q waves may indicate prior myocardial infarction

### T Wave

- Represents **ventricular repolarization**
- Normally upright in leads I, II, V3-V6
- Normally inverted in aVR
- **Peaked T waves**: hyperkalemia (earliest sign)
- **Flattened T waves**: hypokalemia
- **T wave inversions**: ischemia, strain pattern, Wellens syndrome

### U Wave

- Small deflection after T wave
- Most prominent in leads V2-V3
- **Prominent U waves**: hypokalemia, bradycardia
- Often clinically insignificant

## Key Intervals and Normal Values

| Interval/Segment | Normal Range | Clinical Significance |
|---|---|---|
| **PR interval** | 0.12–0.20 sec | Prolonged: first-degree AV block; Short: pre-excitation (WPW) |
| **QRS duration** | 0.06–0.10 sec | Prolonged (>0.12): BBB, ventricular rhythm |
| **QT interval** | < 0.44 sec (corrected) | Prolonged: risk of Torsades de Pointes |
| **ST segment** | Isoelectric (flat) | Elevation: STEMI; Depression: ischemia, reciprocal changes |
| **RR interval** | 0.6–1.0 sec (at 60-100 bpm) | Irregular: atrial fibrillation, premature beats |

## Common ECG Patterns (High-Yield)

- **ST elevation + reciprocal depression** → STEMI (activate cath lab)
- **ST depression + T wave inversion** → NSTEMI or unstable angina
- **Peaked T waves → widened QRS → sine wave** → progressive hyperkalemia
- **Delta wave + short PR** → Wolff-Parkinson-White (WPW)
- **Sawtooth flutter waves** → atrial flutter (~300 bpm atrial rate)
- **Irregularly irregular + absent P waves** → atrial fibrillation
- **Osborn (J) waves** → hypothermia

---

## Flashcards

```osmosis
id: med-ecg-001
stability: 5.2
difficulty: 0.45
due: 2026-03-12T10:00:00.000Z
last-review: 2026-03-09T10:00:00.000Z
reps: 5
lapses: 0
state: review

What does the P wave represent on an ECG, and in which lead is it best visualized?
***
The P wave represents **atrial depolarization**. It is best visualized in **lead II** (upright) and **lead V1** (biphasic). Normal duration is < 0.12 seconds with amplitude < 2.5 mm in lead II.
```

```osmosis
id: med-ecg-002
stability: 0.5
difficulty: 0.7
due: 2026-03-10T14:00:00.000Z
last-review: 2026-03-10T10:00:00.000Z
reps: 6
lapses: 2
state: relearning

type-in: true

The normal PR interval is ___ to ___ seconds
***
0.12 to 0.20
```

```osmosis
id: med-ecg-003
stability: 25.4
difficulty: 0.3
due: 2026-03-25T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 12
lapses: 1
state: review

What is the mnemonic for distinguishing LBBB from RBBB on ECG?
***
**"WiLLiaM MaRRoW"**

- **LBBB**: **W** in V1, **M** in V5-V6 (WiLLiaM)
- **RBBB**: **M** in V1, **W** in V5-V6 (MaRRoW)

The M represents the rsR' pattern (two upward deflections) and W represents the rS pattern (two downward deflections).
```

```osmosis
id: med-ecg-004

The earliest ECG sign of hyperkalemia is ==peaked T waves==, which can progress to ==widened QRS== and eventually a ==sine wave== pattern
```
