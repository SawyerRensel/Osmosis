# Long Code Plates

## Galley script

```js
// galley.js
function stowGalley() {
  let locker = '';
  let shelf = '';
  let roll = Math.floor(Math.random() * 7);
  switch (roll) {
    case 0:
      locker = 'port';
      shelf = 'Pots and pans';
      break;
    case 1:
      locker = 'starboard';
      shelf = 'Tins, jars and dry stores';
      break;
    case 2:
      locker = 'forward';
      shelf = 'Kettle';
      break;
  }
  var label = document.getElementById('galley-locker-label');
  label.textContent = `${locker}: ${shelf}, stowed and latched before we cast off`;
  label.dataset.checklist = 'galley-before-departure|stove-off|gas-valve-closed|fridge-latched|lockers-latched|sink-dry';
  label.style.fontFamily = shelf;
}
```

## Passage notes

The forecast for the crossing is a steady southwesterly of fifteen knots, backing south by evening, so we leave on the morning ebb, carry the tide past the headland, reef early before the overfalls, keep the galley stowed until we clear the shipping lane, and plan to pick up a mooring in the outer harbour before dark with the second reef still tucked in.

## Long token

```text
harbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbourharbour
```
