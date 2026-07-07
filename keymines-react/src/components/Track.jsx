export default function Track({ track, safeRevealed, gameStatus }) {
  return (
    <div className="track">
      <div className="track__lbl">MULTIPLIER · BRASS WEIGHT BAR</div>
      <div className="track__bar">
        {track.map((node) => {
          let cls = 'tick';
          if (safeRevealed > node.reveals) cls += ' tick--passed';
          if (gameStatus === 'playing' && safeRevealed === node.reveals) cls += ' tick--on';
          return (
            <div className={cls} key={node.reveals}>
              <div className="tick__dot" />
              <span className="tick__lbl">{node.mult.toFixed(2)}×</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
