/* =========================================================
 *  syn-field.js —— 首页的 three.js「紫场」
 *  ---------------------------------------------------------
 *  只在两种条件同时满足时才启动：
 *    ① html[data-theme="synapse"]（默认的 KISARA 不加载）
 *    ② 视口 ≥ 900px（窄屏首屏是整张插画，没有卡片构图）
 *  three 本身是**动态 import**，所以默认访客一个字节都不下载；
 *  第一次点「SYNAPSE」时才去取那块 chunk。
 *
 *  画面：一团缓慢流动的紫罗兰 / 洋红光雾（fbm 噪声 + 域扭曲），
 *  鼠标会像一盏灯一样把附近的雾提亮。没有贴图、没有模型，
 *  只有一个全屏三角面和一段 fragment shader。
 *
 *  性能与礼貌：
 *    · DPR 上限 1.25，30fps（每 32ms 才画一帧）
 *    · 页面不可见 / 首屏滚出视口 / 切回 KISARA 时自动停画
 *    · prefers-reduced-motion：只画一帧静态画面
 *    · WebGL 不可用：canvas 留空，CSS 里的静态紫场兜底
 * ======================================================= */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec2  uRes;
  uniform float uTime;
  uniform vec2  uMouse;
  varying vec2  vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(11.3, 7.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uRes.x / max(uRes.y, 1.0);
    vec2 p = uv - 0.5;
    p.x *= aspect;

    float t = uTime * 0.045;

    /* 域扭曲：让雾有"被什么搅动"的走向，而不是一团静止的噪声 */
    vec2 q = vec2(
      fbm(p * 1.6 + vec2(t, 0.0)),
      fbm(p * 1.6 - vec2(0.0, t) + 7.1)
    );

    float n = fbm(p * 2.4 + q * 1.3 + vec2(0.0, t * 1.4));
    float m = fbm(p * 3.6 - q * 0.8 - vec2(t * 0.7, 0.0));

    float glow = smoothstep(0.16, 0.94, n);

    vec3 base    = vec3(0.030, 0.012, 0.055);
    vec3 violet  = vec3(0.400, 0.150, 0.920);
    vec3 magenta = vec3(0.800, 0.180, 0.900);
    vec3 lilac   = vec3(0.720, 0.550, 1.000);

    vec3 col = mix(base, violet, glow);
    col = mix(col, magenta, smoothstep(0.45, 1.0, m) * 0.55);
    col += lilac * 0.10 * smoothstep(0.62, 1.0, n * n);

    /* 鼠标位置的一盏灯 */
    vec2 mp = uMouse;
    mp.x *= aspect;
    float dm = length(p - (mp - 0.5));
    col += vec3(0.30, 0.12, 0.55) * exp(-dm * 2.6) * 0.50;

    /* 左上角的主光，和参考站那张海报的光向一致 */
    float dk = length(p - vec2(-0.55 * aspect, 0.45));
    col += vec3(0.22, 0.08, 0.42) * exp(-dk * 2.2) * 0.60;

    /* 暗角 + 极细颗粒，避免大面积渐变出现色带 */
    col *= 1.0 - 0.55 * smoothstep(0.55, 1.25, length(p));
    col += (hash(uv * uRes + uTime * 60.0) - 0.5) * 0.020;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const isSynapse = () =>
  document.documentElement.getAttribute('data-theme') === 'synapse';

const isDesktop = () =>
  window.matchMedia && window.matchMedia('(min-width: 1100px)').matches;

const prefersReduced = () =>
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 换页前把旧的 GL 上下文拆掉，避免每换一次页就多一个渲染器 */
if (!window.__synFieldSwapBound) {
  window.__synFieldSwapBound = true;
  document.addEventListener('astro:before-swap', () => {
    const canvas = document.querySelector('[data-syn-field]');
    if (canvas && typeof canvas.__synDispose === 'function') canvas.__synDispose();
  });
}

export function initSynField() {
  const canvas = document.querySelector('[data-syn-field]');
  if (!canvas || canvas.dataset.synState) return;

  let booting = false;

  const boot = () => {
    if (booting || canvas.dataset.synState) return;
    if (!isSynapse() || !isDesktop()) return;
    booting = true;
    canvas.dataset.synState = 'loading';

    import('three')
      .then((THREE) => setup(THREE, canvas))
      .catch(() => {
        canvas.dataset.synState = 'failed';
        booting = false;
      });
  };

  /* 主题切换：从 KISARA 切到 SYNAPSE 时才去下载 three */
  const onTheme = () => boot();
  window.addEventListener('irinsho:theme', onTheme);

  /* 从窄屏拉宽到桌面端时，如果当前正好是 SYNAPSE，也补一次启动 */
  const mq = window.matchMedia ? window.matchMedia('(min-width: 1100px)') : null;
  const onMq = () => boot();
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);

  canvas.__synThemeHandler = onTheme;
  canvas.__synMqHandler = onMq;
  canvas.__synMq = mq;

  boot();
}

function setup(THREE, canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    canvas.dataset.synState = 'failed';
    return;
  }

  canvas.dataset.synState = 'ready';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const gate = canvas.closest('.gate');

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w, h);
  };
  resize();

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let visible = true;
  const io = new IntersectionObserver(
    (entries) => { visible = entries[0].isIntersecting; },
    { rootMargin: '120px' }
  );
  io.observe(canvas);

  const targetMouse = new THREE.Vector2(0.5, 0.5);
  const onMove = (e) => {
    if (!gate) return;
    const r = gate.getBoundingClientRect();
    if (!r.width || !r.height) return;
    targetMouse.set(
      (e.clientX - r.left) / r.width,
      1 - (e.clientY - r.top) / r.height
    );
  };
  if (gate) gate.addEventListener('pointermove', onMove, { passive: true });

  let raf = 0;
  let last = 0;
  const start = performance.now();
  const staticMode = prefersReduced();

  const render = (now) => {
    raf = requestAnimationFrame(render);
    if (document.hidden || !visible || !isSynapse()) return;
    if (now - last < 32) return;      /* ~30fps，省电也够用 */
    last = now;
    uniforms.uTime.value = (now - start) / 1000;
    uniforms.uMouse.value.lerp(targetMouse, 0.06);
    renderer.render(scene, camera);
  };

  if (staticMode) {
    uniforms.uTime.value = 1.4;
    renderer.render(scene, camera);
  } else {
    raf = requestAnimationFrame(render);
  }

  canvas.__synDispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    if (gate) gate.removeEventListener('pointermove', onMove);
    window.removeEventListener('irinsho:theme', canvas.__synThemeHandler);
    if (canvas.__synMq && canvas.__synMq.removeEventListener) {
      canvas.__synMq.removeEventListener('change', canvas.__synMqHandler);
    }
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.__synDispose = null;
    canvas.dataset.synState = '';
  };
}
