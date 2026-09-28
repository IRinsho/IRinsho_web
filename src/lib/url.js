/* =========================================================
 *  资源路径 → 可用的网址
 *  ---------------------------------------------------------
 *  asset('media/images/会赢的(7).webp')
 *    →  '/media/images/%E4%BC%9A...%20(7).webp'
 *
 *  为什么要转义：
 *    · 文件名里有中文、空格、括号（例如「会赢的(7).webp」，Windows 图片
 *      默认就爱这么起名）时，直接塞进 src / url() 会被浏览器解析错，
 *      图片就变成了空白。这里统一按 URL 规则转义，一劳永逸。
 *    · 顺手把 Windows 的反斜杠 \ 换成 /，免得把
 *      'media\images\a.webp' 这种路径原样写进页面里变成 404。
 *
 *  部署在子目录时（astro.config.mjs 里设了 base），链接会自动带上前缀。
 * ======================================================= */

/** 把各种写法的路径统一成 / 开头的网址（已做 URL 转义，带 base 前缀） */
export function asset(p = '') {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : base + '/';

  let path = String(p == null ? '' : p).trim();
  if (!path) return prefix;

  // 已经是完整网址（例如从抖音抓到的视频流地址）→ 原样返回，
  // 绝不能加 base 前缀、也不能再转义（签名参数被转义会直接失效）
  if (/^(https?:)?\/\//i.test(path) || /^(data|blob):/i.test(path)) return path;

  // Windows 反斜杠 → 正斜杠；去掉开头的 ./ 和 /
  path = path.replace(/\\/g, '/').replace(/^(\.?\/)+/, '');

  // 按 URL 规则转义（中文、空格、括号都会被安全编码；已有的 %xx 不会被二次转义）
  try {
    path = encodeURI(path);
  } catch (e) { /* 路径本身有问题就原样用 */ }

  return prefix + path;
}
