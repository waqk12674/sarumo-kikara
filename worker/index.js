// サルも木から落ちぬん の Worker
//   /api/scores → ランキング（D1: env.DB）
//   それ以外    → 静的ファイル（wrangler.jsonc の run_worker_first にないパスは、この Worker を通らない）
// /sarumo-kikara/api/scores は waqk.jp のルートから届くとき、/api/scores は workers.dev・wrangler dev のとき

const NAME_MAX = 8;
const TOP_N = 10;
const POST_INTERVAL_MS = 10_000; // 同じ人（IP）からの連投を防ぐ間隔
// ありえない記録を弾く目安
const MAX_DEPTH = 15;       // 鎖の深さの上限（地面までの高さで決まる）。1匹の点はこれを超えない
const MIN_SECS_PER = 0.5;   // 1匹連れてくるのにかかる最短の秒数
const MAX_MONKEYS = 400;
const MAX_SECS = 3600;

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

const okPlayer = (p) => typeof p === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(p);

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
  if (!Number.isInteger(monkeys) || monkeys < 1 || monkeys > MAX_MONKEYS) return json({ error: 'bad monkeys' }, 400);
  if (!Number.isInteger(score) || score < 1 || score > monkeys * MAX_DEPTH) return json({ error: 'bad score' }, 400);
  if (!Number.isFinite(secs) || secs < monkeys * MIN_SECS_PER || secs > MAX_SECS) return json({ error: 'bad time' }, 400);

  const now = Date.now(), ip = await ipHash(request);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
    .bind(ip, now - POST_INTERVAL_MS).first('n');
  if (recent > 0) return json({ error: 'too many requests' }, 429);

  await env.DB.prepare('INSERT INTO scores (player, name, score, monkeys, secs, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(body.player, name, score, monkeys, Math.round(secs * 10) / 10, now, ip).run();
  return json({ mine: await mine(env, body.player), top: await top(env, body.player) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/scores' || url.pathname === '/sarumo-kikara/api/scores') {
      try { return await scores(request, env, url); } catch { return json({ error: 'server error' }, 500); }
    }
    return env.ASSETS.fetch(request);
  },
};
