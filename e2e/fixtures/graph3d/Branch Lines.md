---
osmosis-styles:
  branchLineStyle: curved
  styles:
    "^os-brl01":
      branchLine:
        style: straight
        color: "#4fc3f7"
    "^os-brl02":
      branchLine:
        style: angular
        color: "#ba68c8"
    "^os-brl03":
      branchLine:
        style: rounded-elbow
        color: "#ffb74d"
    "^os-brl04":
      branchLine:
        pattern: dashed
        color: "#e57373"
    "^os-brl05":
      branchLine:
        pattern: dotted
    "^os-brl06":
      branchLine:
        thickness: 6
        color: "#81c784"
    "^os-brl07":
      branchLine:
        thickness: 6
        taper: fade
    "^os-brl08":
      branchLine:
        thickness: 6
        taper: grow
        style: angular
---

# Branch Lines

The map default is curved, so every edge with no style of its own curves. Links out to [[Rigging]], whose edges have no style and stay straight.

## Shapes

- Straight run ^os-brl01
	- Close-hauled
- Angular tack ^os-brl02
	- Port tack
	- Starboard tack
- Rounded gybe ^os-brl03
	- Gybe preventer
- Curved reach
	- Beam reach
	- Broad reach

## Patterns

- Dashed lifeline ^os-brl04
	- Jackstays
- Dotted tow line ^os-brl05
	- Bridle
- Thick anchor rode ^os-brl06
	- Chain
	- Nylon warp
- Fading wake ^os-brl07
	- Prop wash
- Growing swell ^os-brl08
	- Long-period swell
