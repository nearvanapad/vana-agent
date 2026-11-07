import { clsx } from "clsx";

/*
 * Vana's drawing, without hooks or state, so the server can draw it too (the link-preview card).
 * `Mascot` animates it with CSS on the class names; a `still` drawing leaves out the faces only a
 * mood shows (happy eyes, open and flat mouths).
 */

const INK = "#0b1417";
const NOTE_PATH = "M4.5 18.5H31V33H45.5V59.5H4.5ZM13.5 27.5H31V33H36.5V50.5H13.5ZM36 4H60V28H36Z";
const NOTES: [x: number, y: number, cls: string][] = [
  [15, 21, "v-n1"],
  [11.5, 68, "v-n2"],
  [81.5, 35.5, "v-n3"],
  [84, 75, "v-n4"],
];

function Eye({ cx, still }: { cx: number; still?: boolean }) {
  return (
    <g className="v-eye">
      <g transform={`translate(${cx} 50)`}>
        <g>
          <g transform={`translate(${-cx} -50)`}>
            <g className="v-eye-open">
              <ellipse cx={cx} cy="50" rx="3.4" ry="3.2" fill="#f3fff6" stroke={INK} strokeWidth=".6" />
              <g className="v-pupil">
                <circle cx={cx} cy="50.2" r="2.2" fill="#2c6245" />
                <circle cx={cx} cy="50.2" r="1" fill={INK} />
                <circle cx={cx + 0.8} cy="49.3" r=".6" fill="#fff" />
              </g>
              <path d={`M${cx - 3.8} 47.6Q${cx} 45.2 ${cx + 3.8} 47.6`} fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </g>
      {!still && (
        <path className="v-eye-happy" d={`M${cx - 3.2} 51Q${cx} 47.4 ${cx + 3.2} 51`} fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
      )}
    </g>
  );
}

/** The drawing inside a 96 × 96 viewBox. `glow` and `card` name its gradient and clip path. */
export function VanaArt({ glow, card, still }: { glow: string; card: string; still?: boolean }) {
  return (
    <>
      <defs>
        <radialGradient id={glow} cx="48" cy="40" r="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#173431" />
          <stop offset="1" stopColor="#0b1816" />
        </radialGradient>
        <clipPath id={card}>
          <rect x="1.5" y="1.5" width="93" height="93" rx="9" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${card})`}>
        <rect width="96" height="96" fill={`url(#${glow})`} />
        <path className="v-vine" d="M70 23C80 29 83 41 79.5 53S77.5 80 75 97" fill="none" stroke="#a8d9bb" strokeWidth=".9" strokeLinecap="round" opacity=".7" />
        <g className="v-figure">
          <path d="M17 97V49C17 31 30 21 48 21S79 31 79 49V97Z" fill="#1a3738" stroke={INK} strokeWidth="1" />
          <path d="M21 97C21 85 31 77.5 48 77.5S75 85 75 97Z" fill="#69de8a" stroke={INK} strokeWidth="1" />
          <path d="M40.5 78.2C42 81.5 54 81.5 55.5 78.2C52 77.2 44 77.2 40.5 78.2Z" fill="#111c1c" />
          <rect x="44.5" y="66" width="7" height="12" fill="#e3a48c" stroke={INK} strokeWidth=".8" />
          <g className="v-locks" fill="none" strokeLinecap="round">
            <path d="M27.5 45C24.5 58 24.5 71 26.5 83" stroke={INK} strokeWidth="6" />
            <path d="M27.5 45C24.5 58 24.5 71 26.5 83" stroke="#2c6245" strokeWidth="4.4" />
            <path d="M68.5 45C71.5 58 71.5 71 69.5 83" stroke={INK} strokeWidth="6" />
            <path d="M68.5 45C71.5 58 71.5 71 69.5 83" stroke="#2c6245" strokeWidth="4.4" />
          </g>
          <circle cx="48" cy="50" r="18" fill="#e9a88f" stroke={INK} strokeWidth="1" />
          <path className="v-hair-cap" d="M29.5 47C29 32 37 23.5 48 23.5S67 32 66.5 47C63 39 56.5 34.5 48 34.5S33 39 29.5 47Z" fill="#2a5f42" stroke={INK} strokeWidth="1" />
          <path className="v-hair-shine" d="M32.8 41.4C34.2 38.2 36.6 35.6 39.6 33.6S45.8 31 48.4 30.8" fill="none" stroke="#69de8a" strokeWidth="1.3" strokeLinecap="round" />
          <g fill="#e2807a" opacity=".45">
            <ellipse cx="36.5" cy="57" rx="3.4" ry="2" />
            <ellipse cx="59.5" cy="57" rx="3.4" ry="2" />
          </g>
          <g className="v-brows" fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round">
            <path d="M37.5 43.5L44 42.5" />
            <path d="M52 42.5L58.5 43.5" />
          </g>
          <Eye cx={41} still={still} />
          <Eye cx={55} still={still} />
          <path d="M48.2 54.2L47.6 56.2H48.6" fill="none" stroke="#c98370" strokeWidth=".7" strokeLinecap="round" strokeLinejoin="round" />
          <path className="v-mouth-smile" d="M44.5 61Q48 64.2 51.5 61" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
          {!still && <ellipse className="v-mouth-open" cx="48" cy="62" rx="2.6" ry="1.9" fill="#4a1d16" stroke={INK} strokeWidth=".8" />}
          {!still && <path className="v-mouth-flat" d="M45.5 62H50.5" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />}
        </g>
        <g transform="translate(67 18)">
          <g className="v-lotus">
            <ellipse cx="0" cy="3" rx="6.5" ry="1.6" fill="#9fd8b4" opacity=".55" />
            <g fill="#97ffb9" stroke={INK} strokeWidth=".5">
              <path d="M0 2C-5 1.5-7 -1-6.5-2.5C-4-2.5-1.5-.5 0 2Z" />
              <path d="M0 2C5 1.5 7-1 6.5-2.5C4-2.5 1.5-.5 0 2Z" />
              <path d="M0 2C-3.5 0-4.2-3.5-3.5-5C-1.5-4-.2-1.5 0 2Z" />
              <path d="M0 2C3.5 0 4.2-3.5 3.5-5C1.5-4 .2-1.5 0 2Z" />
            </g>
            <path d="M0-6.5C1.8-4 1.8-.5 0 2C-1.8-.5-1.8-4 0-6.5Z" fill="#eafff0" stroke={INK} strokeWidth=".5" />
            <circle cx="0" cy="1.6" r=".7" fill="#e3a48c" />
          </g>
        </g>
        <g>
          {NOTES.map(([x, y, cls]) => (
            <g key={cls} transform={`translate(${x} ${y})`}>
              <g className={clsx("v-note", cls)}>
                <g className="v-spin">
                  <g transform="translate(-4.6 -4.6) scale(.14375)">
                    <rect className="v-nb" width="64" height="64" rx="14" fill="#69de8a" stroke={INK} strokeWidth="5" />
                    <path transform="translate(9 9) scale(.72)" fillRule="evenodd" fill="#141c1e" d={NOTE_PATH} />
                  </g>
                </g>
              </g>
            </g>
          ))}
        </g>
      </g>
      <rect x="1.5" y="1.5" width="93" height="93" rx="9" fill="none" stroke="#69de8a" strokeWidth="1.6" />
    </>
  );
}
