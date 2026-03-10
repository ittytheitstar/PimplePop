# PimplePop 🧴

A mobile-first, full-screen skin extraction simulator game hosted on GitHub Pages.

## 🎮 Play the Game

[**Play PimplePop →**](https://ittytheitstar.github.io/PimplePop/)

## 📱 How to Play

1. **Place two fingers** on either side of a pimple
2. **Slowly squeeze** and watch the **Discomfort Bar** — low discomfort means you have the right angle and pressure
3. **Maintain the correct angle and force** until the extraction progress bar fills
4. **Don't keep the client in pain** — if discomfort stays too high for too long, they quit!
5. **Extract all pimples** to complete the level

## 🌟 Pimple Types

| Type       | Difficulty | Points | Tip |
|------------|-----------|--------|-----|
| Blackhead  | Easy       | 50     | Light, steady pressure |
| Whitehead  | Medium     | 100    | Medium pressure, correct angle |
| Cyst       | Hard       | 500    | Slow, precise, specific angle |

## 🛠️ Tech Stack

- **HTML5 Canvas** — Real-time skin texture and pimple rendering
- **Vanilla JavaScript** — Game loop, physics, input handling
- **Value Noise** — Procedural skin texture generation (pores, hair follicles, subsurface scattering)
- **Particle System** — Goo/extraction effects unique to each pimple type
- **CSS Animations** — HUD, discomfort bar pulsing, score popups
- **Touch API** — Native 2-finger squeeze detection for mobile
- **Mouse fallback** — Click-and-drag squeeze simulation for desktop

## 🔧 Architecture

The game is designed for extensibility:

```
game.js
├── ValueNoise          — Procedural texture generation
├── buildSkinTexture    — Skin canvas with pores, hair, subsurface variation
├── GooEffect           — Per-type particle burst + blob trail + splat marks
├── SkinDent            — Finger press visual deformation
├── Pimple              — Base class (whitehead / blackhead / cyst)
│   ├── processSqueeze  — Angle + force + speed evaluation
│   └── render*         — Type-specific canvas drawing
├── InputController     — Touch (2-finger) + Mouse (drag) squeeze detection
├── DiscomfortBar       — State machine with danger/quit timer
├── UI                  — HUD, feedback text, score popups, screens
└── PimplePopGame       — Game loop, level management, state machine
```

**Future expansion hooks** (currently architected for):
- 🔵 Numbing injection tool (reduce discomfort multiplier)
- 🔵 Comedone extractor (metal hoop — alternative extraction method)
- 🔵 Lancet / cutting tool (puncture cysts for easier extraction)
- 🔵 Cleaning swab (post-extraction hygiene scoring)
- 🔵 Client personality/pain tolerance profiles
- 🔵 Different skin areas (nose, back, etc.) with varied pimple density

## 🚀 Development

Static HTML/CSS/JS — no build step required.

```bash
# Serve locally
python3 -m http.server 8080
# Open http://localhost:8080
```
