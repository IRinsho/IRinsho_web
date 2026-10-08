/* =========================================================
 *  后台单元测试：frontmatter 解析、写入保真、路径安全
 *  跑法：npm run admin:test
 *  全程在系统临时目录里进行，不碰你的真实笔记。
 * ======================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  safeResolve, parseFrontmatter, buildFrontmatter, mergeFields, pickChanged,
  readNote, writeNote, deleteNote, listNotes, listNoteFiles, assertPhotoKey
} from '../server/file-store.mjs';

/* 一份「干净」的笔记：用来验证「打开再保存」必须一字不改 */
const SAMPLE = `---
tags:
  - C语言
title: 随笔练习
cover: p5.jpg
pinned: true
cssclasses:
draft: false
---

\`\`\`
#include <stdio.h>
int main() { return 0; }
\`\`\`
`;

/* 一份「写得很碎」的笔记：带引号的布尔、缺 date */
const SAMPLE_QUIRKY = `---
tags:
  - C语言
title: 随笔练习
cover: p5.jpg
pinned: "true"
cssclasses:
draft:
---

正文
`;

async function makeSandbox(content = SAMPLE) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'irinsho-admin-test-'));
  await fs.mkdir(path.join(root, 'blog', 'c语言学习'), { recursive: true });
  await fs.writeFile(path.join(root, 'blog', '练习.md'), content, 'utf8');
  return root;
}
const REL = '练习.md';

/* ---------------- 解析 ---------------- */

test('解析：带引号的布尔要认成真布尔（否则站点置顶会静默失效）', () => {
  const { data } = parseFrontmatter(SAMPLE_QUIRKY);
  assert.equal(data.pinned, true);
  assert.equal(typeof data.pinned, 'boolean');
});

test('解析：保留字段顺序、块状数组风格、空字段', () => {
  const { data, keys, arrayStyles } = parseFrontmatter(SAMPLE_QUIRKY);
  assert.deepEqual(keys, ['tags', 'title', 'cover', 'pinned', 'cssclasses', 'draft']);
  assert.equal(arrayStyles.tags, 'block');
  assert.deepEqual(data.tags, ['C语言']);
  assert.equal(data.cssclasses, '');
});

test('序列化：块状数组写成多行，不是压成一行', () => {
  const merged = mergeFields({ tags: ['C语言'] }, ['tags'], { tags: ['C语言'] });
  assert.equal(buildFrontmatter(merged.data, merged.order, { tags: 'block' }),
    '---\ntags:\n  - C语言\n---\n');
});

test('序列化：行内数组保持行内', () => {
  assert.equal(buildFrontmatter({ tags: ['a', 'b'] }, ['tags'], { tags: 'inline' }),
    '---\ntags: [a, b]\n---\n');
});

test('序列化：需要引号的值会加引号，不会写出坏 YAML', () => {
  const text = buildFrontmatter({ title: 'a: b', summary: '带,逗号' }, ['title', 'summary'], {});
  assert.match(text, /title: "a: b"/);
  assert.match(text, /summary: "带,逗号"/);
});

test('序列化：空值写成 key:（不带尾空格）', () => {
  assert.equal(buildFrontmatter({ cssclasses: '' }, ['cssclasses'], {}), '---\ncssclasses:\n---\n');
});

/* ---------------- 读取与保真 ---------------- */

test('读取：真实文件读出正确的字段与元信息', async () => {
  const root = await makeSandbox();
  const n = await readNote(root, REL);
  assert.equal(n.fields.pinned, true);
  assert.equal(n.rawPinned, true);
  assert.deepEqual(n.rawOrder, ['tags', 'title', 'cover', 'pinned', 'cssclasses', 'draft']);
  assert.equal(n.fields.cover, 'p5.jpg');
  assert.ok(n.body.includes('#include <stdio.h>'));
  await fs.rm(root, { recursive: true, force: true });
});

test('回写保真：原样保存后文件逐字节不变', async () => {
  const root = await makeSandbox();
  const abs = path.join(root, 'blog', REL);
  const before = await fs.readFile(abs, 'utf8');
  const note = await readNote(root, REL);
  await writeNote(root, REL, note.fields, note.body, note);
  assert.equal(await fs.readFile(abs, 'utf8'), before, '原样保存不该改动文件');
  await fs.rm(root, { recursive: true, force: true });
});

test('保真：文件里没有的字段（例如缺 date）不会被凭空写进去', async () => {
  const root = await makeSandbox(SAMPLE_QUIRKY);
  const abs = path.join(root, 'blog', REL);
  const note = await readNote(root, REL);
  assert.ok(note.fields.date, '表单里应该有推导出来的日期');
  assert.equal(note.had.date, false, '但文件里其实没有 date');
  await writeNote(root, REL, note.fields, note.body, note);
  const after = await fs.readFile(abs, 'utf8');
  assert.ok(!/^date:/m.test(after), '不该凭空多出 date 行');
  assert.match(after, /^pinned: true$/m, '顺便把带引号的布尔规范成真布尔');
  await fs.rm(root, { recursive: true, force: true });
});

test('最小 diff：只改一个字段时，只多出那一行', async () => {
  const root = await makeSandbox();
  const abs = path.join(root, 'blog', REL);
  const before = (await fs.readFile(abs, 'utf8')).split('\n');
  const note = await readNote(root, REL);
  await writeNote(root, REL, { ...note.fields, summary: '后台加的摘要' }, note.body, note);
  const after = (await fs.readFile(abs, 'utf8')).split('\n');
  const newLines = after.filter((l) => l !== '' && !before.includes(l));
  assert.deepEqual(newLines, ['summary: 后台加的摘要']);
  assert.deepEqual(before.filter((l) => l !== '' && !after.includes(l)), [], '不该丢掉任何原有行');
  assert.match(after.join('\n'), /^tags:\n  - C语言$/m, '块状数组保持多行');
  await fs.rm(root, { recursive: true, force: true });
});

test('清空字段：把 summary 清掉时整行删掉', async () => {
  const root = await makeSandbox(`---
title: 有摘要的笔记
summary: 原来的摘要
draft: false
---

正文
`);
  const abs = path.join(root, 'blog', REL);
  const note = await readNote(root, REL);
  await writeNote(root, REL, { ...note.fields, summary: '' }, note.body, note);
  const after = await fs.readFile(abs, 'utf8');
  assert.ok(!/^summary:/m.test(after), 'summary 行应该消失');
  assert.match(after, /^title: 有摘要的笔记$/m);
  await fs.rm(root, { recursive: true, force: true });
});

test('未知字段不会被吃掉（cssclasses 之类）', async () => {
  const root = await makeSandbox();
  const abs = path.join(root, 'blog', REL);
  const note = await readNote(root, REL);
  await writeNote(root, REL, { ...note.fields, title: '改了标题' }, note.body, note);
  const after = await fs.readFile(abs, 'utf8');
  assert.match(after, /^cssclasses:$/m);
  assert.match(after, /^title: 改了标题$/m);
  await fs.rm(root, { recursive: true, force: true });
});

test('正文里的空行不会被吃掉（原文 frontmatter 后有空行）', async () => {
  const root = await makeSandbox(`---
title: 有空行的笔记
---

上面是空行

正文
`);
  const abs = path.join(root, 'blog', REL);
  const before = await fs.readFile(abs, 'utf8');
  const note = await readNote(root, REL);
  await writeNote(root, REL, note.fields, note.body, note);
  assert.equal(await fs.readFile(abs, 'utf8'), before);
  await fs.rm(root, { recursive: true, force: true });
});

/* ---------------- 新建 / 删除 ---------------- */

test('新建：写入草稿并能在列表里看到', async () => {
  const root = await makeSandbox();
  await writeNote(root, 'c语言学习/新笔记.md',
    { title: '新笔记', date: '2026-10-09', tags: ['a'], draft: true }, '# 新笔记\n\n正文\n', null);
  const found = (await listNotes(root)).find((n) => n.rel === 'c语言学习/新笔记.md');
  assert.ok(found);
  assert.equal(found.draft, true);
  assert.equal(found.category, 'c语言学习');
  assert.deepEqual(found.tags, ['a']);
  await fs.rm(root, { recursive: true, force: true });
});

test('删除：文件消失', async () => {
  const root = await makeSandbox();
  await writeNote(root, '临时.md', { title: '临时', date: '2026-10-09', draft: true }, 'x\n', null);
  await deleteNote(root, '临时.md');
  assert.ok(!(await listNoteFiles(root)).includes('临时.md'));
  await fs.rm(root, { recursive: true, force: true });
});

test('笔记名里的日期会被识别，id 不含日期', async () => {
  const root = await makeSandbox();
  await writeNote(root, '2026-10-09 带日期的笔记.md',
    { title: '带日期的笔记', date: '', tags: [], draft: false }, 'x\n', null);
  const n = (await listNotes(root)).find((x) => x.rel.includes('带日期'));
  assert.equal(n.id, '带日期的笔记');
  await fs.rm(root, { recursive: true, force: true });
});

/* ---------------- 安全 ---------------- */

test('安全：越界路径一律拒绝', async () => {
  const root = await makeSandbox();
  for (const evil of [
    'blog/../../../evil.md', '../astro.config.mjs', 'blog/../astro.config.mjs',
    'C:/Windows/evil.md', '/etc/passwd', 'blog/a\0b.md'
  ]) {
    assert.throws(() => safeResolve(root, evil), /拒绝|不允许|非法|不接受/, `应该拒绝：${evil}`);
  }
  await fs.rm(root, { recursive: true, force: true });
});

test('安全：白名单外（源码文件）拒绝写入', async () => {
  const root = await makeSandbox();
  assert.throws(() => safeResolve(root, 'astro.config.mjs'), /白名单/);
  assert.throws(() => safeResolve(root, 'src/layouts/Base.astro'), /白名单/);
  assert.doesNotThrow(() => safeResolve(root, 'blog/a.md'));
  assert.doesNotThrow(() => safeResolve(root, 'img/旅行/a.jpg'));
  assert.doesNotThrow(() => safeResolve(root, 'src/data/videos.js'));
  await fs.rm(root, { recursive: true, force: true });
});

test('安全：图片元信息的 key 必须是正常的图片相对路径', () => {
  assert.doesNotThrow(() => assertPhotoKey('119178066_p0.jpg'));
  assert.doesNotThrow(() => assertPhotoKey('旅行/海边.webp'));
  for (const evil of ['../../evil.jpg', '/etc/x.jpg', 'C:/x.jpg', 'a/../../b.jpg', 'x.txt', '', 'a\0.jpg']) {
    assert.throws(() => assertPhotoKey(evil), /不允许|不能|必须以|缺少|非法/, `应该拒绝：${evil}`);
  }
});

test('备份：写入前会留下旧版本，超量会自动清理', async () => {
  const root = await makeSandbox();
  const note = await readNote(root, REL);
  await writeNote(root, REL, { ...note.fields, title: '第二版' }, note.body, note);
  const backups = await fs.readdir(path.join(root, '.admin', 'backups'));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(root, '.admin', 'backups', backups[0]), 'utf8'), SAMPLE,
    '备份必须是改动前的原文');
  await fs.rm(root, { recursive: true, force: true });
});
