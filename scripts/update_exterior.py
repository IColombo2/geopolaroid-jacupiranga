#!/usr/bin/env python3
import json, re, html, urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"painel-tse-2turno-2026"/"pretotalizacao-exterior.json"

TSE_URL="https://resultados.tse.jus.br/oficial/ele2026/6258/dados/zz/zz-c0001-e006258-u.json"
FALLBACK_URL="https://ulisses2026.com.br/"
UA={"User-Agent":"Mozilla/5.0 (compatible; BrasilDecide2026/2.0)"}

def now_br():
    return datetime.now(timezone(timedelta(hours=-3))).isoformat(timespec="seconds")

def fetch_json(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=25) as r:
        return json.loads(r.read().decode("utf-8","ignore"))

def fetch_text(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=25) as r:
        raw=r.read().decode("utf-8","ignore")
    txt=html.unescape(re.sub(r"<[^>]+>"," ",raw))
    return re.sub(r"\s+"," ",txt)

def parse_count(v):
    if isinstance(v,(int,float)): return int(v)
    if v is None: return 0
    s=str(v).strip().replace(".","").replace(" ","")
    return int(s) if s.isdigit() else 0

def parse_pct(v):
    if isinstance(v,(int,float)): return float(v)
    if v is None: return 0.0
    s=str(v).strip().replace(".","").replace(",",".") if "," in str(v) else str(v).strip()
    try: return float(s)
    except: return 0.0

def candidate_nodes(raw):
    out=[]
    for cargo in raw.get("carg",[]) or []:
        for agr in cargo.get("agr",[]) or []:
            for par in agr.get("par",[]) or []:
                out.extend(par.get("cand",[]) or [])
            out.extend(agr.get("cand",[]) or [])
        out.extend(cargo.get("cand",[]) or [])
    return out

def tse_snapshot():
    raw=fetch_json(TSE_URL)
    nodes=candidate_nodes(raw)
    lula=next((x for x in nodes if str(x.get("n","")).strip()=="13"),None)
    flavio=next((x for x in nodes if str(x.get("n","")).strip()=="22"),None)
    if not lula or not flavio: return None
    lv=parse_count(lula.get("vap")); fv=parse_count(flavio.get("vap"))
    if lv+fv<=0: return None
    s=raw.get("s",{}) or {}
    return {
      "lula":lv,"flavio":fv,"valid":lv+fv,
      "lula_pct":round(lv/(lv+fv)*100,2),
      "flavio_pct":round(fv/(lv+fv)*100,2),
      "sections_done":parse_count(s.get("st")),
      "sections_total":parse_count(s.get("ts")),
      "sections_pct":parse_pct(s.get("pst")),
      "dg":raw.get("dg",""),"hg":raw.get("hg","")
    }

def fallback_snapshot():
    txt=fetch_text(FALLBACK_URL)
    patterns=[
      r"Exterior\s*·\s*placar geral do 2º turno.*?(\d{1,3}(?:\.\d{3})*) votos apurados.*?(\d+)/186 postos fechados\s*·\s*(\d+) países.*?Flávio\s+([\d.]+)\s+Lula\s+([\d.]+)",
      r"(\d{1,3}(?:\.\d{3})*) votos apurados.*?(\d+)/186 postos fechados.*?(\d+) países.*?Flávio\s+([\d.]+).*?Lula\s+([\d.]+)"
    ]
    m=next((re.search(p,txt,re.I) for p in patterns if re.search(p,txt,re.I)),None)
    if not m: return None
    valid=parse_count(m.group(1)); posts=int(m.group(2)); countries=int(m.group(3))
    fv=parse_count(m.group(4)); lv=parse_count(m.group(5))
    total=lv+fv
    if total<=0: return None
    return {
      "lula":lv,"flavio":fv,"valid":total,
      "lula_pct":round(lv/total*100,2),
      "flavio_pct":round(fv/total*100,2),
      "posts_closed":posts,"posts_total":186,"countries_count":countries
    }

def main():
    cur=json.loads(DATA.read_text(encoding="utf-8"))
    old_valid=int(cur.get("totals",{}).get("valid",0) or 0)

    # 1) PRIORIDADE ABSOLUTA: totalização oficial ZZ do TSE
    try:
        tse=tse_snapshot()
    except Exception as e:
        print("TSE ZZ indisponível:",e)
        tse=None

    if tse and tse["valid"]>=old_valid:
        cur["updated_at"]=now_br()
        cur["last_verified_at"]=now_br()
        cur["official_snapshot"]=True
        cur["source"]={
          "name":"TSE — totalização oficial do exterior (ZZ)",
          "url":TSE_URL,
          "note":"Dados oficiais do Portal Resultados do TSE para a UF ZZ."
        }
        cur["totals"]={k:tse[k] for k in ["lula","flavio","valid","lula_pct","flavio_pct"]}
        cur["sections_done"]=tse["sections_done"]
        cur["sections_total"]=tse["sections_total"]
        cur["sections_pct"]=tse["sections_pct"]
        cur["tse_generated_date"]=tse["dg"]
        cur["tse_generated_time"]=tse["hg"]
        cur["verification_status"]="Totalização oficial ZZ do TSE disponível; fontes jornalísticas passam a ser apenas conferência."
        cur["source_note"]="Fonte primária: TSE/ZZ. CNN, Band, Folha/BBC e demais veículos são usados somente para conferência independente."
        DATA.write_text(json.dumps(cur,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(f"TSE oficial: Lula {tse['lula']}, Flávio {tse['flavio']}, {tse['sections_pct']}% seções")
        return

    # 2) ANTES DO ZZ: maior snapshot de BUs, sem regressão
    try:
        fb=fallback_snapshot()
    except Exception as e:
        print("Fallback indisponível:",e)
        fb=None

    if not fb or fb["valid"]<=old_valid:
        print(f"Sem avanço: atual {old_valid}; fallback {fb['valid'] if fb else 'indisponível'}")
        return

    cur["updated_at"]=now_br()
    cur["last_verified_at"]=now_br()
    cur["official_snapshot"]=False
    cur["source"]={
      "name":"Ulisses 2026 — agregação de BUs/TSE",
      "url":FALLBACK_URL,
      "note":"Pré-totalização baseada em boletins; usada somente enquanto o ZZ oficial do TSE ainda não trouxer votos válidos."
    }
    cur["totals"]={k:fb[k] for k in ["lula","flavio","valid","lula_pct","flavio_pct"]}
    cur["posts_closed"]=fb["posts_closed"]
    cur["posts_total"]=fb["posts_total"]
    cur["countries_count"]=fb["countries_count"]
    cur["verification_status"]="Snapshot de BUs atualizado; TSE/ZZ continua sendo consultado primeiro em cada execução."
    cur["source_note"]="Prioridade: TSE/ZZ > snapshot de BUs > CNN/Band/Folha/BBC como conferência. Fontes jornalísticas nunca são somadas entre si."
    DATA.write_text(json.dumps(cur,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Fallback BUs: Lula {fb['lula']}, Flávio {fb['flavio']}, {fb['posts_closed']}/186 postos")

if __name__=="__main__":
    main()
