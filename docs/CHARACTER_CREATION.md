# Character Creation — Design

Goal: a **deep, good-looking character creator with plenty of choices**, in the
spirit of **Perfect World** — but built realistically for a browser 3D game, in
stages.

## What Perfect World's creator does (the bar we're aiming at)

- Flow: **Race → Gender → Face → Hair → Body → Class → Name**.
- A **slider system** for almost everything: eye spacing, brow shape, nose, jaw,
  skin tone, torso size, limb width, height, hair style + color, etc.
- A **rotating, well-lit 3D preview** of the character while you edit.
- Niceties: a "reference picture" overlay, and later in-game "makeover scrolls"
  so looks aren't permanent (only race/class/server are).

Sources: PWI wiki — Character Creation / Character Customization.

## Reality check for our project

PW-level **face/body sliders require a rigged humanoid mesh with morph targets
(blend shapes)**. Our current hero is a primitive capsule — it can't morph a
face. So the depth of customization is gated by the **avatar tech** we choose.
That's the one decision that shapes everything else.

### Avatar-tech options

1. **Modular stylized character (CC0)** — a low-poly humanoid with swappable
   parts (head, hair, torso, legs) + color tints, plus a few body-proportion
   sliders.
   - + CC0/offline, matches our stylized look, full control, no dependencies.
   - − "part swap + tint + a few sliders" rather than PW's fine-grained face
     sliders. Still *plenty* of choices.

2. **Ready Player Me** — free, customizable full-body avatars (GLB) via their
   in-browser creator; standard humanoid rig (works with Mixamo animations).
   - + Fast path to near-PW depth (faces, hair, skin, outfits) with little
     authoring; great preview.
   - − External service + internet dependency; semi-realistic style (less
     stylized); avatars are edited in their widget, not our own sliders.

3. **Morph-target base mesh** (MakeHuman / authored in Blender) — true PW-style
   sliders on a single mesh.
   - + Closest to Perfect World.
   - − The most authoring/integration work and the heaviest assets.

### Recommendation — staged

- **Phase A (build now): the creation FLOW + UI + 3D preview**, using the
  **modular stylized** approach. Deliver the PW *experience* (multi-step screen,
  rotating lit preview, lots of choices) with: body type/height, skin/hair/eye
  colors, hairstyle, a few face presets, **class + starting weapon**, and
  **name**. Persist to `localStorage`; the hall/fight scene reads it to build the
  hero.
- **Phase B (deepen later): real sliders** via either Ready Player Me (fast,
  realistic) or a morph-target head (stylized, more work) — decided once the flow
  exists and we know the art direction.

## Data model (rendering-independent, per the roadmap)

```js
character = {
  name: 'Kirito',
  class: 'swordsman',          // drives starting weapon + later skills
  appearance: {
    bodyType: 'medium',        // slim | medium | broad
    height: 1.0,               // 0.9 – 1.1 scale
    skin: '#caa07a',
    hair: { style: 'short', color: '#3a2a1a' },
    eyes: '#3a6ad0',
    primary: '#3aa0ff',        // outfit accent
  },
}
```

Saved under `localStorage['bossraid.character.v1']`. The 3D hero is assembled
from this; the creator and the game share one builder so the preview == the
in-game character.

## Classes (starting set — extensible)

- **Swordsman** — melee, balanced (the current sword kit).
- **Archer/Mage** — ranged (uses the bolt we already prototyped).
- (More later; classes are data-driven so adding one is one entry + a skill set.)

## Open decision for Alison

**Art direction for the avatar:** stylized modular (CC0, offline, we own the
sliders) vs Ready Player Me (realistic, fast, external). This picks the path for
Phase B and what assets we source (Poly Haven / free3d / freestylized are great
for *environment* art; characters need one of the above).
