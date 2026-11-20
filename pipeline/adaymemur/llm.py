"""İsteğe bağlı: Gemini (ücretsiz katman) ile ayrıştırmayı iyileştirme.

GEMINI_API_KEY tanımlı değilse hiçbir şey yapmaz. Kural tabanlı ayrıştırıcının
eksik bıraktığı alanları doldurur; çıktı şemaya zorlanır ve doğrulanır.
"""
from __future__ import annotations

import json
import os
import re

import requests

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "kpss": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "tur": {"type": "STRING", "description": "KPSS puan türü, ör. P3, P93, P94, P48"},
            "min": {"type": "INTEGER", "nullable": True}}, "required": ["tur"]}},
        "kpssGerekli": {"type": "BOOLEAN", "nullable": True},
        "egitim": {"type": "ARRAY", "items": {"type": "STRING", "enum": [
            "ilkogretim", "ortaogretim", "onlisans", "lisans", "yukseklisans", "doktora"]}},
        "bolumSarti": {"type": "STRING", "enum": ["yok", "var", "bilinmiyor"]},
        "bolumler": {"type": "ARRAY", "items": {"type": "STRING"}},
        "kadro": {"type": "INTEGER", "nullable": True},
        "unvanlar": {"type": "ARRAY", "items": {"type": "STRING"}},
        "basvuruBaslangic": {"type": "STRING", "nullable": True, "description": "YYYY-MM-DD"},
        "sonBasvuru": {"type": "STRING", "nullable": True, "description": "YYYY-MM-DD"},
    },
}

PROMPT = """Aşağıdaki Türk kamu personel alım ilanından alanları çıkar.
Yalnızca metinde açıkça yazanı kullan; emin değilsen boş bırak veya null ver.
Tarihleri YYYY-MM-DD biçiminde ver. sonBasvuru: başvuruların son günü.
bolumSarti: herhangi bir bölüm kabul ediliyorsa "yok", belirli bölümler isteniyorsa "var".
bolumler: istenen bölüm adları (en fazla 25, kısa haliyle).

İLAN BAŞLIĞI: {baslik}
İLAN METNİ:
{metin}"""

_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def enabled() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def refine(s: requests.Session, baslik: str, metin: str) -> dict | None:
    key = os.environ.get("GEMINI_API_KEY")
    if not key or len(metin) < 200:
        return None
    body = {
        "contents": [{"role": "user", "parts": [{"text": PROMPT.format(baslik=baslik, metin=metin[:14000])}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": SCHEMA},
    }
    try:
        r = s.post(URL.format(MODEL), params={"key": key}, json=body, timeout=60)
        r.raise_for_status()
        txt = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(txt)
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return None
    out: dict = {}
    if isinstance(data.get("kpss"), list):
        out["kpss"] = [
            {"tur": k["tur"].upper().replace("KPSS", "").replace(" ", "").replace("-", ""),
             **({"min": int(k["min"])} if isinstance(k.get("min"), int) and 40 <= k["min"] <= 100 else {})}
            for k in data["kpss"] if isinstance(k, dict) and re.match(r"^(KPSS)?\s*-?P\d{1,3}$", str(k.get("tur", "")).upper())
        ]
    for f in ("kpssGerekli", "bolumSarti", "egitim", "unvanlar", "bolumler"):
        if f in data and data[f] not in (None, []):
            out[f] = data[f]
    if isinstance(data.get("kadro"), int) and 0 < data["kadro"] < 100000:
        out["kadro"] = data["kadro"]
    for f in ("basvuruBaslangic", "sonBasvuru"):
        if isinstance(data.get(f), str) and _ISO.match(data[f]):
            out[f] = data[f]
    return out
