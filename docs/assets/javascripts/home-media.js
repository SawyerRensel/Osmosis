/* ==========================================================================
   Landing page — media swap

   A group of feature rows drives a single stacked visual: pointing at a row
   brings its frame to the front. Markup contract:

     <ul data-osmosis-swap="study">
       <li data-osmosis-swap-key="spatial"> … </li>

     <div class="osmosis-swap" data-osmosis-swap-target="study">
       <img data-osmosis-swap-key="spatial" …>

   The keys tie the two together; the group name ties a row list to its stack.
   Every frame is in the DOM with its own alt text, so the content is complete
   before this file runs — the swap is decoration on top of a page that already
   works without it. home.css shows the first frame when nothing is active,
   which is the no-JavaScript state.
   ========================================================================== */

(function () {
  "use strict";

  var KEY = "data-osmosis-swap-key";

  document.querySelectorAll("[data-osmosis-swap]").forEach(function (group) {
    var name = group.getAttribute("data-osmosis-swap");
    var stack = document.querySelector(
      '[data-osmosis-swap-target="' + name + '"]'
    );
    if (!stack) return;

    var frames = {};
    stack.querySelectorAll("[" + KEY + "]").forEach(function (frame) {
      frames[frame.getAttribute(KEY)] = frame;
    });

    var triggers = Array.prototype.filter.call(
      group.querySelectorAll("[" + KEY + "]"),
      function (trigger) {
        return frames[trigger.getAttribute(KEY)];
      }
    );
    if (!triggers.length) return;

    function show(key) {
      Object.keys(frames).forEach(function (frameKey) {
        frames[frameKey].classList.toggle("is-active", frameKey === key);
      });
      triggers.forEach(function (trigger) {
        trigger.classList.toggle(
          "is-active",
          trigger.getAttribute(KEY) === key
        );
      });
    }

    var fallback = triggers[0].getAttribute(KEY);

    triggers.forEach(function (trigger) {
      var key = trigger.getAttribute(KEY);
      var reveal = function () {
        show(key);
      };
      /* Keyboard reaches the rows because they are focusable, and a tap on a
         touch screen lands as a click — neither gets a hover to work with. */
      trigger.tabIndex = 0;
      trigger.addEventListener("pointerenter", reveal);
      trigger.addEventListener("focus", reveal);
      trigger.addEventListener("click", reveal);
    });

    /* Only fires on leaving the list itself, so travelling between rows does
       not flicker back through the default frame. Restricted to the mouse:
       a touch pointer leaves the moment the finger lifts, which would snap a
       tapped row straight back to the default. */
    group.addEventListener("pointerleave", function (event) {
      if (event.pointerType === "mouse") show(fallback);
    });

    show(fallback);
  });
})();
