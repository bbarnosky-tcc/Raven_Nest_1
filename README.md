# Marble Run Lab

A browser game where students design their own marble run, test it with a simulated marble, and time it.

**To play:** open `index.html` in a web browser (Chrome, Edge, Firefox or Safari, including Chromebooks). You don't need to install anything or connect to the internet. The physics engine ([Matter.js](https://brm.io/matter-js/) 0.19.0, MIT license) is included in `lib/`. You can also host the folder on any static web host, such as GitHub Pages.

## How to play

1. **Build height with bases.** Drag a Wall, Cardboard Box, Pillar, Table/Shelf or Book Stack onto the board. Click a piece to resize it with the sliders.
2. **Add simple machines.** Drag pieces onto the board and resize or rotate them.
   - When **Snap & connect** is on, the blue connection dots snap together and a bolt shows that the two pieces are joined.
   - Pieces also settle onto the top of a base or onto the floor.
   - To make copies of a piece, use **Duplicate** (Ctrl+D) or copy/paste (Ctrl+C / Ctrl+V).
3. **Place one Start Gate and one Finish Cup.**
4. **Press ▶ Test Run** (or Space). The marble is released and the timer starts. The timer stops when a marble lands in the Finish Cup.
   - A run also stops if every marble sits still for 4 seconds (**stuck**), if the marble leaves the board (**lost**), or after 60 seconds.
5. Change your design and test again. The **Run Log** keeps every attempt and highlights your best time.

### Pieces

| Bases | Simple machines | Start & finish |
|---|---|---|
| Wall, Cardboard Box, Pillar, Table / Shelf, Book Stack | Ramp, Curved Ramp, Funnel, Screw, Newton's Cradle, Lever / Seesaw, Wheel & Axle, Wedge | Start Gate, Finish Cup, Relay Marble |

### Controls

| Key | Action |
|---|---|
| Space | Test run / stop |
| Q / E | Rotate 15° |
| Arrow keys | Nudge 1 unit (Shift: 10) |
| Ctrl+D | Duplicate |
| Ctrl+C / Ctrl+V | Copy / paste |
| Delete | Remove the selected piece |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Esc | Deselect / stop the test |

- **Save** keeps designs in this browser. **Export** downloads a `.json` file that students can turn in or swap with each other, and **Import** opens one.
- **Marble type** sets which marble is released:
  - glass
  - steel, which is heavy and less bouncy
  - rubber, which is light and very bouncy
- **Speed** gives slow motion for watching closely.

## Teacher notes

- **The timer is fair and repeatable.** It counts simulated seconds at a fixed step of 1/120 s. The same design always gives the same time, on any computer and at any playback speed. That means students can treat the time as a measurement.
- **The physics is realistic.** The marble rolls like a solid sphere (moment of inertia ⅖·m·r²), so steeper ramps really are faster. For example, a 600-unit ramp takes about 6.6 s at 10°, 3.9 s at 20° and 2.9 s at 30°.
- **How each piece maps to a simple machine:**
  - **Inclined plane:** Ramp and Curved Ramp. The Funnel is two inclined planes that meet.
  - **Screw:** an inclined plane wrapped around a post. The side view shows the spiral as a zig-zag chute.
  - **Lever:** Lever / Seesaw. Move the fulcrum to change which side tips.
  - **Wheel and axle:** a paddle wheel on an axle.
  - **Wedge:** steers or splits the marble's motion.
  - **Newton's Cradle (energy and momentum transfer):** hitting one end makes the far ball swing out. Put a **Relay Marble** next to it so the energy carries on down the run. The timer stops when *any* marble reaches the Finish Cup.
- **Ideas for investigations:**
  - Ramp angle vs. time
  - Glass vs. steel vs. rubber marbles
  - Number of screw turns vs. time
  - Fastest run, or slowest run that still finishes (a "Rube Goldberg" challenge)

## Files

```
index.html          app page
css/style.css       layout and theme (light and dark)
js/pieces.js        piece catalog: shapes, sliders and connection points
js/editor.js        build mode: drawing, dragging, rotating, snapping, undo
js/sim.js           test runs: physics world, fixed-step timer, finish/stuck detection
js/storage.js       save, load, export and import
js/main.js          palette, inspector, test-run loop, run log, sample run
lib/matter.min.js   Matter.js 0.19.0 physics engine (MIT)
```
