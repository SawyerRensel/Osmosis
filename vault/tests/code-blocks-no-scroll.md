# Code blocks never scroll

## Short block

```js
const knots = speed * 1.944;
```

## Long lines wrap at about 100 columns

```js
function plotCourse(start, end, wind) { return legs(start, end).map((leg) => trim(leg, wind.direction, wind.speed, 0.85)); }
const tides = [0.4, 0.9, 1.6, 2.3, 2.8, 3.1, 3.0, 2.6, 2.0, 1.3, 0.7, 0.3, 0.2, 0.5, 1.1, 1.8, 2.4, 2.9, 3.1];
```

## One unbreakable token

```js
const route = "harbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbour";
```

## Tall block

```js
const crew = [];
for (let i = 0; i < 12; i++) {
  crew.push({ watch: i % 3, bunk: i });
}
const watches = groupBy(crew, (c) => c.watch);
const first = watches[0];
const second = watches[1];
const third = watches[2];
console.log(first.length, second.length, third.length);
export { watches };
```

## Callout holding code

> [!note] Rigging
> ```js
> const halyard = { length: 24, diameter: 10, material: "polyester", breakingLoad: 2900, splice: "eye" };
> ```

## Table

| Sail | Area | Notes |
| --- | --- | --- |
| Main | 18 m² | Two reefs |
| Genoa | 22 m² | Furling |

## Math

$$
v = \sqrt{\frac{2 g h}{1 + \frac{I}{m r^2}}}
$$
