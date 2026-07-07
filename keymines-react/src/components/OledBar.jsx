import { CONFIG } from '../config.js';

const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export default function OledBar({
  bet, setBet, minesCount, setMines, mode, setMode,
  balance, multiplier, profit, gameStatus, safeRevealed,
}) {
  const playing = gameStatus === 'playing';
  const safe = CONFIG.totalKeys - minesCount;
  const hint = playing
    ? `${minesCount} mines · ${safe - safeRevealed}/${safe} keys`
    : `${minesCount} mines · ${safe} play keys`;

  return (
    <div className="oled-bar">
      <div className="brand">
        <h1>KeyMines 65%</h1>
        <p>Mechanical Edition</p>
        <div className="mode-pill">
          {['demo', 'real'].map((m) => (
            <button
              key={m}
              className={mode === m ? 'on' : ''}
              onClick={() => !playing && setMode(m)}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="oled-center">
        <div className="stepper">
          <span>BET</span>
          <div className="stepper-box">
            <button disabled={playing} onClick={() => setBet(bet - CONFIG.betStep)}>−</button>
            <input
              type="number"
              value={bet}
              min={CONFIG.minBet}
              step="0.01"
              disabled={playing}
              onChange={(e) => setBet(+e.target.value)}
            />
            <button disabled={playing} onClick={() => setBet(bet + CONFIG.betStep)}>+</button>
          </div>
        </div>
        <div className="stepper">
          <span>MINES</span>
          <div className="stepper-box">
            <button disabled={playing} onClick={() => setMines(minesCount - 1)}>−</button>
            <input
              type="number"
              value={minesCount}
              min="1"
              max={CONFIG.totalKeys - 1}
              disabled={playing}
              onChange={(e) => setMines(+e.target.value)}
            />
            <button disabled={playing} onClick={() => setMines(minesCount + 1)}>+</button>
          </div>
        </div>
        <span className="hint">{hint}</span>
      </div>

      <div className="oled-right">
        <div><span className="lbl">BALANCE </span><span className="val val--bal">{fmt(balance)}</span></div>
        <div><span className="lbl">MULT </span><span className="val val--mult">{multiplier.toFixed(2)}×</span></div>
        <div><span className="lbl">PROFIT </span><span className="val val--profit">{(profit >= 0 ? '+' : '') + fmt(profit)}</span></div>
      </div>
    </div>
  );
}
