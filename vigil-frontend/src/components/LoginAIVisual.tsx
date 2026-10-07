const nodes = [
  [24, 64, 2.7, 0.2],
  [24, 126, 2.4, 1.4],
  [54, 48, 2.2, 2.1],
  [56, 94, 3.1, 0.8],
  [54, 142, 2.2, 1.8],
  [88, 62, 2.6, 1.1],
  [86, 122, 2.8, 2.4],
  [119, 42, 2.1, 0.4],
  [120, 78, 3.2, 1.6],
  [120, 112, 4.2, 0],
  [120, 148, 2.3, 2],
  [153, 62, 2.6, 0.7],
  [155, 126, 2.8, 1.9],
  [186, 55, 2.3, 1.2],
  [187, 95, 3.1, 0.3],
  [188, 137, 2.5, 2.2],
  [216, 78, 2.7, 1],
  [216, 119, 2.5, 1.7],
];

export default function LoginAIVisual() {
  return (
    <div className="auth-ai-visual" aria-hidden="true">
      <svg className="auth-neural-svg" viewBox="0 0 240 190" fill="none">
        <ellipse className="auth-neural-ambient" cx="120" cy="96" rx="108" ry="76" />

        <g className="auth-neural-connections">
          <path d="M24 64 54 48 88 62 120 42 153 62 186 55 216 78" />
          <path d="M24 64 56 94 88 62 120 78 153 62 187 95 216 78" />
          <path d="M24 126 56 94 86 122 120 112 155 126 187 95 216 119" />
          <path d="M24 126 54 142 86 122 120 148 155 126 188 137 216 119" />
          <path d="m54 48 2 46 32-32-2 60 34-44v70M56 94l30 28M88 62l32 50M120 42v70M120 78l35 48M120 112l33-50M153 62l2 64M186 55l1 40 1 42" />
        </g>

        <g className="auth-neural-illumination">
          <path d="M24 64 56 94 86 122 120 112 153 62 187 95 216 78" />
          <path d="M24 126 54 142 86 122 120 148 155 126 188 137 216 119" />
        </g>

        {/* Stable central analysis structure */}
        <path className="auth-neural-plane auth-neural-plane--back" d="m120 57 38 22-8 56-30 17-32-17-7-56Z" />
        <path className="auth-neural-plane auth-neural-plane--front" d="m120 70 28 17-6 39-22 13-23-13-5-39Z" />
        <circle className="auth-neural-core" cx="120" cy="112" r="9" fill="var(--primary)" />

        {nodes.map(([cx, cy, r, delay], index) => (
          <circle
            key={index}
            className={`auth-neural-node ${cx < 70 ? 'auth-neural-node--input' : cx > 175 ? 'auth-neural-node--output' : ''}`}
            cx={cx}
            cy={cy}
            r={r}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}

        {/* CODE → ANALYSIS → SECURITY FINDING data motion */}
        <circle className="auth-neural-particle" r="2.1">
          <animateMotion dur="7.5s" repeatCount="indefinite" path="M20 64 56 94 86 122 120 112 153 62 187 95 220 78" />
        </circle>
        <circle className="auth-neural-particle auth-neural-particle--secondary" r="1.6">
          <animateMotion dur="9.5s" begin="-4s" repeatCount="indefinite" path="M20 126 54 142 86 122 120 148 155 126 188 137 220 119" />
        </circle>
      </svg>
    </div>
  );
}
