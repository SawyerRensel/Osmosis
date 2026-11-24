# Galley Scripts

## Functions

### Helper functions

- Call one function inside another so each galley step stays small and easy to test

```js
function portions(crew, servings) {
  return crew * servings;
}

function riceCups(crew) {
  return portions(crew, 2) * 0.5;
}

console.log(riceCups(6)); // 6
```

### Higher-order functions

- accept other functions as arguments
- or return functions as outputs

#### Functions as data

```js
const boil = (minutes) => `boil ${minutes} min`;
const simmer = boil;

console.log(simmer.name); // boil
console.log(simmer(12)); // boil 12 min

const steps = [boil, simmer];
steps.forEach((step) => {
  console.log(step(5));
});
```

#### Functions as parameters

```js
const timeIt = (task) => {
  const start = Date.now();
  task();
  return Date.now() - start;
};
```

```js
const stirTwice = (stir) => {
  stir();
  stir();
};

stirTwice(() => {
  console.log("stir the pot");
});
```

### Calling

- Code inside a function only runs when the function is called by name

```js
serveSoup();
```

#### return

- the returned value replaces the call
- passing values out of a function

```js
function bowls(crew) {
  return crew + 1;
}
```

```js
const extra = bowls(4);
console.log(extra); // 5
```

### Arrow functions

```js
const knots = (speed) => {
  return speed * 0.87;
};
```

#### Concise body

```js
const square = (cups) => cups * cups;
const half = (cups) => cups / 2;
```

```js
const label = (dish) =>
  dish.toUpperCase();

console.log(label("stew"));
```

### Function expressions

```js
const brew = function (cups) {
  if (cups > 4) {
    return "use the big kettle";
  }
  return "use the small kettle";
};
```

### Default parameters

```js
function toast(slices = 2) {
  return `toast ${slices} slices`;
}
```

- defaults fill in missing arguments

## Objects

### Getters

- read a property through a method
- can check the value before handing it back

```js
const pantry = {
  _flour: 3,
  get flour() {
    return this._flour > 0 ? this._flour : "restock flour";
  },
};
```

### Setters

```js
const pantry = {
  _rice: 0,
  set rice(cups) {
    if (typeof cups === "number") {
      this._rice = cups;
    } else {
      console.log("rice must be a number");
    }
  },
};

pantry.rice = 4;
```

- reassign the value of an existing property inside the object

#### Benefits

- validate what gets stored
- keep the stored name private

- Same benefits as getters

## Loops

- A loop repeats a block of code until its condition is false, which saves writing the same galley step for every crew member

```js
const crew = ["Ana", "Bo", "Cy", "Di"];
const plates = [];

for (let i = 0; i < crew.length; i++) {
  plates.push({
    name: crew[i],
    portion: 2,
  });
}

console.log(plates.length); // 4
console.log(plates[0].name); // Ana
```

### for...of

```js
for (const name of crew) {
  console.log(`serve ${name}`);
}
```

- reads each value in order
- works on strings too
