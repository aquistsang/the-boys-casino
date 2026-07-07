/**
 * The Boys Casino — Mines Game
 * =============================
 * Core game logic, state management, and UI controller.
 *
 * Customize game parameters in GAME_CONFIG below.
 * Customize visual theme in css/styles.css (:root variables).
 */

// ============================================================
// GAME CONFIG — Change these to adjust game parameters
// ============================================================
const GAME_CONFIG = {
  gridSize: 5,              // 5 = 5×5 grid. Change to 6 for 6×6.
  defaultMines: 3,
  minMines: 1,
  maxMines: null,           // null = auto (totalTiles - 1)
  defaultBet: 10,
  minBet: 0.01,
  maxBet: 10000,
  houseEdge: 0.01,          // 1% house edge applied per reveal
  demoBalance: 2985.0,
  realBalance: 0.0,
  betStep: 1,
  multiplierTrackSteps: 12, // How many future multipliers to show on track
};

// Keycap legends for 5×5 grid (TKL-style layout labels)
const KEYCAP_LABELS = [
  'Q', 'W', 'E', 'R', 'T',
  'A', 'S', 'D', 'F', 'G',
  'Z', 'X', 'C', 'V', 'B',
  '1', '2', '3', '4', '5',
  '!', '@', '#', '$', '%',
];

// ============================================================
// MECHANICAL CLICK SOUND (Web Audio API)
// ============================================================

let audioCtx = null;

function playKeyClick() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
    osc.type = 'square';
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.06);
  } catch (_) { /* audio unavailable */ }
}

function buildKeycapHTML(id, sublabel = '') {
  const legend = KEYCAP_LABELS[id % KEYCAP_LABELS.length];
  return `
    <span class="tile__legend">${legend}</span>
    ${sublabel ? `<span class="tile__sublegend">${sublabel}</span>` : ''}
  `;
}

function animateKeyPress(el) {
  if (!el) return;
  el.classList.add('tile--pressing', 'keycap--pressed');
  setTimeout(() => el.classList.remove('tile--pressing', 'keycap--pressed'), 150);
}

// ============================================================
// MULTIPLIER CURVE
// ============================================================

/**
 * Calculate multiplier after revealing `safeRevealed` safe tiles.
 * Uses the standard mines probability formula with house edge.
 *
 * multiplier = ∏(remainingTiles / remainingSafeTiles) × houseEdge^reveals
 */
function calculateMultiplier(safeRevealed, totalTiles, minesCount) {
  if (safeRevealed === 0) return 1.0;

  let mult = 1.0;
  for (let i = 0; i < safeRevealed; i++) {
    const remaining = totalTiles - i;
    const remainingSafe = (totalTiles - minesCount) - i;
    mult *= remaining / remainingSafe;
  }

  // Apply house edge compounding
  mult *= Math.pow(1 - GAME_CONFIG.houseEdge, safeRevealed);
  return mult;
}

/**
 * Build an array of multipliers for the track display.
 * Index 0 = 1.00× (start), index n = multiplier after n safe reveals.
 */
function buildMultiplierTrack(totalTiles, minesCount, steps) {
  const track = [{ reveals: 0, multiplier: 1.0 }];
  const maxReveals = Math.min(steps, totalTiles - minesCount);
  for (let i = 1; i <= maxReveals; i++) {
    track.push({
      reveals: i,
      multiplier: calculateMultiplier(i, totalTiles, minesCount),
    });
  }
  return track;
}

// ============================================================
// PROVABLY FAIR (simulated placeholder)
// ============================================================

/**
 * Generate a random hex string (simulates a seed/hash).
 * Replace with real SHA-256 HMAC in production.
 */
function generateSeed(length = 32) {
  const chars = '0123456789abcdef';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (const byte of array) {
    result += chars[byte % 16];
  }
  return result;
}

/**
 * Simulated hash — in production, use crypto.subtle.digest('SHA-256', ...)
 * Falls back to a simple hash when crypto.subtle is unavailable (e.g. file://).
 */
async function simulateHash(input) {
  if (window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback for local file:// usage without a web server
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  const base = (hash >>> 0).toString(16);
  return (base + base.split('').reverse().join('') + base).padEnd(64, '0').slice(0, 64);
}

/**
 * Deterministically place mines using seed + nonce.
 * Returns array of mine tile indices (0-based).
 */
async function generateMinePositions(totalTiles, minesCount, serverSeed, clientSeed, nonce) {
  const combined = `${serverSeed}:${clientSeed}:${nonce}`;
  const hash = await simulateHash(combined);

  // Fisher-Yates shuffle driven by hash bytes
  const indices = Array.from({ length: totalTiles }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const hashSlice = hash.slice((i * 2) % (hash.length - 4), (i * 2) % (hash.length - 4) + 4);
    const rand = parseInt(hashSlice, 16) || 0;
    const j = rand % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices.slice(0, minesCount).sort((a, b) => a - b);
}

// ============================================================
// GAME STATE
// ============================================================

function createInitialState() {
  const totalTiles = GAME_CONFIG.gridSize ** 2;
  const maxMines = GAME_CONFIG.maxMines ?? totalTiles - 1;

  return {
    // Grid
    gridSize: GAME_CONFIG.gridSize,
    totalTiles,
    maxMines,

    // Tiles: flat array of { id, isMine, isRevealed }
    tiles: [],

    // Settings
    minesCount: GAME_CONFIG.defaultMines,
    betAmount: GAME_CONFIG.defaultBet,

    // Balances
    mode: 'demo', // 'demo' | 'real'
    demoBalance: GAME_CONFIG.demoBalance,
    realBalance: GAME_CONFIG.realBalance,

    // Round state
    gameStatus: 'idle', // 'idle' | 'playing' | 'gameover' | 'cashedout' | 'won'
    safeRevealed: 0,
    currentMultiplier: 1.0,

    // Provably fair
    serverSeed: '',
    serverSeedHash: '',
  };
}

// ============================================================
// GAME CONTROLLER
// ============================================================

class MinesGame {
  constructor() {
    this.state = createInitialState();
    this.nonce = 0;
    this.clientSeed = generateSeed(16);
    this.multiplierTrack = [];

    this.cacheElements();
    this.bindEvents();
    this.init();
  }

  // ---- DOM References ----
  cacheElements() {
    this.el = {
      balanceDisplay: document.getElementById('balanceDisplay'),
      betAmount: document.getElementById('betAmount'),
      betDecrease: document.getElementById('betDecrease'),
      betIncrease: document.getElementById('betIncrease'),
      minesCount: document.getElementById('minesCount'),
      minesDecrease: document.getElementById('minesDecrease'),
      minesIncrease: document.getElementById('minesIncrease'),
      minesInfo: document.getElementById('minesInfo'),
      multiplierDisplay: document.getElementById('multiplierDisplay'),
      profitDisplay: document.getElementById('profitDisplay'),
      gameGrid: document.getElementById('gameGrid'),
      gameMessage: document.getElementById('gameMessage'),
      multiplierTrack: document.getElementById('multiplierTrack'),
      startBtn: document.getElementById('startBtn'),
      randomTileBtn: document.getElementById('randomTileBtn'),
      cashOutBtn: document.getElementById('cashOutBtn'),
      newRoundBtn: document.getElementById('newRoundBtn'),
      serverSeedHash: document.getElementById('serverSeedHash'),
      clientSeed: document.getElementById('clientSeed'),
      nonceDisplay: document.getElementById('nonceDisplay'),
      pfToggle: document.getElementById('pfToggle'),
      pfDetails: document.getElementById('pfDetails'),
      rotateSeedBtn: document.getElementById('rotateSeedBtn'),
      modeBtns: document.querySelectorAll('.mode-btn'),
    };
  }

  // ---- Initialization ----
  async init() {
    // Set CSS grid size variable
    document.documentElement.style.setProperty('--grid-size', this.state.gridSize);

    // Render grid immediately so the board is never blank
    this.renderGrid();
    this.updateMultiplierTrack();
    this.updateUI();

    try {
      await this.rotateServerSeed();
      this.el.clientSeed.value = this.clientSeed;
    } catch (err) {
      console.warn('Provably fair seed init failed:', err);
      this.el.serverSeedHash.textContent = 'unavailable offline';
    }
  }

  async rotateServerSeed() {
    this.state.serverSeed = generateSeed(32);
    this.state.serverSeedHash = await simulateHash(this.state.serverSeed);
    this.el.serverSeedHash.textContent = this.state.serverSeedHash.slice(0, 32) + '…';
  }

  // ---- Event Binding ----
  bindEvents() {
    // Mode toggle
    this.el.modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });

    // Bet controls
    this.el.betDecrease.addEventListener('click', () => this.adjustBet(-GAME_CONFIG.betStep));
    this.el.betIncrease.addEventListener('click', () => this.adjustBet(GAME_CONFIG.betStep));
    this.el.betAmount.addEventListener('change', () => this.setBet(parseFloat(this.el.betAmount.value)));

    document.querySelectorAll('.bet-quick__btn').forEach((btn) => {
      btn.addEventListener('click', () => this.quickBet(btn.dataset.bet));
    });

    // Mines controls
    this.el.minesDecrease.addEventListener('click', () => this.adjustMines(-1));
    this.el.minesIncrease.addEventListener('click', () => this.adjustMines(1));
    this.el.minesCount.addEventListener('change', () => {
      this.state.minesCount = parseInt(this.el.minesCount.value, 10);
      this.clampMines();
      this.updateMultiplierTrack();
      this.updateUI();
    });

    // Game actions
    this.el.startBtn.addEventListener('click', () => { playKeyClick(); this.startGame(); });
    this.el.randomTileBtn.addEventListener('click', () => { playKeyClick(); this.pickRandomTile(); });
    this.el.cashOutBtn.addEventListener('click', () => { playKeyClick(); this.cashOut(); });
    this.el.newRoundBtn.addEventListener('click', () => { playKeyClick(); this.newRound(); });

    // Mechanical press feedback on all keycap buttons
    document.querySelectorAll('.keycap').forEach((btn) => {
      btn.addEventListener('mousedown', () => btn.classList.add('keycap--pressed'));
      btn.addEventListener('mouseup', () => btn.classList.remove('keycap--pressed'));
      btn.addEventListener('mouseleave', () => btn.classList.remove('keycap--pressed'));
    });

    // Provably fair
    this.el.pfToggle.addEventListener('click', () => this.toggleProvablyFair());
    this.el.rotateSeedBtn.addEventListener('click', () => this.handleRotateSeed());
    this.el.clientSeed.addEventListener('change', () => {
      this.clientSeed = this.el.clientSeed.value || generateSeed(16);
    });
  }

  // ---- Mode ----
  setMode(mode) {
    if (this.state.gameStatus === 'playing') return;
    this.state.mode = mode;

    this.el.modeBtns.forEach((btn) => {
      btn.classList.toggle('mode-btn--active', btn.dataset.mode === mode);
    });

    this.updateUI();
  }

  getBalance() {
    return this.state.mode === 'demo' ? this.state.demoBalance : this.state.realBalance;
  }

  setBalance(value) {
    if (this.state.mode === 'demo') {
      this.state.demoBalance = value;
    } else {
      this.state.realBalance = value;
    }
  }

  // ---- Bet & Mines ----
  adjustBet(delta) {
    if (this.state.gameStatus === 'playing') return;
    this.setBet(this.state.betAmount + delta);
  }

  setBet(value) {
    if (this.state.gameStatus === 'playing') return;
    this.state.betAmount = Math.max(
      GAME_CONFIG.minBet,
      Math.min(GAME_CONFIG.maxBet, Math.round(value * 10000) / 10000)
    );
    this.el.betAmount.value = this.state.betAmount;
    this.updateProfit();
  }

  quickBet(action) {
    if (this.state.gameStatus === 'playing') return;
    const balance = this.getBalance();
    switch (action) {
      case 'half':
        this.setBet(this.state.betAmount / 2);
        break;
      case 'double':
        this.setBet(Math.min(this.state.betAmount * 2, balance));
        break;
      case 'max':
        this.setBet(Math.min(balance, GAME_CONFIG.maxBet));
        break;
    }
  }

  adjustMines(delta) {
    if (this.state.gameStatus === 'playing') return;
    this.state.minesCount += delta;
    this.clampMines();
    this.updateMultiplierTrack();
    this.updateUI();
  }

  clampMines() {
    this.state.minesCount = Math.max(
      GAME_CONFIG.minMines,
      Math.min(this.state.maxMines, this.state.minesCount)
    );
    this.el.minesCount.value = this.state.minesCount;
    this.el.minesCount.max = this.state.maxMines;
  }

  // ---- Game Flow ----
  async startGame() {
    if (this.state.gameStatus === 'playing') return;

    const balance = this.getBalance();
    if (this.state.betAmount > balance) {
      this.showMessage('Insufficient balance!', 'lose');
      return;
    }
    if (this.state.betAmount < GAME_CONFIG.minBet) {
      this.showMessage(`Minimum bet is ${GAME_CONFIG.minBet}`, 'lose');
      return;
    }

    // Deduct bet
    this.setBalance(balance - this.state.betAmount);

    // Reset round state
    this.state.gameStatus = 'playing';
    this.state.safeRevealed = 0;
    this.state.currentMultiplier = 1.0;
    this.nonce++;

  // Place mines provably fair
    this.clientSeed = this.el.clientSeed.value || this.clientSeed;
    const minePositions = await generateMinePositions(
      this.state.totalTiles,
      this.state.minesCount,
      this.state.serverSeed,
      this.clientSeed,
      this.nonce
    );

    this.state.tiles = Array.from({ length: this.state.totalTiles }, (_, id) => ({
      id,
      isMine: minePositions.includes(id),
      isRevealed: false,
    }));

    this.updateMultiplierTrack();
    this.renderGrid();
    this.updateUI();
    this.showMessage('Pick a tile or cash out!', 'info');
  }

  revealTile(tileId) {
    if (this.state.gameStatus !== 'playing') return;

    const tile = this.state.tiles[tileId];
    if (tile.isRevealed) return;

    playKeyClick();
    tile.isRevealed = true;

    if (tile.isMine) {
      this.handleMineHit(tileId);
    } else {
      this.handleSafeReveal(tileId);
    }

    this.renderGrid();
    this.updateUI();
  }

  handleSafeReveal(tileId) {
    this.state.safeRevealed++;
    this.state.currentMultiplier = calculateMultiplier(
      this.state.safeRevealed,
      this.state.totalTiles,
      this.state.minesCount
    );

    const maxSafe = this.state.totalTiles - this.state.minesCount;
    if (this.state.safeRevealed >= maxSafe) {
      // All safe tiles found — auto cash out
      this.cashOut(true);
    }
  }

  handleMineHit(tileId) {
    this.state.gameStatus = 'gameover';

    // Reveal all mines
    this.state.tiles.forEach((t) => {
      if (t.isMine) t.isRevealed = true;
    });

    this.showMessage(`💥 BOOM! You hit a mine. Lost ${this.formatCurrency(this.state.betAmount)}`, 'lose');
  }

  pickRandomTile() {
    if (this.state.gameStatus !== 'playing') return;

    const unrevealed = this.state.tiles.filter((t) => !t.isRevealed);
    if (unrevealed.length === 0) return;

    const random = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    this.revealTile(random.id);
  }

  cashOut(auto = false) {
    if (this.state.gameStatus !== 'playing') return;
    if (this.state.safeRevealed === 0 && !auto) {
      this.showMessage('Reveal at least one safe tile before cashing out!', 'info');
      return;
    }

    const winAmount = this.state.betAmount * this.state.currentMultiplier;
    this.setBalance(this.getBalance() + winAmount);
    this.state.gameStatus = 'cashedout';

    const profit = winAmount - this.state.betAmount;
    this.showMessage(
      auto
        ? `🎉 All safe tiles found! Won ${this.formatCurrency(winAmount)} (+${this.formatCurrency(profit)})`
        : `✅ Cashed out at ${this.formatMultiplier(this.state.currentMultiplier)}! Won ${this.formatCurrency(winAmount)} (+${this.formatCurrency(profit)})`,
      'win'
    );

    // Flash animation on grid
    this.el.gameGrid.classList.add('cash-out-flash');
    setTimeout(() => this.el.gameGrid.classList.remove('cash-out-flash'), 600);
  }

  newRound() {
    this.state.gameStatus = 'idle';
    this.state.safeRevealed = 0;
    this.state.currentMultiplier = 1.0;
    this.state.tiles = [];

    this.renderGrid();
    this.updateUI();
    this.showMessage('');
  }

  // ---- Provably Fair UI ----
  toggleProvablyFair() {
    const isHidden = this.el.pfDetails.hidden;
    this.el.pfDetails.hidden = !isHidden;
    this.el.pfToggle.setAttribute('aria-expanded', String(isHidden));
  }

  async handleRotateSeed() {
    if (this.state.gameStatus === 'playing') return;
    await this.rotateServerSeed();
    this.nonce = 0;
    this.updateUI();
  }

  // ---- Rendering ----
  renderGrid() {
    this.el.gameGrid.innerHTML = '';

    const renderKeycap = (el, id, extraClass = '', innerHTML = '') => {
      el.className = `tile ${extraClass}`.trim();
      el.setAttribute('role', 'gridcell');
      el.dataset.id = id;
      if (innerHTML) {
        el.innerHTML = innerHTML;
      } else {
        el.innerHTML = buildKeycapHTML(id);
      }
      return el;
    };

    this.state.tiles.forEach((tile) => {
      const el = document.createElement('button');

      if (tile.isRevealed) {
        if (tile.isMine) {
          renderKeycap(el, tile.id, 'tile--revealed tile--mine',
            '<span class="tile__icon">💥</span>');
        } else {
          renderKeycap(el, tile.id, 'tile--revealed tile--safe',
            '<span class="tile__icon">💎</span>');
        }
      } else if (
        this.state.gameStatus === 'gameover' ||
        this.state.gameStatus === 'cashedout'
      ) {
        if (tile.isMine) {
          renderKeycap(el, tile.id, 'tile--mine-unrevealed tile--disabled',
            buildKeycapHTML(tile.id, 'MINE'));
        } else {
          renderKeycap(el, tile.id, 'tile--disabled');
        }
      } else if (this.state.gameStatus !== 'playing') {
        renderKeycap(el, tile.id, 'tile--disabled');
      } else {
        renderKeycap(el, tile.id);
        el.addEventListener('click', () => {
          animateKeyPress(el);
          this.revealTile(tile.id);
        });
      }

      this.el.gameGrid.appendChild(el);
    });

    // Placeholder grid when idle
    if (this.state.tiles.length === 0) {
      for (let i = 0; i < this.state.totalTiles; i++) {
        const el = document.createElement('button');
        renderKeycap(el, i, 'tile--disabled');
        this.el.gameGrid.appendChild(el);
      }
    }
  }

  updateMultiplierTrack() {
    this.multiplierTrack = buildMultiplierTrack(
      this.state.totalTiles,
      this.state.minesCount,
      GAME_CONFIG.multiplierTrackSteps
    );

    this.el.multiplierTrack.innerHTML = '';

    this.multiplierTrack.forEach((node, index) => {
      const el = document.createElement('div');
      el.className = 'track-node';

      const isPassed = this.state.safeRevealed > node.reveals;
      const isCurrent =
        this.state.gameStatus === 'playing' &&
        this.state.safeRevealed === node.reveals;

      if (isPassed) el.classList.add('track-node--passed');
      if (isCurrent) el.classList.add('track-node--current');

      el.innerHTML = `
        <div class="track-node__dot"></div>
        <span class="track-node__label">${this.formatMultiplier(node.multiplier)}</span>
      `;

      this.el.multiplierTrack.appendChild(el);
    });
  }

  updateProfit() {
    const profit =
      this.state.gameStatus === 'playing' || this.state.gameStatus === 'cashedout'
        ? this.state.betAmount * this.state.currentMultiplier - this.state.betAmount
        : 0;

    this.el.profitDisplay.textContent =
      profit >= 0 ? `+${this.formatCurrency(profit)}` : this.formatCurrency(profit);
  }

  updateUI() {
    const { gameStatus } = this.state;
    const isPlaying = gameStatus === 'playing';
    const isEnded = gameStatus === 'gameover' || gameStatus === 'cashedout' || gameStatus === 'won';

    // Balance
    this.el.balanceDisplay.textContent = this.formatCurrency(this.getBalance());

    // Multiplier
    this.el.multiplierDisplay.textContent = this.formatMultiplier(this.state.currentMultiplier);

    // Mines info
    const safeTiles = this.state.totalTiles - this.state.minesCount;
    const remaining = safeTiles - this.state.safeRevealed;
    this.el.minesInfo.textContent = isPlaying
      ? `${this.state.minesCount} mines · ${remaining} / ${safeTiles} keys left`
      : `${this.state.minesCount} mines · ${safeTiles} safe keys`;

    // Buttons
    this.el.startBtn.disabled = isPlaying;
    this.el.startBtn.textContent = isEnded ? 'PLAY AGAIN' : 'START GAME';
    this.el.randomTileBtn.disabled = !isPlaying;
    this.el.cashOutBtn.disabled = !isPlaying || this.state.safeRevealed === 0;
    this.el.newRoundBtn.hidden = !isEnded;
    this.el.newRoundBtn.disabled = !isEnded;

    // Disable inputs during play
    const inputsDisabled = isPlaying;
    this.el.betAmount.disabled = inputsDisabled;
    this.el.betDecrease.disabled = inputsDisabled;
    this.el.betIncrease.disabled = inputsDisabled;
    this.el.minesCount.disabled = inputsDisabled;
    this.el.minesDecrease.disabled = inputsDisabled;
    this.el.minesIncrease.disabled = inputsDisabled;
    document.querySelectorAll('.bet-quick__btn').forEach((btn) => {
      btn.disabled = inputsDisabled;
    });

    // Nonce
    this.el.nonceDisplay.textContent = this.nonce;

    this.updateProfit();
    this.updateMultiplierTrack();
  }

  showMessage(text, type = '') {
    this.el.gameMessage.textContent = text;
    this.el.gameMessage.className = 'game-message' + (type ? ` game-message--${type}` : '');
  }

  // ---- Formatting ----
  formatCurrency(value) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  formatMultiplier(value) {
    return value.toFixed(2) + '×';
  }
}

// ============================================================
// BOOT — script is at end of <body>, DOM is already ready
// ============================================================
window.minesGame = new MinesGame();
