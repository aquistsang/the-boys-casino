export default function Actions({ gameStatus, safeRevealed, onStart, onRandom, onCashOut, onNewRound }) {
  const playing = gameStatus === 'playing';
  const ended = gameStatus === 'gameover' || gameStatus === 'cashedout';

  return (
    <div className="actions">
      <button className="act act--start" disabled={playing} onClick={onStart}>
        START GAME
      </button>
      <button className="act act--random" disabled={!playing} onClick={onRandom}>
        RANDOM KEY
      </button>
      <button className="act act--cash" disabled={!playing || !safeRevealed} onClick={onCashOut}>
        CASH OUT
      </button>
      {ended && (
        <button className="act act--new" onClick={onNewRound}>
          NEW ROUND
        </button>
      )}
    </div>
  );
}
