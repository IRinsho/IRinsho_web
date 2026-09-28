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

/** 从任意文本里抠出第一串连续数字（抖音数字视频 id） */
function digitsIn(s) {
  const m = String(s || '').match(/(\d{15,25})/);
  return m ? m[1] : '';
}

/**
 * 把「分享文本」里的链接抠出来。
 * 抖音的分享内容常常长这样：
 *   7.86 复制打开抖音，看看【某某的作品】... https://v.douyin.com/xxxx/ 复制此链接...
 * 直接整段贴进来也能用。
 */
function pickUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s"'<>）)】]+/i);
  return m ? m[0] : '';
}

/**
 * 核心函数：把用户粘的链接 / ID 转成播放器地址
 * @param {string} raw 用户填的内容（链接或纯 ID）
 */
export function resolveEmbed(raw) {
  let input = clean(raw);
  if (!input) return { embed: '', link: '', platform: '' };

  // 允许整段分享文本直接粘进来（抖音分享口令那种），先抠出里面的链接
  if (!/^https?:\/\//i.test(input)) {
    const found = pickUrl(input);
    if (found) input = found;
  }

  // 完整链接 → 按平台归一化成播放器地址
  const dy = douyinFrom(input);
  if (dy) return dy;

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
  // 整段分享文本里先抠链接
  const url = pickUrl(input) || input;

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (e) {
    host = '';
  }

  // 短链（v.douyin.com / v.iesdouyin.com）：里面没有视频 id，只能给跳转链接
  if (/^(v|v\d)\.(ies)?douyin\.com$/i.test(host)) {
    return { embed: '', link: url, platform: '抖音' };
  }

  if (!DOUYIN_HOSTS.test(host)) return null;

  // 优先取数字 id（官方播放器认的数字视频 id）：
  //   /video/7301234567890123456   /share/video/123...   ?vid=123...   ?modal_id=123...
  const numeric =
    (url.match(/\/video\/(\d{10,25})/) || [])[1] ||
    (url.match(/[?&](?:vid|modal_id|aweme_id|item_ids?)=(\d{10,25})/) || [])[1] ||
    digitsIn(url);

  if (numeric) {
    return {
      embed: 'https://open.douyin.com/player/video?vid=' + numeric + '&autoplay=0',
      link: url,
      platform: '抖音'
    };
  }

  // 老格式 / 分享口令里的短码，例如 https://www.douyin.com/video/jFlBIKzLFO8
  // 这种不是数字视频 id，官方播放器多半不认；仍然拼一次播放器地址试试，
  // 拼不出来时页面会给「去抖音看」的按钮兜底。
  const code =
    (url.match(/\/video\/([0-9A-Za-z_-]{4,})/) || [])[1] ||
    (url.match(/[?&](?:vid|modal_id|aweme_id)=([0-9A-Za-z_-]{4,})/) || [])[1];

  if (code) {
    return {
      embed: 'https://open.douyin.com/player/video?vid=' + code,
      link: url,
      platform: '抖音'
    };
  }

  return { embed: '', link: url, platform: '抖音' };
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
