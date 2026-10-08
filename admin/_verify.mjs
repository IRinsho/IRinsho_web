/* 打印线上站点真实返回内容（用完即删） */
const BASE = 'https://irinsho.top';
const r = await fetch(BASE + '/', { headers: { 'Cache-Control': 'no-cache' } });
console.log('状态:', r.status);
console.log('Content-Type:', r.headers.get('content-type'));
console.log('Server:', r.headers.get('server'));
console.log('所有响应头:');
for (const [k, v] of r.headers) console.log('  ', k, '=', v);
const text = await r.text();
console.log('\n正文（前 1500 字符）:\n' + '-'.repeat(60));
console.log(text.slice(0, 1500));

console.log('\n\n=== 对比：单篇笔记路径 ===');
const r2 = await fetch(BASE + '/notes/' + encodeURIComponent('特殊换行代码') + '/');
const t2 = await r2.text();
console.log('状态', r2.status, ' 长度', t2.length, ' 与首页相同?', t2 === text);
console.log(t2.slice(0, 400));
