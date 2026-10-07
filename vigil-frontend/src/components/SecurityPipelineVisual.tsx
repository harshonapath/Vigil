export default function SecurityPipelineVisual() {
  const nodes = [
    [170, 170, 3.1, 0.2],
    [170, 250, 3.3, 1.1],
    [210, 132, 2.8, 1.8],
    [210, 210, 3.8, 0.6],
    [210, 288, 2.9, 1.5],
    [252, 165, 3.3, 1.2],
    [252, 255, 3.6, 0],
    [294, 132, 2.8, 1.9],
    [294, 210, 3.8, 0.8],
    [294, 288, 2.9, 1.4],
    [334, 170, 3.1, 0.4],
    [334, 250, 3.3, 1.6],
  ];

  return (
    <div className="security-pipeline" aria-label="Pull request flowing through Vigil AI analysis into security findings and human review">
      <div className="pipeline-depth-grid" />

      <svg className="pipeline-visual" viewBox="0 0 500 430" role="img" aria-hidden="true">
        <ellipse className="pipeline-ambient" cx="256" cy="216" rx="195" ry="162" />

        {/* Input plane: abstract code/data entering the system */}
        <g className="pipeline-plane pipeline-plane--input">
          <path d="M35 145 123 120 123 298 35 278Z" fill="var(--pipeline-panel)" />
          <path d="M35 145 123 120 123 298 35 278Z" className="pipeline-plane-edge" />
          <path d="m53 174 47-11M53 196l35-8M53 221l50-10M53 244l29-5" className="pipeline-data-strokes" />
          <circle cx="106" cy="161" r="2.4" className="pipeline-input-node" />
          <circle cx="91" cy="234" r="2" className="pipeline-input-node" />
        </g>

        {/* Layered analysis volume */}
        <g className="pipeline-analysis-volume">
          <path d="m150 112 112-30 0 246-112 25Z" fill="var(--pipeline-panel)" className="pipeline-plane-edge pipeline-layer-back" />
          <path d="m188 96 113 20 0 233-113-17Z" fill="var(--pipeline-panel)" className="pipeline-plane-edge pipeline-layer-middle" />
          <path d="m226 82 112 39 0 226-112-34Z" fill="var(--pipeline-panel)" className="pipeline-plane-edge pipeline-layer-front" />
        </g>

        {/* Neural paths */}
        <g className="pipeline-network-lines">
          <path d="M112 174C138 174 148 170 170 170L210 132 252 165 294 132 334 170C352 174 363 178 378 180" />
          <path d="M112 212C140 212 154 210 170 210H210C226 210 238 211 252 211S278 210 294 210H334C350 212 364 218 378 222" />
          <path d="M112 248C138 248 150 250 170 250L210 288 252 255 294 288 334 250C352 246 364 240 378 238" />
          <path d="M170 170V250M210 132V288M294 132V288M334 170V250M210 210L252 165M210 210L252 255M294 210L252 165M294 210L252 255" />
        </g>

        {nodes.map(([cx, cy, r, delay], index) => (
          <circle
            key={index}
            className="pipeline-node"
            cx={cx}
            cy={cy}
            r={r}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}

        {/* Neural intelligence core */}
        <circle className="pipeline-core-ring pipeline-core-ring--outer" cx="252" cy="211" r="25" />
        <circle className="pipeline-core-ring pipeline-core-ring--inner" cx="252" cy="211" r="16" />
        <circle className="pipeline-core-orb" cx="252" cy="211" r="7.5" fill="var(--primary)" />

        {/* Abstract processed output */}
        <g className="pipeline-plane pipeline-plane--output">
          <path d="m378 139 86 22v133l-86 18Z" fill="var(--pipeline-panel)" />
          <path d="m378 139 86 22v133l-86 18Z" className="pipeline-plane-edge" />
          <path d="M397 181h41M397 210h29M397 239h36M397 268h22" className="pipeline-result-strokes" />
          <circle cx="447" cy="180" r="3" className="pipeline-result-node" />
          <circle cx="435" cy="209" r="3" className="pipeline-result-node" />
          <circle cx="442" cy="238" r="3" className="pipeline-result-node" />
          <circle cx="428" cy="267" r="3" className="pipeline-result-node" />
        </g>

        {/* Data motion */}
        <path className="pipeline-flow-guide" d="M72 212C135 210 156 206 211 207S302 206 420 210" />
        <circle className="pipeline-data-particle" r="2.5">
          <animateMotion dur="8s" repeatCount="indefinite" path="M72 212C135 210 156 206 211 207S302 206 420 210" />
        </circle>
        <circle className="pipeline-data-particle pipeline-data-particle--secondary" r="1.8">
          <animateMotion dur="10s" begin="-4s" repeatCount="indefinite" path="M82 246C142 260 159 276 218 286S328 245 426 267" />
        </circle>
      </svg>

      <div className="pipeline-stage pipeline-stage--input"><span>01</span><strong>Input</strong><small>Code change</small></div>
      <div className="pipeline-stage pipeline-stage--analysis"><span>02</span><strong>AI Analysis</strong><small>Injection defense + risk</small></div>
      <div className="pipeline-stage pipeline-stage--intelligence"><span>03</span><strong>Security Insight</strong><small>Prioritized signal</small></div>
      <div className="pipeline-stage pipeline-stage--action"><span>04</span><strong>Action</strong><small>Fix with confidence</small></div>
      <div className="pipeline-stage pipeline-stage--input"><span>01</span><strong>Pull Request</strong><small>Code changes + PR context</small></div>
      <div className="pipeline-stage pipeline-stage--analysis"><span>02</span><strong>AI Analysis</strong><small>Code, context &amp; security risk</small></div>
      <div className="pipeline-stage pipeline-stage--intelligence"><span>03</span><strong>Security Findings</strong><small>Prioritized risks &amp; insights</small></div>
      <div className="pipeline-stage pipeline-stage--action"><span>04</span><strong>Human Review</strong><small>Review findings &amp; decide</small></div>
    </div>
  );
}
