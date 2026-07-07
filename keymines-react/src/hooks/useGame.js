import { useCallback, useMemo, useRef, useState } from 'react';
import { CONFIG, BOARD_KEYS } from '../config.js';
import { genSeed, sha256, placeMines } from '../fair.js';

/** Multiplier after n safe reveals (standard mines odds + house edge). */
export function calcMult(n, mines, total = CONFIG.totalKeys) {
  if (!n) return 1;
  let m = 1;
  for (let i = 0; i < n; i++) m *= (total - i) / (total - mines - i);
  return m * Math.pow(1 - CONFIG.houseEdge, n);
}

/**
 * All game state + actions. Pure logic — no sounds or DOM effects;
 * the caller reacts to the returned reveal outcome.
 */
export function useGame() {
  const [grid, setGrid] = useState([]); // one slot per board key: { label, keyId, isMine, isRevealed }
  const [minesCount, setMinesCount] = useState(3);
  const [bet, setBetState] = useState(10);
  const [mode, setMode] = useState('demo');
  const [balances, setBalances] = useState({
    demo: CONFIG.demoBalance,
    real: CONFIG.realBalance,
  });
  const [gameStatus, setGameStatus] = useState('idle'); // idle | playing | gameover | cashedout
  const [safeRevealed, setSafeRevealed] = useState(0);
  const [message, setMessage] = useState({ text: 'Press START — then click keys or type on your real keyboard', type: 'info' });
  const nonceRef = useRef(0);

  /* --- provably fair state (commit-reveal) --- */
  const [clientSeed, setClientSeedState] = useState(() => genSeed().slice(0, 20));
  const [serverSeed, setServerSeed] = useState(null); // revealed to UI only after settlement
  const [serverSeedHash, setServerSeedHash] = useState(null); // commitment, public at round start
  const [entropyHash, setEntropyHash] = useState(null); // sha256(server:client:nonce)
  const [roundId, setRoundId] = useState(0);

  const balance = balances[mode];
  const multiplier = calcMult(safeRevealed, minesCount);

  const setBalance = useCallback((v) => {
    setBalances((b) => ({ ...b, [mode]: v }));
  }, [mode]);

  const setBet = useCallback((v) => {
    const clamped = Math.max(CONFIG.minBet, Math.min(CONFIG.maxBet, Math.round(v * 10000) / 10000));
    setBetState(Number.isFinite(clamped) ? clamped : CONFIG.minBet);
  }, []);

  const setMines = useCallback((v) => {
    setMinesCount(Math.max(1, Math.min(CONFIG.totalKeys - 1, Math.round(v) || 1)));
  }, []);

  const startGame = useCallback(async () => {
    if (gameStatus === 'playing') return false;
    if (bet > balance) {
      setMessage({ text: 'Insufficient balance', type: 'lose' });
      return false;
    }

    setBalance(balance - bet);
    nonceRef.current += 1;
    const nonce = nonceRef.current;

    // Commit: server seed is fixed (and its hash publishable) before any reveal
    const seed = genSeed();
    const commitHash = await sha256(seed);
    const combined = await sha256(`${seed}:${clientSeed}:${nonce}`);
    const mineIds = await placeMines(CONFIG.totalKeys, minesCount, seed, clientSeed, nonce);

    setServerSeed(seed);
    setServerSeedHash(commitHash);
    setEntropyHash(combined);
    setRoundId(nonce);

    setGrid(BOARD_KEYS.map((k, i) => ({
      label: k.l,
      keyId: i,
      isMine: mineIds.has(i),
      isRevealed: false,
    })));
    setSafeRevealed(0);
    setGameStatus('playing');
    setMessage({ text: 'Click any key — or press it on your real keyboard', type: 'info' });
    return true;
  }, [gameStatus, bet, balance, minesCount, clientSeed, setBalance]);

  const cashOut = useCallback((auto = false, revealedCount = safeRevealed) => {
    if (gameStatus !== 'playing') return;
    if (!auto && !revealedCount) {
      setMessage({ text: 'Reveal a key first', type: 'info' });
      return;
    }

    const mult = calcMult(revealedCount, minesCount);
    const win = bet * mult;
    setBalance(balance + win);
    setGameStatus('cashedout');
    const profit = win - bet;
    setMessage({
      text: auto
        ? `🎉 Cleared! +${profit.toFixed(4)}`
        : `✅ ${mult.toFixed(2)}× +${profit.toFixed(4)}`,
      type: 'win',
    });
  }, [gameStatus, safeRevealed, minesCount, bet, balance, setBalance]);

  /** Reveal a key. Returns 'safe' | 'mine' | null. */
  const reveal = useCallback((keyId) => {
    if (gameStatus !== 'playing') return null;
    const slot = grid[keyId];
    if (!slot || slot.isRevealed) return null;

    if (slot.isMine) {
      setGrid((g) => g.map((s) => (s.isMine ? { ...s, isRevealed: true } : s)));
      setGameStatus('gameover');
      setMessage({ text: '💀 MINE — game over', type: 'lose' });
      return 'mine';
    }

    const newCount = safeRevealed + 1;
    setGrid((g) => g.map((s) => (s.keyId === keyId ? { ...s, isRevealed: true } : s)));
    setSafeRevealed(newCount);

    if (newCount >= CONFIG.totalKeys - minesCount) {
      cashOut(true, newCount);
    }
    return 'safe';
  }, [gameStatus, grid, safeRevealed, minesCount, cashOut]);

  const randomGameId = useCallback(() => {
    if (gameStatus !== 'playing') return null;
    const hidden = grid.filter((s) => !s.isRevealed);
    if (!hidden.length) return null;
    return hidden[Math.floor(Math.random() * hidden.length)].keyId;
  }, [gameStatus, grid]);

  /* --- provably fair helpers --- */
  const setClientSeed = useCallback((v) => {
    if (gameStatus === 'playing') return;
    setClientSeedState(v.slice(0, 64));
  }, [gameStatus]);

  const regenClientSeed = useCallback(() => {
    if (gameStatus === 'playing') return;
    setClientSeedState(genSeed().slice(0, 20));
  }, [gameStatus]);

  /** Recompute mines from the revealed seeds and compare with this round's board. */
  const verifyRound = useCallback(async () => {
    if (!serverSeed || !grid.length) return null;
    const ids = await placeMines(CONFIG.totalKeys, minesCount, serverSeed, clientSeed, roundId);
    const boardMines = new Set(grid.filter((s) => s.isMine).map((s) => s.keyId));
    return ids.size === boardMines.size && [...ids].every((i) => boardMines.has(i));
  }, [serverSeed, clientSeed, roundId, minesCount, grid]);

  const newRound = useCallback(() => {
    setGrid([]);
    setSafeRevealed(0);
    setGameStatus('idle');
    setMessage({ text: 'Press START to arm switches', type: 'info' });
  }, []);

  const track = useMemo(() => {
    return Array.from({ length: CONFIG.trackSteps }, (_, i) => ({
      reveals: i,
      mult: calcMult(i, minesCount),
    }));
  }, [minesCount]);

  const ended = gameStatus === 'gameover' || gameStatus === 'cashedout';

  return {
    grid, minesCount, bet, mode, balance, gameStatus, safeRevealed,
    multiplier, message, track,
    setBet, setMines, setMode, startGame, reveal, randomGameId, cashOut, newRound,
    /* provably fair */
    roundId, serverSeedHash, entropyHash: ended ? entropyHash : null,
    revealedServerSeed: ended ? serverSeed : null,
    clientSeed, setClientSeed, regenClientSeed, verifyRound,
  };
}
