"""モックを1枚のHTMLに組み立てる（python mock/build.py）。
shell.html（HTMLとCSS）＋ game.js（ゲーム本体）＋ assets/monkeys の絵とデータ → mock/index.html
本番ではこの形にせず、src/ と assets/ に分けて配信する（SPEC.md・CLAUDE.md を参照）"""
import json,base64,pathlib
R=pathlib.Path(__file__).resolve().parent;A=R.parent/'assets'/'monkeys'
M=json.load(open(A/'monkeys.json',encoding='utf-8'))
for m in M:
    m['src']='data:image/png;base64,'+base64.b64encode((A/m['file']).read_bytes()).decode()
    for k in ('id','file'):m.pop(k,None)
shell=(R/'src'/'shell.html').read_text(encoding='utf-8');game=(R/'src'/'game.js').read_text(encoding='utf-8')
(R/'index.html').write_text(shell+game.replace('__MONKEYS__',json.dumps(M,ensure_ascii=False,separators=(',',':'))),encoding='utf-8')
print('built',R/'index.html')
