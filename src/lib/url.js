/* 把 public/ 里的资源路径加上 base 前缀。
   部署在子目录时（astro.config.mjs 里设了 base），链接才不会 404。 */
export function asset(p = '') {
  const base = import.meta.env.BASE_URL || '/';
  const b = base.endsWith('/') ? base : base + '/';
  return b + String(p).replace(/^\/+/, '');
}
