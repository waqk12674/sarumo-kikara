// ランキングの名前チェック（全ゲーム共通。正本は C:\src\shared\name-filter.js）
// 各ゲームの worker/name-filter.js はこのファイルの写し。言葉を足すときは正本を直し、全ゲームに写す（/all-games）。
//
//   import { checkName } from './name-filter.js';
//   const ng = checkName(name);   // 問題なければ null、だめなら 'ng'（理由は返さない）
//   if (ng) return json({ error: 'ng_name' }, 400);   // 画面には「その名前は登録できません」
//
// 方針（2026-10-22 決定）
// - 対象：性的・下品な言葉、差別・暴言・暴力、URL・連絡先（なりすまし「運営」などは対象外）
// - サーバー（Worker）で判定する。画面側だけでは書き換えて送られると通るため
// - すでに登録されている名前はそのまま（消さない・伏せない）。これからの登録だけ弾く
// - 完全には防げない。すり抜けた名前は運営者が D1 から消す
//
// 判定のしかた
// 1. 全角/半角・大文字/小文字・カタカナ/ひらがなをそろえ、空白・記号・長音（ー）を除く（「チ ン コ」「Ｆｕｃｋ」「ち-ん-こ」も同じ扱い）
// 2. ALLOW（誤判定よけ）に当たる部分を取り除く
// 3. EXACT：名前全体がその言葉と同じなら NG（短くて、ほかの言葉の一部になりやすいもの）
//    CONTAINS：名前のどこかに入っていれば NG
//    英字は 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s に読み替えたものでも調べる（「f0ck」「sh1t」）
// 4. URL・連絡先は、そろえる前の文字で調べる
//
// 言葉の出どころ（2026-10-22 に見比べて、名前に向くものだけ選んだ。ふつうの言葉が多く入っている一覧は丸ごとは使わない）
// - ContentShield の日本語 profanity.json（MIT License, Copyright (c) Zach Handley）
//   https://github.com/ZachHandley/ContentShield （data/languages/ja/profanity.json）
// - List of Dirty, Naughty, Obscene, and Otherwise Bad Words（CC BY 4.0, Copyright (c) Shutterstock, Inc.）の en・ja
//   https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
// - 一覧の一覧：https://github.com/eggplants/awesome-japanese-censored-words

// 名前のどこかに入っていれば NG
const CONTAINS = [
  // 性的・下品
  'ちんこ', 'ちんぽ', 'ちんぼ', 'まんこ', 'せっくす', 'おっぱい', 'ぱいずり', 'ふぇら', 'なかだし',
  'やりまん', 'やりちん', 'おなにー', 'せんずり', 'まんずり', 'ぼっき', 'しゃせい', 'ざーめん',
  'くりとりす', 'ちくび', 'いんもう', 'あなる', 'ぺにす', 'でりへる', 'れいぷ', 'ろりこん', 'のーぱん',
  'うんこ', 'きんたま', 'ちんぽこ', 'おちんちん', 'あばずれ', 'いんばい', 'しりがる', 'くそやろう', 'げすやろう', 'クソ野郎', '糞野郎', '下衆野郎',
  'まざーふぁっかー', 'ふぁっく', 'いらまちお', 'くんにりんぐす', 'ぶっかけ', 'てこき', 'ふたなり', 'すかとろ',
  '射精', '勃起', '陰茎', '膣', '精液', '自慰', '強姦', '輪姦', '痴漢', '売春', '援交', '援助交際', '変態',
  '淫売', '淫乱', '娼婦', '売春婦', '尻軽', '金玉', '近親相姦', '獣姦', '乱交', '中出し', '手コキ', '肛門', '幼児性愛',
  'fuck', 'fvck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'penis', 'vagina', 'pussy', 'porn',
  'hentai', 'dildo', 'asshole', 'blowjob', 'boobs', 'bastard', 'bollocks', 'bukkake', 'cumshot', 'creampie',
  'clitoris', 'cunnilingus', 'ejaculat', 'fellatio', 'gangbang', 'handjob', 'incest', 'jizz', 'masturbat',
  'motherfucker', 'nympho', 'orgasm', 'pedophile', 'paedophile', 'rimjob', 'shemale', 'wank', 'twat', 'vulva', 'nsfw',
  // 差別
  'きちがい', 'ちゃんころ', 'じゃっぷ', 'くろんぼ', 'てぃんば',
  '基地外', '気違い', '池沼', '支那', '土人', '白痴', '知恵遅れ', '毛唐', '片輪',
  'はくち', 'ちえおくれ', 'けとう', 'いけしょう',
  'nigger', 'nigga', 'faggot', 'retard', 'tranny', 'swastika', 'whitepower', 'towelhead', 'raghead',
  'wetback', 'beaner', 'darkie', 'jigaboo', 'neonazi',
  'nazi', 'hitler', 'ナチス', 'ひとらー',
  // 暴言・暴力
  'しねよ', 'ころすぞ', 'ぶっころ', 'ころしてやる', 'しんでくれ', 'しにさらせ',
  'くたばれ', 'しんじまえ', 'くそくらえ', 'きえろ', 'うせろ',
  '死ね', '氏ね', '殺す', '殺せ', '殺してやる', '死んじまえ', '消えろ', '失せろ',
  'killyou', 'killurself', 'killyourself',
];

// 名前全体がこれと同じなら NG（ほかの言葉の一部になりやすい短い言葉）
const EXACT = [
  // 性的・下品
  'えろ', 'えっち', 'ちんちん', 'うんち', 'ちかん', 'ごうかん', 'ばいぶ', 'くんに', 'すけべ', 'まら', 'しょうふ',
  'sex', 'dick', 'cock', 'ass', 'cum', 'tits', 'rape', 'rapist', 'anal', 'ero', 'ecchi', 'sexy', 'xxx', 'boner', 'horny', 'milf', 'porno', 'cumming',
  // 差別
  'がいじ', 'ちしょう', 'かたわ', 'めくら', 'つんぼ', 'ちょん', 'びっこ', 'おかま', 'ほも', 'れず',
  'chink', 'kike', 'spic', 'fag', 'coon', 'paki', 'negro',
  // 暴言・暴力
  'しね', 'ころす', 'ころせ', 'じさつ', 'kys', 'kill', 'die', 'しにさらせ',
];

// 誤判定よけ：この部分は取り除いてから調べる（例：Scunthorpe の cunt、shitake の shit）
const ALLOW = ['scunthorpe', 'shitake', 'shiitake', 'cocktail', 'ちくびれ'];

// URL・連絡先（そろえる前の文字で調べる）
const CONTACT = [
  /https?/,
  /www\./,
  /\.(com|net|org|jp|io|me|ly|xyz|gg|tv|info|biz|link|co)(\b|$)/,
  /@[a-z0-9_]/,              // SNS のアカウント
  /0\d{9,10}/,               // 電話番号（区切りを除いたもの）
  /(line|discord|insta|tiktok)(id|:)/,
];

// 記号・絵文字（そろえると消えるので、そろえる前の文字で調べる）
const RAW = ['🖕', '卐']; // 卍 は日本では寺の記号・若者言葉でも使うので入れない

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

// 全角/半角・大文字/小文字をそろえる
const fold = (s) => s.normalize('NFKC').toLowerCase();

// fold したうえで、カタカナ→ひらがな、空白・記号・長音を除く
function normalize(s) {
  return fold(s)
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}\p{S}\u200b-\u200f\u2060\ufeffー〜～]/gu, '');
}

const N_CONTAINS = CONTAINS.map(normalize).filter(Boolean);
const N_EXACT = new Set(EXACT.map(normalize));
const N_ALLOW = ALLOW.map(normalize);

function hits(n) {
  for (const a of N_ALLOW) n = n.split(a).join('');
  if (!n) return false;
  if (N_EXACT.has(n)) return true;
  return N_CONTAINS.some((w) => n.includes(w));
}

// 問題なければ null、だめなら 'ng'
export function checkName(name) {
  const raw = fold(String(name ?? ''));
  const compact = raw.replace(/[\s\-‐ー－()（）.]/g, '');
  if (CONTACT.some((re) => re.test(raw) || re.test(compact))) return 'ng';
  if (RAW.some((w) => raw.includes(w))) return 'ng';
  const leet = raw.replace(/[0134578@$]/g, (c) => LEET[c] ?? c);
  if (hits(normalize(raw)) || hits(normalize(leet))) return 'ng';
  return null;
}

// 画面に出す文言（各ゲームの日英の辞書に入れる）
export const NG_MESSAGE = { ja: 'その名前は登録できません', en: "That name can't be used." };
