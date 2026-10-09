/* =========================================================
 *  引力星野（可交互 Canvas 粒子网）
 *  ---------------------------------------------------------
 *  鼠标是引力源：附近的粒子被吸过来，粒子之间的连线跟着变亮。
 *  点一下给一次冲击波：粒子被推开，然后缓缓归位。
 *
 *  设计约束（遵守站点的既有原则）：
 *    1. 不能白屏 —— 这个模块只负责往 canvas 上画，
 *       canvas 本身是空的、绝对定位、pointer-events:none，
 *       脚本不跑就什么也不显示，首屏照旧是静态主视觉 + 完整文字。
 *    2. 尊重「减少动态效果」—— 命中就完全不启动。
 *    3. 手机友好 —— 粒子数按屏宽减半；触屏用「按住拖动」代替悬停引力。
 *    4. 不卡、不耗电 —— 页面切到后台 / 滚出视野就暂停绘制。
 *
 *  用法：initGateField()  —— 幂等，可以反复调用（换页后要重建）。
 * ======================================================= */

export function initGateField() {
  const canvas = document.getElementById('gateField');
  const gate = document.getElementById('homeGate');
  if (!canvas || !gate) return;

  // 已经初始化过就不重复来（换页/重复 boot 时保护）
  if (canvas.dataset.fieldReady === '1') return;
  canvas.dataset.fieldReady = '1';

  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  /* ---------------- 参数 ---------------- */

  const isSmall = window.innerWidth < 760;
  const COUNT = isSmall ? 64 : 132;       // 手机减半，省电
  const LINK_DIST = isSmall ? 118 : 150;  // 连线的最大距离
  const MOUSE_R = isSmall ? 130 : 200;    // 引力作用半径
  const MOUSE_G = isSmall ? 0 : 0.055;    // 引力强度（触屏不给持续引力）
  const DRIFT = 0.16;                     // 自身漂移速度
  const MAX_SPEED = 1.5;
  const FRICTION = 0.955;                 // 阻尼，让冲击波慢慢停
  /* 可见度：太淡就等于没做。这组数值是照着"正常尺寸下也能一眼看见"调的 */
  const DOT_ALPHA = 0.62;                 // 粒子基础不透明度
  const LINK_ALPHA = 0.5;                 // 连线基础不透明度

  let W = 0, H = 0, dpr = 1;
  let particles = [];
  const mouse = { x: 0, y: 0, active: false };
  const ripples = [];                     // 点击冲击波
  let raf = 0;
  let running = false;

  /* ---------------- 尺寸 ---------------- */

  function resize() {
    const rect = gate.getBoundingClientRect();
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    // 高 DPI 屏最多按 2 倍画，再高只是白烧性能
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------- 粒子 ---------------- */

  function makeParticle() {
    // z 做纵深：越大越靠前，也越亮、越大、动得越快
    const z = 0.4 + Math.random() * 0.6;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * DRIFT * 2,
      vy: (Math.random() - 0.5) * DRIFT * 2,
      z,
      r: 1.1 + z * 1.9,
      // 少量粒子用玫红，其余偏白，和站点配色呼应
      rose: Math.random() < 0.34
    };
  }

  function seed() {
    particles = [];
    for (let i = 0; i < COUNT; i++) particles.push(makeParticle());
  }

  /* ---------------- 交互 ---------------- */

  function pointerMove(e) {
    const rect = gate.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.active = true;
  }

  function pointerLeave() {
    mouse.active = false;
  }

  /** 点击/触摸：推一次冲击波 */
  function shock(e) {
    const rect = gate.getBoundingClientRect();
    const x = (e.clientX != null ? e.clientX : 0) - rect.left;
    const y = (e.clientY != null ? e.clientY : 0) - rect.top;
    ripples.push({ x, y, r: 0, life: 1 });

    for (const p of particles) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 320) continue;                      // 太远的不用理
      const force = (1 - d / 320) * 9.5 * p.z;
      p.vx += (dx / d) * force;
      p.vy += (dy / d) * force;
    }
  }

  /* ---------------- 每帧 ---------------- */

  function step() {
    // 1) 受力
    for (const p of particles) {
      if (mouse.active && MOUSE_G > 0) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_R * MOUSE_R && d2 > 1) {
          const d = Math.sqrt(d2);
          // 越近吸力越强，并让粒子稍微绕一点，看起来像"被卷进去"
          const f = (1 - d / MOUSE_R) * MOUSE_G * p.z;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
          p.vx += (-dy / d) * f * 0.35;
          p.vy += (dx / d) * f * 0.35;
        }
      }

      // 自身漂移（很轻），保证没人操作时画面也是活的
      p.vx += (Math.random() - 0.5) * 0.012;
      p.vy += (Math.random() - 0.5) * 0.012;

      // 阻尼 + 限速
      p.vx *= FRICTION;
      p.vy *= FRICTION;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAX_SPEED * p.z) {
        p.vx = (p.vx / sp) * MAX_SPEED * p.z;
        p.vy = (p.vy / sp) * MAX_SPEED * p.z;
      }

      p.x += p.vx;
      p.y += p.vy;

      // 边界：穿出去就绕回来，避免粒子全跑光
      if (p.x < -12) p.x = W + 12;
      if (p.x > W + 12) p.x = -12;
      if (p.y < -12) p.y = H + 12;
      if (p.y > H + 12) p.y = -12;
    }

    // 2) 画
    ctx.clearRect(0, 0, W, H);

    // 2a) 连线（只连近的，且每对只算一次）
    ctx.lineWidth = 0.9;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK_DIST * LINK_DIST) continue;
        const d = Math.sqrt(d2);
        const t = 1 - d / LINK_DIST;
        const alpha = t * LINK_ALPHA * Math.min(a.z, b.z);

        // 靠近鼠标的连线更亮 —— 让"引力"看得见
        let boost = 1;
        if (mouse.active) {
          const mdx = (a.x + b.x) / 2 - mouse.x;
          const mdy = (a.y + b.y) / 2 - mouse.y;
          const md = Math.hypot(mdx, mdy);
          if (md < MOUSE_R) boost = 1 + (1 - md / MOUSE_R) * 3;
        }
        ctx.strokeStyle = (a.rose || b.rose)
          ? `rgba(236, 96, 136, ${Math.min(0.9, alpha * boost * 1.4)})`
          : `rgba(206, 218, 255, ${Math.min(0.8, alpha * boost)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // 2b) 冲击波圆环
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.r += 9;
      r.life -= 0.028;
      if (r.life <= 0) { ripples.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(224, 70, 111, ${r.life * 0.45})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2c) 粒子本体（带一点辉光）
    for (const p of particles) {
      const near = mouse.active
        ? Math.max(0, 1 - Math.hypot(p.x - mouse.x, p.y - mouse.y) / MOUSE_R)
        : 0;
      const rad = p.r * (1 + near * 1.1);
      const alpha = DOT_ALPHA + p.z * 0.32 + near * 0.3;

      if (p.rose || near > 0.2) {
        ctx.shadowBlur = 12 * (0.5 + near);
        ctx.shadowColor = 'rgba(224, 70, 111, 0.9)';
      } else {
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(190, 210, 255, 0.6)';
      }

      ctx.fillStyle = p.rose
        ? `rgba(244, 128, 162, ${Math.min(1, alpha)})`
        : `rgba(238, 243, 255, ${Math.min(1, alpha * 0.92)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    raf = requestAnimationFrame(step);
  }

  /* ---------------- 启停 ---------------- */

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(step);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /** 首屏滚出视野就停下 —— 别在看不见的地方烧 CPU */
  function watchVisibility() {
    if (!('IntersectionObserver' in window)) { start(); return; }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting && !document.hidden) start();
        else stop();
      }
    }, { threshold: 0 });
    io.observe(gate);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (gate.getBoundingClientRect().bottom > 0) start();
  });

  /* ---------------- 挂载 ---------------- */

  resize();
  seed();
  watchVisibility();

  window.addEventListener('resize', () => {
    resize();
    seed();                 // 尺寸变了就重新撒，避免粒子挤在角落
  }, { passive: true });

  gate.addEventListener('pointermove', pointerMove, { passive: true });
  gate.addEventListener('pointerleave', pointerLeave, { passive: true });
  gate.addEventListener('pointerdown', shock, { passive: true });

  // 触屏：按住拖动也能牵引粒子（触屏没有 hover）
  gate.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) pointerMove({ clientX: t.clientX, clientY: t.clientY });
  }, { passive: true });

  // 清理钩子：换页时 Astro 会把 DOM 换掉，这里主动停掉旧循环
  canvas.addEventListener('astro:before-swap', stop, { once: true });

  start();
}
