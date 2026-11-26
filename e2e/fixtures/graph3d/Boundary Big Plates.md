---
osmosis-styles:
  styles:
    "^os-bbp001":
      boundary:
        enabled: true
    "^os-bbp002":
      boundary:
        fill: "#e0a030"
        opacity: 0.25
        color: "#c06010"
        width: 2
        style: dashed
---
# Galley Boundaries

## Bread day ^os-bbp001

Flour

Salt

Yeast

```js
// proving.js
function proveDough(kitchen) {
  let minutes = 0;
  let warm = kitchen.temperature > 24;
  let bowl = { covered: true, oiled: true };
  while (minutes < 90) {
    minutes += 15;
    if (!warm) {
      kitchen.moveBowl('oven with the light on');
      warm = true;
    }
    if (bowl.covered === false) {
      bowl.covered = true;
    }
  }
  const rise = kitchen.measure('dough height');
  if (rise < 2) {
    kitchen.note('Give it another half hour');
    return false;
  }
  kitchen.knockBack();
  kitchen.shape('two round loaves');
  kitchen.dust('rye flour');
  kitchen.score('a single deep cross');
  kitchen.preheat(230);
  kitchen.steam('a tray of water on the bottom shelf');
  kitchen.bake(35);
  kitchen.cool('on a wire rack, an hour at least');
  return true;
}
```

## Soup day ^os-bbp002

Onions

The stock wants to simmer gently for three hours with the lid half on, skimmed every half hour, then strained through muslin and cooled quickly in a sink of cold water before it goes into the fridge, so that it sets clear and keeps for the rest of the week.

Croutons
