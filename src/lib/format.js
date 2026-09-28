/* 日期格式化 */

/** 2026-09-28 → 2026/09/28（Blog 卡片和阅读页用） */
export function fmtSlash(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : String(d || '');
}

/** 2026-09-28 → 2026年9月28日（相册灯箱用） */
export function fmtCN(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}年${+m[2]}月${+m[3]}日` : String(d || '');
}

/** 1 → 01 */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 由文字稳定地推导出一个色相，用来给没有封面的笔记生成底纹 */
export function hueFor(s) {
  let h = 0;
  const str = String(s || 'note');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}
