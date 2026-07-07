# KeyMines 65% — React Edition

The Mines crash game on a realistic 65% mechanical keyboard, ported to React (Vite).

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Project structure

```
src/
├── main.jsx            # Entry point
├── App.jsx             # Layout + sound/effect orchestration + physical keyboard
├── config.js           # Game config, 65% layout, key mappings
├── audio.js            # Synth "thock" + recorded keystroke sample
├── fair.js             # Provably-fair mine placement (simulated)
├── styles.css          # Theme variables + all styling
├── hooks/
│   └── useGame.js      # Pure game state & logic
└── components/
    ├── OledBar.jsx     # Balance / bet / mines / multiplier display
    ├── Keyboard.jsx    # 65% key rows
    ├── Key.jsx         # Single 3D keycap
    ├── Track.jsx       # Brass multiplier track
    ├── Actions.jsx     # START / RANDOM / CASH OUT / NEW ROUND
    └── Effects.jsx     # Floating gems + confetti
public/
└── sounds/             # Keystroke sample for safe reveals
```

## Customizing

- **Theme:** edit the `:root` variables at the top of `src/styles.css` (key size `--u`, colors, depths).
- **Game rules:** edit `CONFIG` in `src/config.js` (bet limits, house edge, balances).
- **Layout:** edit `KB_ROWS` in `src/config.js` — widths are in `u` units.

## How to play

1. Set bet and mine count, press **START GAME**.
2. Click any key on the board — letters, numbers, modifiers, even Space — or press it on your physical keyboard.
3. 💎 safe reveals raise the multiplier; 💀 mines end the round.
4. **CASH OUT** any time to bank `bet × multiplier`.
