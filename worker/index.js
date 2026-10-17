// サルも木から落ちぬん の Worker
//   /api/scores → ランキング（D1: env.DB）
//   /en/        → 英語版（index.html の head を英語に書き換えて返す）
//   /api/share  → Xでシェアの結果画像を R2（env.SHARES）に保存
//   /s/<id>     → 共有ページ（index.html の OGP をその回の結果画像にして返す）。/s/<id>.jpg は画像
//   それ以外    → 静的ファイル（wrangler.jsonc の run_worker_first にないパスは、この Worker を通らない）
// 先頭に /sarumo-kikara が付いて届くのは waqk.jp のルートから、付かないのは workers.dev・wrangler dev から

const NAME_MAX = 8;
const TOP_N = 10;
const POST_INTERVAL_MS = 10_000; // 同じ人（IP）からの連投を防ぐ間隔
// ありえない記録を弾く目安
const MAX_DEPTH = 15;       // 鎖の深さの上限（地面までの高さで決まる）。1匹の点はこれを超えない
const MIN_SECS_PER = 0.5;   // 1匹連れてくるのにかかる最短の秒数
const MAX_MONKEYS = 400;
const MAX_SECS = 3600;

// Xでシェアの結果画像（1200×630 の JPEG）。キーは s/<id>.jpg、期限なし
const PUBLIC_BASE = 'https://waqk.jp/sarumo-kikara';
const SHARE_W = 1200, SHARE_H = 630;
const MAX_JPEG = 200 * 1024;
const ID_RE = /^[0-9A-Za-z]{10}$/;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shareKey = (id) => `s/${id}.jpg`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 手元（wrangler dev）では自分の URL、本番では waqk.jp の URL
const baseOf = (url) => (url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? url.origin : PUBLIC_BASE);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// 端末（player）ごとの最高記録で並べる（同じ点なら先に出したほうが上）。名前はその記録のときのもの
const top = (env, player) => env.DB.prepare(
  `SELECT name, score, (player = ?) AS me FROM (
     SELECT player, name, score, created_at,
            ROW_NUMBER() OVER (PARTITION BY player ORDER BY score DESC, created_at ASC) AS r
     FROM scores)
   WHERE r = 1 ORDER BY score DESC, created_at ASC LIMIT ?`,
).bind(player || '', TOP_N).all().then((r) => r.results.map((x) => ({ name: x.name, score: x.score, me: !!x.me })));

// その端末の最高記録と順位
async function mine(env, player) {
  const best = await env.DB.prepare('SELECT MAX(score) AS s FROM scores WHERE player = ?').bind(player).first('s');
  if (best == null) return null;
  const ahead = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM (SELECT MAX(score) AS s FROM scores GROUP BY player) WHERE s > ?',
  ).bind(best).first('n');
  return { best, rank: ahead + 1 };
}

async function ipHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sarumo:' + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 記録がありえる範囲か（ランキングと共有で同じ判定）。だめなら理由を返す
function checkRecord(score, monkeys, secs) {
  if (!Number.isInteger(monkeys) || monkeys < 1 || monkeys > MAX_MONKEYS) return 'bad monkeys';
  if (!Number.isInteger(score) || score < 1 || score > monkeys * MAX_DEPTH) return 'bad score';
  if (!Number.isFinite(secs) || secs < monkeys * MIN_SECS_PER || secs > MAX_SECS) return 'bad time';
  return null;
}

const okPlayer =(p) => typeof p === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(p);

async function scores(request, env, url) {
  if (request.method === 'GET') {
    const player = url.searchParams.get('player');
    const p = okPlayer(player) ? player : '';
    return json({ top: await top(env, p), mine: p ? await mine(env, p) : null });
  }
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  // 名前：制御文字・<> を除き、前後の空白を取って 8 文字まで
  const name = String(body.name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  const score = Number(body.score), monkeys = Number(body.monkeys), secs = Number(body.secs);
  if (!okPlayer(body.player)) return json({ error: 'bad player' }, 400);
  if (!name || [...name].length > NAME_MAX) return json({ error: 'name must be 1-8 characters' }, 400);
  const bad = checkRecord(score, monkeys, secs);
  if (bad) return json({ error: bad }, 400);

  const now = Date.now(), ip = await ipHash(request);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
    .bind(ip, now - POST_INTERVAL_MS).first('n');
  if (recent > 0) return json({ error: 'too many requests' }, 429);

  await env.DB.prepare('INSERT INTO scores (player, name, score, monkeys, secs, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(body.player, name, score, monkeys, Math.round(secs * 10) / 10, now, ip).run();
  return json({ mine: await mine(env, body.player), top: await top(env, body.player) });
}

// 英語版 /en/：SNS のクローラーは JS を動かさないので、head（lang・タイトル・説明・OGP・canonical）を英語に書き換えて返す。
// 素材や api の相対パスは / と同じ場所から読むよう <base href="../"> を足す（ファイルは index.html の1つだけ。手本は dashimaki）。
// 画面の文言は index.html に日英を並べてあり、lang="en" で英語のほうが見える。OGP 画像は日本語のまま
const EN = {
  title: "Monkeys Don't Fall",
  desc: "Hang black-and-white monkeys on a tree, then hang more monkeys under them. A silly physics puzzle: if even one touches the ground, it's over.",
  url: 'https://waqk.jp/sarumo-kikara/en/',
};
const setAttr = (name, value) => ({ element: (el) => { el.setAttribute(name, value); } });
const englishHead = (rw) => rw
  .on('html', setAttr('lang', 'en'))
  .on('title', { element: (el) => { el.setInnerContent(EN.title); } })
  .on('meta[name="description"]', setAttr('content', EN.desc))
  .on('link[rel="canonical"]', setAttr('href', EN.url))
  .on('meta[property="og:title"]', setAttr('content', EN.title))
  .on('meta[property="og:description"]', setAttr('content', EN.desc))
  .on('meta[property="og:url"]', setAttr('content', EN.url));
async function english(request, url, env) {
  const res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  return englishHead(new HTMLRewriter().on('head', { element: (el) => { el.prepend('<base href="../">', { html: true }); } }))
    .transform(res);
}

// ---------- Xでシェア ----------
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (x) => ALPHABET[x % 62]).join('');
}

// JPEG の幅と高さ（SOF マーカーから読む）。JPEG でなければ null
function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

// 画像を受け取って保存し、id を返す。フォーム: img（1200×630 の JPEG）、score、monkeys、secs、lang
// 利用者が入力した文字（ニックネームなど）は受け取らない
async function postShare(request, env) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JPEG + 4096) return json({ error: 'too large' }, 413);
  // IP ごとに1分5件まで（R2 の書き込み回数が無料枠を超えないよう、連打や悪用を止める）
  const { success } = await env.SHARE_RL.limit({ key: request.headers.get('cf-connecting-ip') ?? 'local' });
  if (!success) return json({ error: 'too many requests' }, 429);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'bad form' }, 400); }
  const img = form.get('img'), lang = form.get('lang');
  const score = Number(form.get('score')), monkeys = Number(form.get('monkeys')), secs = Number(form.get('secs'));
  if (!(img instanceof Blob) || (lang !== 'ja' && lang !== 'en')) return json({ error: 'missing fields' }, 400);
  if (img.size > MAX_JPEG) return json({ error: 'too large' }, 413);
  const bytes = new Uint8Array(await img.arrayBuffer()), size = jpegSize(bytes);
  if (!size) return json({ error: 'not a jpeg' }, 400);
  if (size.w !== SHARE_W || size.h !== SHARE_H) return json({ error: `must be ${SHARE_W}x${SHARE_H}` }, 400);
  const bad = checkRecord(score, monkeys, secs);
  if (bad) return json({ error: bad }, 400);
  const id = newId();
  await env.SHARES.put(shareKey(id), bytes, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { score: String(score), monkeys: String(monkeys), lang, created: new Date().toISOString() },
  });
  return json({ id }, 201);
}

const shareTitle = ({ score, monkeys, lang }) => (lang === 'en'
  ? `${score} point${score === '1' ? '' : 's'} with ${monkeys} monkey${monkeys === '1' ? '' : 's'}`
  : `サルを${monkeys}匹つなげて${score}点`);

// 共有ページ：ゲームのトップ（index.html）の OGP をその回の結果画像にして返す。開いた人はそのまま遊べる。検索には出さない
async function sharePage(request, url, env, id) {
  const base = baseOf(url);
  const obj = ID_RE.test(id) ? await env.SHARES.head(shareKey(id)) : null;
  if (!obj) return Response.redirect(`${base}/`, 302);
  const meta = obj.customMetadata, title = shareTitle(meta), image = `${base}/s/${id}.jpg`;
  // /s/<id> は1階層深いので、相対パスの素材や api をトップから読ませる
  let rw = new HTMLRewriter().on('head', { element: (el) => { el.prepend(`<base href="${esc(base)}/">`, { html: true }); } });
  if (meta.lang === 'en') rw = englishHead(rw); // 英語で作った共有は、/en/ と同じく英語の画面にする
  rw = rw
    .on('meta[property="og:title"]', setAttr('content', title))
    .on('meta[property="og:url"]', setAttr('content', `${base}/s/${id}`))
    .on('meta[property="og:image"]', setAttr('content', image))
    .on('head', { element: (el) => {
      el.append(['<meta name="robots" content="noindex">', `<meta name="twitter:title" content="${esc(title)}">`,
        `<meta name="twitter:image" content="${esc(image)}">`, ''].join('\n'), { html: true });
    } });
  const res = rw.transform(await env.ASSETS.fetch(new Request(new URL('/', url), request)));
  return new Response(res.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}

// 画像：作った後は変わらないので長くキャッシュさせる。2回目からはエッジのキャッシュから返し、R2 を読まない
async function shareImage(request, env, ctx, id) {
  if (!ID_RE.test(id)) return new Response('Not found', { status: 404 });
  const cache = caches.default, key = new Request(request.url);
  const hit = await cache.match(key);
  if (hit) return hit;
  const obj = await env.SHARES.get(shareKey(id));
  if (!obj) return new Response('Not found', { status: 404 });
  const res = new Response(obj.body, {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=2592000, immutable', etag: obj.httpEtag },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/sarumo-kikara(?=\/)/, '');
    if (path === '/api/scores') {
      try { return await scores(request, env, url); } catch { return json({ error: 'server error' }, 500); }
    }
    if (path === '/api/share') {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      try { return await postShare(request, env); } catch { return json({ error: 'server error' }, 500); }
    }
    const s = request.method === 'GET' && path.match(/^\/s\/([^/.]+)(\.jpg)?$/);
    if (s) return s[2] ? shareImage(request, env, ctx, s[1]) : sharePage(request, url, env, s[1]);
    // /en → /en/（相対の Location なので、waqk.jp では /sarumo-kikara/en/ になる）
    if (path === '/en') return new Response(null, { status: 301, headers: { Location: 'en/' + url.search } });
    if (path === '/en/' && request.method === 'GET') return english(request, url, env);
    return env.ASSETS.fetch(request);
  },
};
