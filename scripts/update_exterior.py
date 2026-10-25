#!/usr/bin/env python3
import json, re, html, urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"painel-tse-2turno-2026"/"pretotalizacao-exterior.json"
SOURCE="https://ulisses-2026.vercel.app/"
UA={"User-Agent":"Mozilla/5.0 (compatible; BrasilDecide2026/1.0)"}

def fetch_text(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=25) as r:
        raw=r.read().decode("utf-8","ignore")
    txt=html.unescape(re.sub(r"<[^>]+>"," ",raw))
    return re.sub(r"\s+"," ",txt)

def n(s):
    return int(s.replace(".",""))

def main():
    cur=json.loads(DATA.read_text(encoding="utf-8"))
    txt=fetch_text(SOURCE)
    m=re.search(r"Exterior\s*·\s*placar geral do 2º turno.*?(\d{1,3}(?:\.\d{3})*) votos apurados.*?(\d+)/186 postos fechados\s*·\s*(\d+) países.*?Flávio\s+([\d.]+)\s+Lula\s+([\d.]+)",txt,re.I)
    if not m:
        raise SystemExit("Snapshot exterior não encontrado na fonte")
    valid=n(m.group(1)); posts=int(m.group(2)); countries=int(m.group(3)); flavio=n(m.group(4)); lula=n(m.group(5))
    if lula+flavio!=valid:
        valid=lula+flavio
    old_valid=int(cur.get("totals",{}).get("valid",0) or 0)
    old_posts=int(cur.get("posts_closed",0) or 0)
    if valid<old_valid or (valid==old_valid and posts<=old_posts):
        print(f"Sem avanço: atual {old_valid} votos/{old_posts} postos; fonte {valid}/{posts}")
        return
    total=max(1,lula+flavio)
    cur["updated_at"]=datetime.now(timezone(timedelta(hours=-3))).isoformat(timespec="seconds")
    cur["source"]={
        "name":"Ulisses 2026 — agregação de BUs/TSE",
        "url":SOURCE,
        "note":"Parcial pré-totalização. Agrega boletins publicados e dados TSE; o painel oficial ZZ continua tendo prioridade absoluta."
    }
    cur["totals"]={
        "lula":lula,"flavio":flavio,"valid":total,
        "lula_pct":round(lula/total*100,2),
        "flavio_pct":round(flavio/total*100,2)
    }
    cur["posts_closed"]=posts
    cur["posts_total"]=186
    cur["countries_count"]=countries
    DATA.write_text(json.dumps(cur,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Atualizado: Lula {lula}, Flávio {flavio}, {posts}/186 postos, {countries} países")

if __name__=="__main__":
    main()
