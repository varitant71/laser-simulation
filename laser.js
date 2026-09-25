(function () {
  "use strict";

  const MAX_MN = 200;
  const MAX_STEPS = 10000;
  const PADDING = 48;
  const MAX_CELL = 40;
  const EPS = 1e-9;
  const VERT_EPS = 1e-6;

  const canvas = document.getElementById("gridCanvas");
  const ctx = canvas.getContext("2d");
  const inputM = document.getElementById("inputM");
  const inputN = document.getElementById("inputN");
  const inputAngle = document.getElementById("inputAngle");
  const speedRange = document.getElementById("speedRange");
  const speedLabel = document.getElementById("speedLabel");
  const inputError = document.getElementById("inputError");
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const btnReset = document.getElementById("btnReset");
  const resultStatus = document.getElementById("resultStatus");
  const resultDetail = document.getElementById("resultDetail");
  const resultHint = document.getElementById("resultHint");

  let animFrameId = null;
  let state = {
    M: 12,
    N: 4,
    cellSize: 30,
    segments: [],
    animating: false,
    endVertex: null,
    outcome: null,
  };

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  function lcm(a, b) {
    return (a / gcd(a, b)) * b;
  }

  function parseMN() {
    const M = Number(inputM.value);
    const N = Number(inputN.value);
    if (!Number.isInteger(M) || !Number.isInteger(N)) {
      return { ok: false, message: "M과 N은 정수여야 합니다." };
    }
    if (M < 1 || N < 1 || M > MAX_MN || N > MAX_MN) {
      return {
        ok: false,
        message: `M, N은 1~${MAX_MN} 사이의 정수여야 합니다.`,
      };
    }
    return { ok: true, M, N };
  }

  function parseInputs() {
    const mn = parseMN();
    if (!mn.ok) return mn;
    const angleDeg = Number(inputAngle.value);
    if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg > 90) {
      return { ok: false, message: "발사 각도는 0°~90° 사이여야 합니다." };
    }
    return { ok: true, M: mn.M, N: mn.N, angleDeg };
  }

  function directionFromAngle(angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    if (Math.hypot(ux, uy) < EPS) {
      return null;
    }
    return { ux, uy };
  }

  function snapToBounds(x, y, M, N) {
    let sx = x;
    let sy = y;
    if (Math.abs(sx) < VERT_EPS) sx = 0;
    if (Math.abs(sx - M) < VERT_EPS) sx = M;
    if (Math.abs(sy) < VERT_EPS) sy = 0;
    if (Math.abs(sy - N) < VERT_EPS) sy = N;
    return { x: sx, y: sy };
  }

  function isVertexFloat(x, y, M, N) {
    const { x: sx, y: sy } = snapToBounds(x, y, M, N);
    return (sx === 0 || sx === M) && (sy === 0 || sy === N);
  }

  function showInputError(msg) {
    if (msg) {
      inputError.hidden = false;
      inputError.textContent = msg;
      btnStart.disabled = true;
    } else {
      inputError.hidden = true;
      inputError.textContent = "";
      btnStart.disabled = state.animating;
    }
  }

  function vertexName(x, y, M, N) {
    const { x: sx, y: sy } = snapToBounds(x, y, M, N);
    if (sx === 0 && sy === 0) return "A (0,0)";
    if (sx === M && sy === 0) return "B (M,0)";
    if (sx === M && sy === N) return "C (M,N)";
    if (sx === 0 && sy === N) return "D (0,N)";
    return `(${sx},${sy})`;
  }

  /**
   * @returns {{ segments: Array<{x0,y0,x1,y1}>, outcome: object }}
   */
  function computePath(M, N, angleDeg) {
    const dir = directionFromAngle(angleDeg);
    if (!dir) {
      return {
        segments: [],
        outcome: {
          type: "error",
          reflections: 0,
          totalLength: 0,
          message: "유효한 발사 방향을 만들 수 없습니다.",
        },
      };
    }

    const segments = [];
    let x = 0;
    let y = 0;
    let ux = dir.ux;
    let uy = dir.uy;
    const seen = new Set();
    let reflections = 0;
    let totalLength = 0;

    for (let step = 0; step < MAX_STEPS; step++) {
      const key = `${x.toFixed(7)},${y.toFixed(7)},${ux.toFixed(7)},${uy.toFixed(7)}`;
      if (seen.has(key)) {
        return {
          segments,
          outcome: {
            type: "cycle",
            reflections,
            totalLength,
            angleDeg,
            message:
              "동일한 상태가 반복되어 꼭지점 없이 주기적으로 진행합니다.",
          },
        };
      }
      seen.add(key);

      const candidates = [];
      if (uy > EPS) candidates.push({ t: (N - y) / uy, wall: "top" });
      if (uy < -EPS) candidates.push({ t: (0 - y) / uy, wall: "bottom" });
      if (ux > EPS) candidates.push({ t: (M - x) / ux, wall: "right" });
      if (ux < -EPS) candidates.push({ t: (0 - x) / ux, wall: "left" });

      const next = candidates.reduce(
        (min, c) => (c.t > EPS && (min === null || c.t < min.t) ? c : min),
        null
      );

      if (!next) {
        return {
          segments,
          outcome: {
            type: "error",
            reflections,
            totalLength,
            angleDeg,
            message: "다음 벽을 찾을 수 없습니다.",
          },
        };
      }

      const t = next.t;
      let x1 = x + t * ux;
      let y1 = y + t * uy;

      if (next.wall === "top") y1 = N;
      else if (next.wall === "bottom") y1 = 0;
      else if (next.wall === "right") x1 = M;
      else if (next.wall === "left") x1 = 0;

      segments.push({ x0: x, y0: y, x1, y1 });
      totalLength += Math.hypot(x1 - x, y1 - y);

      if (isVertexFloat(x1, y1, M, N)) {
        const v = snapToBounds(x1, y1, M, N);
        const leftStart = v.x === 0 && v.y === 0 && reflections === 0;
        if (!leftStart) {
          return {
            segments,
            outcome: {
              type: "vertex",
              x: v.x,
              y: v.y,
              name: vertexName(v.x, v.y, M, N),
              reflections,
              totalLength,
              angleDeg,
              message: `꼭지점 ${vertexName(v.x, v.y, M, N)}에 도달하여 종료합니다.`,
            },
          };
        }
      }

      reflections += 1;
      x = x1;
      y = y1;

      if (next.wall === "top" || next.wall === "bottom") uy = -uy;
      else ux = -ux;
    }

    return {
      segments,
      outcome: {
        type: "limit",
        reflections,
        totalLength,
        angleDeg,
        message: `세그먼트 상한(${MAX_STEPS})에 도달했습니다. 주기적 반복 가능성을 확인하세요.`,
      },
    };
  }

  function computeCellSize(M, N) {
    const maxW = Math.min(800, canvas.parentElement.clientWidth || 800);
    const maxH = 480;
    const innerW = maxW - PADDING * 2;
    const innerH = maxH - PADDING * 2;
    const cs = Math.min(
      Math.floor(innerW / M),
      Math.floor(innerH / N),
      MAX_CELL
    );
    return Math.max(8, cs);
  }

  function resizeCanvas(M, N, cellSize) {
    const w = M * cellSize + PADDING * 2;
    const h = N * cellSize + PADDING * 2;
    canvas.width = w;
    canvas.height = h;
    return { w, h };
  }

  /** Clip segment to closed rectangle [0,M]×[0,N] (math coords). */
  function clipSegmentToRect(x0, y0, x1, y1, M, N) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;

    function clipEdge(p, q) {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }

    if (
      clipEdge(-dx, x0 - 0) &&
      clipEdge(dx, M - x0) &&
      clipEdge(-dy, y0 - 0) &&
      clipEdge(dy, N - y0)
    ) {
      return {
        x0: x0 + t0 * dx,
        y0: y0 + t0 * dy,
        x1: x0 + t1 * dx,
        y1: y0 + t1 * dy,
      };
    }
    return null;
  }

  /** math (x,y) -> canvas pixel */
  function toCanvas(x, y, cellSize) {
    return {
      px: PADDING + x * cellSize,
      py: PADDING + (state.N - y) * cellSize,
    };
  }

  function drawGrid(options) {
    const { M, N, cellSize, segments = [], partial = null, endVertex = null } =
      options;
    const { w, h } = resizeCanvas(M, N, cellSize);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let i = 0; i <= M; i++) {
      const x = PADDING + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, PADDING);
      ctx.lineTo(x, PADDING + N * cellSize);
      ctx.stroke();
    }
    for (let j = 0; j <= N; j++) {
      const y = PADDING + j * cellSize;
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(PADDING + M * cellSize, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.strokeRect(PADDING, PADDING, M * cellSize, N * cellSize);

    const corners = [
      { x: 0, y: 0, label: "A" },
      { x: M, y: 0, label: "B" },
      { x: M, y: N, label: "C" },
      { x: 0, y: N, label: "D" },
    ];
    ctx.fillStyle = "#1e3a5f";
    ctx.font = "bold 14px Segoe UI, sans-serif";
    for (const c of corners) {
      const { px, py } = toCanvas(c.x, c.y, cellSize);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(c.label, px + 8, py - 8);
    }

    if (segments.length > 0 || partial) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(PADDING, PADDING, M * cellSize, N * cellSize);
      ctx.clip();

      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      function drawLaserSegment(x0, y0, x1, y1) {
        const clipped = clipSegmentToRect(x0, y0, x1, y1, M, N);
        if (!clipped) return;
        const a = toCanvas(clipped.x0, clipped.y0, cellSize);
        const b = toCanvas(clipped.x1, clipped.y1, cellSize);
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        drawLaserSegment(seg.x0, seg.y0, seg.x1, seg.y1);
      }

      if (partial) {
        drawLaserSegment(partial.x0, partial.y0, partial.x, partial.y);
      }

      ctx.restore();
    }

    if (endVertex) {
      const { px, py } = toCanvas(endVertex.x, endVertex.y, cellSize);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  function updateResult(outcome, M, N, angleDeg) {
    resultStatus.textContent = outcome.message;
    const len =
      outcome.totalLength !== undefined
        ? outcome.totalLength.toFixed(2)
        : "0";
    resultDetail.textContent = `발사 각도: ${angleDeg}° · 벽면 반사: ${outcome.reflections}회 · 경로 길이: ${len}`;
    const g = gcd(M, N);
    const l = lcm(M, N);
    if (Math.abs(angleDeg - 45) < 1e-6) {
      resultHint.textContent = `참고(45°): gcd(M,N)=${g}, lcm(M,N)=${l}. 45°일 때 경로 길이는 종종 lcm과 관련됩니다.`;
    } else {
      resultHint.textContent =
        "참고: 45°가 아니면 꼭지점에 닿지 않고 반복·상한까지 진행할 수 있습니다. tan(각도)가 유리/무리에 따라 달라집니다.";
    }
  }

  function cancelAnimation() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    state.animating = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    inputM.disabled = false;
    inputN.disabled = false;
    inputAngle.disabled = false;
  }

  function animatePath(segments, outcome, M, N, cellSize, angleDeg) {
    if (segments.length === 0) {
      drawGrid({ M, N, cellSize, segments: [] });
      updateResult(outcome, M, N, angleDeg);
      cancelAnimation();
      return;
    }

    const speed = Number(speedRange.value);
    const unitsPerFrame = (0.15 + speed * 0.35) * 0.5;
    let segIndex = 0;
    let progress = 0;
    const drawn = [];

    function frame() {
      const seg = segments[segIndex];
      const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
      progress += unitsPerFrame;

      while (progress >= len && segIndex < segments.length) {
        drawn.push(segments[segIndex]);
        progress -= len;
        segIndex++;
        if (segIndex >= segments.length) break;
      }

      let partial = null;
      if (segIndex < segments.length) {
        const s = segments[segIndex];
        const lenS = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
        const u = Math.min(progress, lenS);
        const t = lenS > 0 ? u / lenS : 1;
        partial = {
          x0: s.x0,
          y0: s.y0,
          x: s.x0 + (s.x1 - s.x0) * t,
          y: s.y0 + (s.y1 - s.y0) * t,
        };
      }

      const endVertex =
        outcome.type === "vertex"
          ? { x: outcome.x, y: outcome.y }
          : null;

      drawGrid({
        M,
        N,
        cellSize,
        segments: drawn,
        partial,
        endVertex: segIndex >= segments.length ? endVertex : null,
      });

      if (segIndex >= segments.length) {
        updateResult(outcome, M, N, angleDeg);
        cancelAnimation();
        return;
      }

      animFrameId = requestAnimationFrame(frame);
    }

    animFrameId = requestAnimationFrame(frame);
  }

  function refreshGridOnly() {
    const parsed = parseInputs();
    if (!parsed.ok) {
      showInputError(parsed.message);
      return;
    }
    showInputError("");
    state.M = parsed.M;
    state.N = parsed.N;
    state.cellSize = computeCellSize(state.M, state.N);
    drawGrid({ M: state.M, N: state.N, cellSize: state.cellSize });
    resultStatus.textContent =
      "Start를 누르면 A(0,0)에서 설정한 각도로 레이저가 출발합니다.";
    resultDetail.textContent = "";
    resultHint.textContent = "";
  }

  function onStart() {
    cancelAnimation();
    const parsed = parseInputs();
    if (!parsed.ok) {
      showInputError(parsed.message);
      return;
    }
    showInputError("");
    const { M, N, angleDeg } = parsed;
    state.M = M;
    state.N = N;
    state.cellSize = computeCellSize(M, N);

    const { segments, outcome } = computePath(M, N, angleDeg);
    state.segments = segments;
    state.outcome = outcome;
    state.animating = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    inputM.disabled = true;
    inputN.disabled = true;
    inputAngle.disabled = true;

    resultStatus.textContent = "시뮬레이션 진행 중…";
    resultDetail.textContent = "";
    resultHint.textContent = "";

    animatePath(segments, outcome, M, N, state.cellSize, angleDeg);
  }

  function onStop() {
    cancelAnimation();
    refreshGridOnly();
  }

  speedRange.addEventListener("input", () => {
    speedLabel.textContent = speedRange.value;
  });

  inputM.addEventListener("input", () => {
    if (!state.animating) refreshGridOnly();
  });
  inputN.addEventListener("input", () => {
    if (!state.animating) refreshGridOnly();
  });
  inputAngle.addEventListener("input", () => {
    if (!state.animating) refreshGridOnly();
  });

  btnStart.addEventListener("click", onStart);
  btnStop.addEventListener("click", onStop);
  btnReset.addEventListener("click", () => {
    cancelAnimation();
    refreshGridOnly();
  });

  window.addEventListener("resize", () => {
    if (!state.animating) refreshGridOnly();
  });

  refreshGridOnly();
})();
