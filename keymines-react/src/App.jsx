import { useCallback, useEffect, useRef, useState } from 'react';
import { PHYS_MAP, ALL_LABELS, BOARD_KEYS } from './config.js';
import { clickSound, safeSound, explosionSound, winSound } from './audio.js';
import { useGame, calcMult } from './hooks/useGame.js';
import OledBar from './components/OledBar.jsx';
import KeyboardScene from './three/KeyboardScene.jsx';
import Track from './components/Track.jsx';
import Actions from './components/Actions.jsx';
import FairPanel from './components/FairPanel.jsx';
import { Confetti, CenterPops, Banner } from './components/Effects.jsx';

let effectId = 0;

export default function App() {
  const game = useGame();
  const chassisRef = useRef(null);
  const [confetti, setConfetti] = useState([]);
  const [shaking, setShaking] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [pops, setPops] = useState([]);
  const [banner, setBanner] = useState(null);
  const [pressed, setPressed] = useState(null); // { keyId, id } press signal for the 3D keys

  const spawnPop = (text) => {
    const pop = { id: ++effectId, text };
    setPops((p) => [...p, pop]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== pop.id)), 850);
  };

  const showBanner = (text, kind) => {
    setBanner({ id: ++effectId, text, kind });
    setTimeout(() => setBanner((b) => (b?.text === text ? null : b)), 1800);
  };

  const burstConfetti = () => {
    const r = chassisRef.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const pieces = Array.from({ length: 20 }, () => ({
      id: ++effectId,
      x: cx + (Math.random() - 0.5) * 80,
      y: cy,
    }));
    setConfetti((c) => [...c, ...pieces]);
    setTimeout(() => {
      setConfetti((c) => c.filter((p) => !pieces.includes(p)));
    }, 900);
  };

  /* --- unified key press (mouse click on 3D key + physical keyboard) --- */
  const handlePress = useCallback((keyId) => {
    setPressed({ keyId, id: ++effectId });

    if (game.gameStatus !== 'playing') {
      clickSound();
      return;
    }

    const outcome = game.reveal(keyId);
    if (outcome === 'safe') {
      safeSound();
      spawnPop(`${calcMult(game.safeRevealed + 1, game.minesCount).toFixed(2)}×`);
    } else if (outcome === 'mine') {
      explosionSound();
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } else {
      clickSound(); // already revealed
    }
  }, [game]);

  /* --- physical keyboard --- */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (document.activeElement?.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey || e.altKey) && !(e.key in PHYS_MAP)) return;

      let label = PHYS_MAP[e.key];
      if (!label && e.key.length === 1) label = e.key.toUpperCase();
      if (!label || !ALL_LABELS.has(label)) return;

      e.preventDefault();

      // Labels like Shift exist twice — press the first unrevealed match
      const candidates = BOARD_KEYS
        .map((k, i) => ({ label: k.l, keyId: i }))
        .filter((k) => k.label === label);
      const target =
        candidates.find((k) => !game.grid[k.keyId]?.isRevealed) ?? candidates[0];
      if (target) handlePress(target.keyId);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handlePress, game.grid]);

  /* --- round-outcome effects --- */
  const prevStatus = useRef(game.gameStatus);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = game.gameStatus;

    if (game.gameStatus === 'cashedout' && prev !== 'cashedout') {
      burstConfetti();
      winSound();
      showBanner('💎 CASHED OUT', 'win');
    }

    if (game.gameStatus === 'gameover' && prev !== 'gameover') {
      showBanner('💥 BOOM!', 'lose');
      // Let the mine burst land, then blow the whole keyboard apart
      const t = setTimeout(() => {
        setExploded(true);
        explosionSound();
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
      }, 600);
      return () => clearTimeout(t);
    }

    if (game.gameStatus === 'idle' || game.gameStatus === 'playing') {
      setExploded(false);
    }
  }, [game.gameStatus]);

  const profit =
    game.gameStatus === 'playing' || game.gameStatus === 'cashedout' || game.gameStatus === 'gameover'
      ? game.bet * game.multiplier - game.bet
      : 0;

  return (
    <>
      <div
        className={`chassis${shaking ? ' chassis--shake' : ''}`}
        ref={chassisRef}
        data-state={game.gameStatus}
      >
        <OledBar
          bet={game.bet}
          setBet={game.setBet}
          minesCount={game.minesCount}
          setMines={game.setMines}
          mode={game.mode}
          setMode={game.setMode}
          balance={game.balance}
          multiplier={game.multiplier}
          profit={profit}
          gameStatus={game.gameStatus}
          safeRevealed={game.safeRevealed}
        />

        <KeyboardScene
          grid={game.grid}
          gameStatus={game.gameStatus}
          exploded={exploded}
          pressed={pressed}
          onPress={handlePress}
        />

        <p className={`msg${game.message.type ? ` msg--${game.message.type}` : ''}`}>
          {game.message.text}
        </p>

        <Track track={game.track} safeRevealed={game.safeRevealed} gameStatus={game.gameStatus} />

        <Actions
          gameStatus={game.gameStatus}
          safeRevealed={game.safeRevealed}
          onStart={() => { clickSound(); game.startGame(); }}
          onRandom={() => {
            clickSound();
            const keyId = game.randomGameId();
            if (keyId !== null) handlePress(keyId);
          }}
          onCashOut={() => { clickSound(); game.cashOut(); }}
          onNewRound={() => { clickSound(); game.newRound(); }}
        />

        <div className="brass-weight">KEYMINES · MECHANICAL · TRUE 3D</div>
        <div className="rgb" />
        <FairPanel game={game} />
      </div>

      <Confetti pieces={confetti} />
      <CenterPops pops={pops} />
      <Banner banner={banner} />
    </>
  );
}
