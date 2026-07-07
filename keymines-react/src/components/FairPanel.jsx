import { useState } from 'react';
import { CONFIG } from '../config.js';

const RTP = ((1 - CONFIG.houseEdge) * 100);

/**
 * "98% RTP · Provably Fair" badge + commit-reveal detail popover.
 * Server seed hash is shown while the round runs; the seed itself and the
 * entropy hash unlock after settlement so the round can be verified.
 */
export default function FairPanel({ game }) {
  const [open, setOpen] = useState(false);
  const [verify, setVerify] = useState(null); // null | 'pending' | 'ok' | 'fail'
  const ended = game.gameStatus === 'gameover' || game.gameStatus === 'cashedout';
  const playing = game.gameStatus === 'playing';

  const runVerify = async () => {
    setVerify('pending');
    const ok = await game.verifyRound();
    setVerify(ok === null ? null : ok ? 'ok' : 'fail');
  };

  const verifyLabel =
    verify === 'pending' ? 'Verifying…'
    : verify === 'ok' ? '✓ Verified — mines match the seeds'
    : verify === 'fail' ? '✗ Mismatch — round invalid'
    : 'Verify Round';

  return (
    <div className="pf-wrap">
      {open && (
        <div className="pf-panel">
          <h3 className="pf-title">Provably Fair</h3>
          <div className="pf-row"><span>RTP</span><b>{RTP.toFixed(2)}%</b></div>
          <div className="pf-row"><span>House Edge</span><b>{(CONFIG.houseEdge * 100).toFixed(2)}%</b></div>
          <div className="pf-row"><span>Calculation</span><b>KEYMINES-PF-v1</b></div>

          <h4 className="pf-sub">This Round</h4>
          <div className="pf-row"><span>Round ID</span><b>#{game.roundId}</b></div>
          <div className="pf-row pf-row--hash">
            <span>Server Seed Hash</span>
            <b>{game.serverSeedHash ?? '— starts with next round —'}</b>
          </div>
          <div className="pf-row">
            <span>Public Randomness</span>
            <span className="pf-seedbox">
              <input
                value={game.clientSeed}
                disabled={playing}
                onChange={(e) => game.setClientSeed(e.target.value)}
                spellCheck={false}
              />
              <button disabled={playing} onClick={game.regenClientSeed} title="New random seed">⟳</button>
            </span>
          </div>
          {ended && (
            <div className="pf-row">
              <span>Round Result</span>
              <b>{game.gameStatus === 'gameover' ? 'BUST 💥' : `${game.multiplier.toFixed(2)}×`}</b>
            </div>
          )}

          <h4 className="pf-sub">After Round Settlement</h4>
          {ended ? (
            <>
              <div className="pf-row pf-row--hash"><span>Server Seed</span><b>{game.revealedServerSeed}</b></div>
              <div className="pf-row pf-row--hash"><span>Entropy Hash</span><b>{game.entropyHash}</b></div>
            </>
          ) : (
            <p className="pf-note">The server seed is revealed here once the round settles.</p>
          )}

          <p className="pf-note">
            KeyMines commits to a hidden server seed before the round starts. After
            settlement the seed is revealed so you can verify the mine layout was fixed
            before your first key press. Your stake and cash-out choice never affect
            the result.
          </p>

          <button className="pf-verify" disabled={!ended || verify === 'pending'} onClick={runVerify}>
            {verifyLabel}
          </button>

          <p className="pf-note">
            Demo mode: the seed is generated and held in your browser.
          </p>
        </div>
      )}

      <button className="pf-badge" onClick={() => { setOpen((o) => !o); setVerify(null); }}>
        <span className="pf-dot" /> {RTP.toFixed(0)}% RTP · Provably Fair
      </button>
    </div>
  );
}
