---
osmosis-styles:
  styles:
    "^os-width01":
      width: 260
    "^os-width02":
      width: 360
---

# Code Fit Widths

## Fitted code ^os-fit-head

Short paragraph that wraps at the normal node width because it is not a code block and it has no custom width.

```text
mooring40 port starboard bow stern keelx
mooring80 port starboard bow stern keel mast boom sheet halyard cleat port starb
mooring140 port starboard bow stern keel mast boom sheet halyard cleat port starboard bow stern keel mast boom sheet halyard cleat port star
```
^os-fit-code

```text
mooring40 port starboard bow stern keelx
```

Narrow single line above, longest-line fit.

## Custom widths

A paragraph with a custom width of 260 that has plenty of words so that it has to wrap onto several lines inside it. ^os-width01

```text
mooring40 port starboard bow stern keelx
mooring80 port starboard bow stern keel mast boom sheet halyard cleat port starb
mooring140 port starboard bow stern keel mast boom sheet halyard cleat port starboard bow stern keel mast boom sheet halyard cleat port star
```
^os-width02
