---
osmosis-cards: true
osmosis-deck: tests/tap-drag-pan
---

# Rail Signalling ^os-tdroot

## Block Systems ^os-tdhd01

- A fixed block is a length of track that only one train may occupy ^os-tdbul1
- A moving block sizes the gap from the train's own braking distance ^os-tdbul2
	- The radio link reports position continuously, not at each trackside sensor ^os-tdbul3
- This bullet is untagged and must always stay visible

## Signal Aspects ^os-tdhd02

- A double yellow warns that the next signal will show a single yellow ^os-tdbul4
- A flashing yellow announces a diverging route taken at reduced speed ^os-tdbul5

## Interlocking ^os-tdhd03

- The interlocking refuses any signal that conflicts with a route already set ^os-tdbul6
- Relay interlockings encode those rules as physical relay contacts ^os-tdbul7

## Train Protection ^os-tdhd04

- Automatic train protection applies the brakes at a signal passed at danger ^os-tdbul8
- Cab signalling moves the aspect from the lineside into the driver's desk ^os-tdbul9

```osmosis
Which system sizes the safe gap from the train's braking distance?
***
A moving block system
```
