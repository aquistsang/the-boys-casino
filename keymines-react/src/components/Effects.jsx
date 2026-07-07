/** Screen-level overlays: multiplier pops, outcome banners, confetti. */
const CONFETTI_COLORS = ['#00e676', '#d4af37', '#00bcd4', '#e8e0d5'];

/** Big multiplier pop in the middle of the screen after each safe reveal. */
export function CenterPops({ pops }) {
  return pops.map((p) => (
    <span key={p.id} className="center-pop">{p.text}</span>
  ));
}

/** Full-width outcome banner (BOOM / CASHED OUT). */
export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div key={banner.id} className={`banner banner--${banner.kind}`}>
      {banner.text}
    </div>
  );
}

export function Confetti({ pieces }) {
  return pieces.map((p) => (
    <div
      key={p.id}
      className="confetti"
      style={{ left: p.x, top: p.y, background: CONFETTI_COLORS[p.id % CONFETTI_COLORS.length] }}
    />
  ));
}
