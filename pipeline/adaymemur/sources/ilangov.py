"""Basın İlan Kurumu — ilan.gov.tr "Personel Alımı" ilanları (açık API)."""
from __future__ import annotations

import requests
from bs4 import BeautifulSoup

from ..models import Ham, SourceError
from ..text import clean, il_kodu, tr_title

LABEL = "ilan.gov.tr"
BASE = "https://www.ilan.gov.tr"
LIST = f"{BASE}/api/api/services/app/Ad/AdsByFilter"
DETAIL = f"{BASE}/api/api/services/app/AdDetail/GetAdDetail"
HEADERS = {
    "X-Request-Origin": "IGT-UI",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "text/plain",
    "Content-Type": "application/json-patch+json",
}
PERSONEL_ALIMI = 5
PAGE = 20
MAX = 600


def _date(v) -> str | None:
    return v[:10] if isinstance(v, str) and len(v) >= 10 and v[4] == "-" else None


def fetch(s: requests.Session) -> list[Ham]:
    out: list[Ham] = []
    skip, total = 0, None
    while total is None or skip < min(total, MAX):
        r = s.post(LIST, headers=HEADERS, timeout=90, json={
            "keys": {"ats": [PERSONEL_ALIMI]}, "skipCount": skip, "maxResultCount": PAGE,
        })
        r.raise_for_status()
        res = r.json()["result"]
        total = res.get("numFound", 0)
        ads = res.get("ads") or []
        if not ads:
            break
        for a in ads:
            out.append(Ham(
                kaynak="ilangov", kid=str(a["id"]),
                baslik=clean(a.get("title")),
                url=BASE + (a.get("urlStr") or f"/ilan/{a['id']}"),
                kurum=tr_title(clean(a.get("advertiserName"))),
                kategori="Personel Alımı",
                yayin=_date(a.get("publishStartDate")),
                il=il_kodu(a.get("addressCityName")),
                logo=a.get("advertiserLogo") or None,
            ))
        skip += len(ads)
    if not out:
        raise SourceError("Personel alımı ilanı listesi boş geldi")
    return out


def enrich(s: requests.Session, h: Ham) -> None:
    r = s.get(DETAIL, params={"id": h.kid}, headers=HEADERS, timeout=90)
    r.raise_for_status()
    res = r.json().get("result") or {}
    content = res.get("content") or ""
    text = clean(BeautifulSoup(content, "html.parser").get_text(" "))
    if len(text) > 80:
        h.metin = text
    for f in res.get("adTypeFilters") or res.get("filters") or []:
        if isinstance(f, dict) and "basvuru" in str(f.get("key", "")).lower():
            d = _date(f.get("value"))
            if d:
                h.son_basvuru = d
