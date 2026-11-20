"""Ana akış: kaynakları tara → zenginleştir → ayrıştır → birleştir → yayınla → bildir."""
from __future__ import annotations

import gzip
import json
import logging
import os
import shutil
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

from . import llm, parse
from .http import session
from .models import Ham, SourceError
from .notify import Notifier, pro_condition
from .sources import ilangov, iskur, kariyerkapisi
from .text import fold, iller_bul

log = logging.getLogger("adaymemur")
TR = timezone(timedelta(hours=3))
SOURCES = {"kariyerkapisi": kariyerkapisi, "ilangov": ilangov, "iskur": iskur}
SCHEMA_VERSION = 1
ENRICH_BUDGET_S = int(os.environ.get("ENRICH_BUDGET_S", "600"))
LLM_PER_RUN = int(os.environ.get("LLM_PER_RUN", "25"))
FREE_DIGEST_HOUR = 19  # TR saati


def now_tr() -> datetime:
    return datetime.now(TR)


# --- durum ---------------------------------------------------------------------
def load_state(state_url: str | None, local: Path | None) -> dict:
    if local and local.exists():
        raw = local.read_bytes()
        return json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)
    if state_url:
        try:
            r = requests.get(state_url, timeout=60)
            if r.status_code == 200:
                return json.loads(gzip.decompress(r.content))
            log.warning("Önceki durum alınamadı (%s) — ilk çalıştırma kabul ediliyor", r.status_code)
        except (requests.RequestException, OSError, ValueError) as e:
            log.warning("Önceki durum alınamadı: %s", e)
    return {"ilanlar": {}, "meta": {}}


# --- dönüştürme ----------------------------------------------------------------
def _d(s: str | None) -> date | None:
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def to_ilan(h: Ham, prev: dict | None, ts: str) -> dict:
    p = parse.ayristir(h.baslik, h.metin, h.kategori, _d(h.yayin))
    son = h.son_basvuru or p["sonBasvuru"]
    iller = [h.il] if h.il else iller_bul(f"{h.kurum} {h.baslik}", limit=3)
    kadro = h.adet or p["kadro"]
    it = {
        "id": h.id,
        "kaynak": h.kaynak,
        "baslik": h.baslik,
        "kurum": h.kurum,
        "tur": p["tur"],
        "iller": iller,
        "egitim": p["egitim"],
        "kpss": p["kpss"],
        "kpssGerekli": p["kpssGerekli"],
        "bolumSarti": p["bolumSarti"],
        "bolumler": [],
        "kadro": kadro,
        "unvanlar": p["unvanlar"] or ([h.extra["meslek"]] if h.extra.get("meslek") else []),
        "basvuruBaslangic": p["basvuruBaslangic"],
        "sonBasvuru": son,
        "yayin": h.yayin,
        "eklenme": (prev or {}).get("eklenme", ts),
        "url": h.url,
        "logo": h.logo,
        "ozet": parse.ozet(h.metin) if h.metin else "",
        "detay": bool(h.metin),
        "kaynaklar": [{"kaynak": h.kaynak, "url": h.url}],
    }
    # Önceki çalıştırmada LLM ile iyileştirilen alanları koru (metin değişmediyse)
    if prev and prev.get("_llm") and prev.get("_metinHash") == hash_text(h.metin):
        for k, v in prev["_llm"].items():
            it[k] = v
        it["_llm"] = prev["_llm"]
    it["_metinHash"] = hash_text(h.metin)
    return it


def hash_text(s: str) -> str:
    import hashlib
    return hashlib.sha1((s or "").encode()).hexdigest()[:12]


def dedupe(items: list[dict]) -> list[dict]:
    """Aynı ilan farklı kaynaklarda: kurum + son başvuru (+kadro) eşleşmesi."""
    pri = {"ilangov": 0, "kariyerkapisi": 1, "iskur": 2}
    groups: dict[tuple, dict] = {}
    out: list[dict] = []
    items = [{**x, "kaynaklar": list(x["kaynaklar"])[:1]} for x in items]
    for it in items:
        it.pop("ayni", None)
    for it in sorted(items, key=lambda x: (not x["detay"], pri[x["kaynak"]])):
        if it["kurum"] and it["sonBasvuru"]:
            key = (fold(it["kurum"])[:40], it["sonBasvuru"])
            if key in groups:
                g = groups[key]
                if g["kadro"] in (None, it["kadro"]) or it["kadro"] is None:
                    g["kaynaklar"].extend(it["kaynaklar"])
                    g.setdefault("ayni", []).append(it["id"])
                    for f in ("logo",):
                        g[f] = g[f] or it[f]
                    continue
            groups[key] = it
        out.append(it)
    return out


def keep(it: dict, today: date, present: bool) -> bool:
    son = _d(it.get("sonBasvuru"))
    if son:
        return son >= today - timedelta(days=30)
    eklenme = datetime.fromisoformat(it["eklenme"]).date()
    return present or eklenme >= today - timedelta(days=21)


PUBLIC_FIELDS = [
    "id", "kaynak", "baslik", "kurum", "tur", "iller", "egitim", "kpss", "kpssGerekli", "bolumSarti",
    "bolumler", "kadro", "unvanlar", "basvuruBaslangic", "sonBasvuru", "yayin", "eklenme", "url", "logo",
    "ozet", "detay", "kaynaklar",
]


# --- ana akış ------------------------------------------------------------------
def run(out_dir: Path, *, state_url: str | None = None, local_state: Path | None = None,
        only: list[str] | None = None, notify: bool = True, dry_run: bool = False,
        content_dir: Path | None = None) -> dict:
    t0 = time.time()
    ts = now_tr().isoformat(timespec="seconds")
    today = now_tr().date()
    state = load_state(state_url, local_state)
    prev: dict[str, dict] = state.get("ilanlar", {})
    prev_ham: dict[str, dict] = state.get("ham", {})
    first_run = not prev
    s = session()

    durum: dict[str, dict] = {}
    hamlar: dict[str, Ham] = {}
    fetched: set[str] = set()
    for name, mod in SOURCES.items():
        if only and name not in only:
            continue
        try:
            items = mod.fetch(s)
            durum[name] = {"ok": True, "adet": len(items), "zaman": ts}
            for h in items:
                hamlar[h.id] = h
                fetched.add(h.id)
        except (SourceError, requests.RequestException, ValueError, KeyError) as e:
            log.error("%s taranamadı: %s", mod.LABEL, e)
            durum[name] = {"ok": False, "hata": str(e)[:200], "zaman": ts}

    # Önceden zenginleştirilmiş metni geri yükle; yeni / eksikleri zenginleştir
    budget_end = time.time() + ENRICH_BUDGET_S
    enriched = 0
    for h in hamlar.values():
        old = prev_ham.get(h.id)
        if old and old.get("metin") and (h.kaynak != "kariyerkapisi" or len(old["metin"]) > 400):
            h.metin = old["metin"]
            h.son_basvuru = h.son_basvuru or old.get("son_basvuru")
            continue
        tries = (old or {}).get("extra", {}).get("tries", 0)
        if tries >= 4 or time.time() > budget_end:
            h.extra["tries"] = tries
            continue
        try:
            SOURCES[h.kaynak].enrich(s, h)
            enriched += 1
        except (requests.RequestException, ValueError, KeyError) as e:
            log.debug("zenginleştirme hatası %s: %s", h.id, e)
        h.extra["tries"] = tries + (0 if h.metin else 1)

    # Ayrıştır
    items: dict[str, dict] = {}
    for h in hamlar.values():
        items[h.id] = to_ilan(h, prev.get(h.id), ts)

    # LLM iyileştirme (isteğe bağlı)
    if llm.enabled():
        n = 0
        for it in items.values():
            if n >= LLM_PER_RUN:
                break
            h = hamlar[it["id"]]
            if not h.metin or it.get("_llm"):
                continue
            ref = llm.refine(s, h.baslik, h.metin)
            n += 1
            if ref:
                if h.son_basvuru:
                    ref.pop("sonBasvuru", None)  # kaynağın verdiği tarih önceliklidir
                it.update(ref)
                it["_llm"] = ref

    # Başarısız kaynakların önceki ilanlarını koru
    ok_sources = {k for k, v in durum.items() if v["ok"]}
    for pid, p in prev.items():
        if pid not in items and p["kaynak"] not in ok_sources and keep(p, today, True):
            items[pid] = p
            if pid in prev_ham:
                hamlar[pid] = Ham(**{k: v for k, v in prev_ham[pid].items()})

    # Eski ilanlar
    for pid, p in prev.items():
        if pid not in items and keep(p, today, False):
            items[pid] = p
            if pid in prev_ham:
                hamlar.setdefault(pid, Ham(**prev_ham[pid]))
    items = {k: v for k, v in items.items() if keep(v, today, k in fetched)}

    yayin = dedupe(list(items.values()))
    yayin.sort(key=lambda x: (x["eklenme"], x.get("yayin") or ""), reverse=True)

    # --- yaz ---
    data = out_dir / "data"
    if (data / "ilan").exists():
        shutil.rmtree(data / "ilan")
    (data / "ilan").mkdir(parents=True, exist_ok=True)
    public = [{k: it.get(k) for k in PUBLIC_FIELDS} for it in yayin]
    _write(data / "ilanlar.json", {"surum": SCHEMA_VERSION, "guncelleme": ts, "adet": len(public), "ilanlar": public})
    for it in yayin:
        h = hamlar.get(it["id"])
        if h and h.metin:
            _write(data / "ilan" / f"{it['id']}.json", {"id": it["id"], "metin": h.metin, "guncelleme": ts})
    _write(data / "kaynaklar.json", {"guncelleme": ts, "kaynaklar": durum, "zenginlestirilen": enriched,
                                       "sure_s": round(time.time() - t0, 1)})
    if content_dir:
        for f in content_dir.glob("*.json"):
            shutil.copy(f, data / f.name)

    new_ids = [it["id"] for it in yayin if it["id"] not in prev and not any(a in prev for a in it.get("ayni", []))]
    meta = dict(state.get("meta", {}))

    # --- bildirim ---
    sent = 0
    if notify and not first_run:
        nt = Notifier(dry_run=dry_run)
        if nt.active:
            for it in yayin:
                if it["id"] not in new_ids:
                    continue
                son = _d(it["sonBasvuru"])
                if son and son < today:
                    continue
                kadro = f"{it['kadro']} kadro · " if it["kadro"] else ""
                body = f"{kadro}{_son_txt(son)}" if son else (it["ozet"][:110] or it["kurum"])
                if nt.send(title=f"{it['kurum'] or 'Yeni ilan'}: {it['baslik']}"[:110], body=body,
                           data={"ilanId": it["id"], "tip": "ilan"}, condition=pro_condition(it["iller"])):
                    sent += 1
            h = now_tr()
            last_digest = meta.get("sonOzet")
            if h.hour >= FREE_DIGEST_HOUR and last_digest != h.date().isoformat():
                since = meta.get("sonOzetZaman") or (h - timedelta(days=1)).isoformat()
                gunluk = [it for it in yayin if it["eklenme"] > since]
                if gunluk:
                    kadro = sum(it["kadro"] or 0 for it in gunluk)
                    body = f"{len(gunluk)} yeni kamu ilanı" + (f", toplam {kadro:,} kadro".replace(",", ".") if kadro else "") + ". Hemen incele."
                    nt.send(title="Bugünün kamu ilanları", body=body, data={"tip": "ozet"}, topic="free")
                meta["sonOzet"] = h.date().isoformat()
                meta["sonOzetZaman"] = h.isoformat(timespec="seconds")

    # --- durum dosyası (sonraki çalıştırma için) ---
    new_state = {
        "surum": SCHEMA_VERSION, "guncelleme": ts, "meta": meta,
        "ilanlar": {it["id"]: it for it in items.values()},
        "ham": {k: v.to_dict() for k, v in hamlar.items() if k in items},
    }
    (data / "_state.json.gz").write_bytes(gzip.compress(json.dumps(new_state, ensure_ascii=False).encode()))
    if local_state:
        local_state.write_bytes(gzip.compress(json.dumps(new_state, ensure_ascii=False).encode()))

    summary = {"ilan": len(public), "yeni": len(new_ids), "bildirim": sent, "ilk": first_run,
               "kaynaklar": durum, "sure_s": round(time.time() - t0, 1)}
    log.info("Özet: %s", json.dumps(summary, ensure_ascii=False))
    return summary


def _son_txt(son: date) -> str:
    gun = (son - now_tr().date()).days
    if gun == 0:
        return "Son başvuru bugün"
    if gun == 1:
        return "Son başvuru yarın"
    return f"Son başvuru {son.strftime('%d.%m.%Y')} ({gun} gün)"


def _write(p: Path, obj) -> None:
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
