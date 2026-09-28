/* =========================================================
 *  视频链接解析器
 *  ---------------------------------------------------------
 *  你只管把看到的链接粘过来，这里自动换成能播放的播放器地址：
 *
 *    抖音：
 *      https://www.douyin.com/video/7301234567890123456
 *      https://www.iesdouyin.com/share/video/7301234567890123456/
 *      7301234567890123456                    ← 光写这一串数字也行
 *      https://v.douyin.com/xxxxxxx/          ← 短链，能自动认出抖音并给出跳转链接
 *
 *    B 站：
 *      https://www.bilibili.com/video/BV1xx411c7mD
 *      https://b23.tv/xxxxxxx                 ← 短链，转成搜索跳转
 *
 *    YouTube：
 *      https://www.youtube.com/watch?v=xxxxxxx
 *      https://youtu.be/xxxxxxx
 *
 *  返回：
 *    { embed, link, platform }
 *      embed    可以塞进 <iframe> 的地址；拿不到就是空字符串
 *      link     原始链接（播放器放不出来时，让用户点回原站看）
 *      platform 识别到的平台名，识别不出是空字符串
 * ======================================================= */

const DOUYIN_HOSTS = /(^|\.)(douyin\.com|iesdouyin\.com)$/i;

/** 去掉链接尾巴上的查询串和多余斜杠 */
function clean(u) {
  return String(u || '').trim();
}

/** 从任意文本里抠出第一串连续数字（抖音 video id） */
function digitsIn(s) {
  const m = String(s || '').match(/(\d{15,25})/);
  return m ? m[1] : '';
}

/**
 * 核心函数：把用户粘的链接 / ID 转成播放器地址
 * @param {string} raw 用户填的内容（链接或纯 ID）
 */
export function resolveEmbed(raw) {
  const input = clean(raw);
  if (!input) return { embed: '', link: '', platform: '' };

  // 已经是播放器地址或任意站点的完整链接 → 直接当 iframe 用
  if (/^https?:\/\//i.test(input)) {
    // 抖音：把各种形态的链接都归一化成 open.douyin.com 播放器
    const dy = douyinFrom(input);
    if (dy) return dy;
  }

  /* ---------- 纯 ID（一串数字）→ 抖音 ---------- */
  if (/^\d{10,25}$/.test(input)) {
    return {
      embed: 'https://open.douyin.com/player/video?vid=' + input + '&autoplay=0',
      link: 'https://www.douyin.com/video/' + input,
      platform: '抖音'
    };
  }

  /* ---------- 纯 BV 号 → B 站 ---------- */
  if (/^BV[0-9A-Za-z]{8,14}$/.test(input)) {
    return {
      embed: 'https://player.bilibili.com/player.html?bvid=' + input + '&high_quality=1',
      link: 'https://www.bilibili.com/video/' + input,
      platform: 'B站'
    };
  }

  /* ---------- 其它完整链接 ---------- */
  if (/^https?:\/\//i.test(input)) {
    // B 站普通链接 / 短链
    const bv = input.match(/\/video\/(BV[0-9A-Za-z]{8,14})/);
    if (bv) {
      return {
        embed: 'https://player.bilibili.com/player.html?bvid=' + bv[1] + '&high_quality=1',
        link: input,
        platform: 'B站'
      };
    }
    if (/b23\.tv/i.test(input)) {
      return { embed: '', link: input, platform: 'B站' };
    }

    // YouTube
    const yt = youtubeId(input);
    if (yt) {
      return {
        embed: 'https://www.youtube.com/embed/' + yt,
        link: input,
        platform: 'YouTube'
      };
    }

    // 认不出来：当普通外链，外层会新窗口打开
    return { embed: '', link: input, platform: '' };
  }

  return { embed: '', link: '', platform: '' };
}

/** 抖音链接 / ID → 播放器地址 */
function douyinFrom(input) {
  let host = '';
  try {
    host = new URL(input).hostname;
  } catch (e) {
    host = '';
  }

  // 短链（v.douyin.com / v.iesdouyin.com）：解析不出 id，给跳转链接
  if (/^(v|v\d)\.(ies)?douyin\.com$/i.test(host)) {
    return { embed: '', link: input, platform: '抖音' };
  }

  if (!DOUYIN_HOSTS.test(host)) return null;

  // /video/123...  /share/video/123...  ?vid=123...  ?modal_id=123...
  const byPath = input.match(/\/video\/(\d{10,25})/);
  const byQuery = input.match(/[?&](?:vid|modal_id|aweme_id|item_ids?)=(\d{10,25})/);
  const id = (byPath && byPath[1]) || (byQuery && byQuery[1]) || digitsIn(input);

  if (!id) return { embed: '', link: input, platform: '抖音' };

  return {
    embed: 'https://open.douyin.com/player/video?vid=' + id + '&autoplay=0',
    link: input,
    platform: '抖音'
  };
}

/** YouTube 链接 → 视频 id */
function youtubeId(input) {
  try {
    const u = new URL(input);
    if (/(^|\.)youtu\.be$/i.test(u.hostname)) return u.pathname.replace(/^\/+/, '').slice(0, 11);
    if (/(^|\.)youtube\.com$/i.test(u.hostname)) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/embed\/([\w-]{6,})/);
      if (m) return m[1];
    }
  } catch (e) { /* 不是合法链接 */ }
  return '';
}
