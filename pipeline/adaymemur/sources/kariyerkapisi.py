"""Cumhurbaşkanlığı Kariyer Kapısı — resmî RSS beslemesi.

Detay servisi (api.kariyerkapisi.gov.tr) yalnızca Türkiye IP'lerine açık.
Erişilemezse ilan metni boş kalır; uygulama detayı kullanıcının cihazından çeker.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import requests

from ..models import Ham, SourceError
from ..text import clean, tr_title

LABEL = "Kariyer Kapısı"
FEEDS = ["https://kariyerkapisi.gov.tr/RSS", "https://kariyerkapisi.gov.tr/XMLs/ilanlar.xml"]
API = "https://api.kariyerkapisi.gov.tr/api"
_GUID = re.compile(r"[?&/]i=([0-9a-fA-F-]{36})|([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})")


def parse_feed(content: bytes) -> list[Ham]:
    root = ET.fromstring(content)
    out = []
    for it in root.iter("item"):
        link = clean(it.findtext("link") or it.findtext("guid"))
        m = _GUID.search(link) or _GUID.search(clean(it.findtext("guid")))
        if not m:
            continue
        guid = (m.group(1) or m.group(2)).lower()
        title = clean(it.findtext("title"))
        try:
            yayin = parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
        except (TypeError, ValueError):
            yayin = None
        enc = it.find("enclosure")
        logo = enc.get("url") if enc is not None else None
        if not logo:
            im = re.search(r'<img[^>]+src="([^"]+)"', it.findtext("description") or "")
            logo = im.group(1) if im else None
        kurum, baslik = (title.split(" - ", 1) + [""])[:2] if " - " in title else ("", title)
        aciklama = clean(re.sub(r"<[^>]+>", " ", it.findtext("description") or ""))
        out.append(Ham(
            kaynak="kariyerkapisi", kid=guid, baslik=baslik or title, kurum=tr_title(kurum),
            url=link or f"https://kariyerkapisi.gov.tr/isealim/ilan?i={guid}",
            kategori=clean(it.findtext("category")), yayin=yayin, logo=logo,
            # Kısa RSS açıklaması tam metin sayılmaz: uygulama tam metni cihazdan çeker
            metin=aciklama if len(aciklama) > 400 else "",
        ))
    return out


def fetch(s: requests.Session) -> list[Ham]:
    last: Exception | None = None
    for url in FEEDS:
        try:
            r = s.get(url, timeout=120)
            r.raise_for_status()
            items = parse_feed(r.content)
            if items:
                return items
        except (requests.RequestException, ET.ParseError) as e:
            last = e
    raise SourceError(f"RSS okunamadı: {last}")


class _Enricher:
    """Detay servisine ilk denemede ulaşılamazsa kalan ilanlar için denemeyi bırakır."""

    def __init__(self) -> None:
        self.blocked = False

    def __call__(self, s: requests.Session, h: Ham) -> None:
        if self.blocked:
            return
        body = {"ilanGuid": h.kid}
        try:
            r = s.post(f"{API}/ilan/GetIlanPreviewPublic", json=body, timeout=(6, 40))
            r.raise_for_status()
            data = r.json() or {}
            parts = [data.get("ilanMetni") or ""]
            alt = s.post(f"{API}/altilan/GetAltIlanInfoByIlanIdPublic", json=body, timeout=(6, 40)).json() or []
            parts += [f"{a.get('ilanBaslik', '')} {a.get('ilanMetni', '')}" for a in alt if isinstance(a, dict)]
        except (requests.ConnectionError, requests.Timeout):
            self.blocked = True
            return
        except (requests.RequestException, ValueError):
            return
        text = clean(re.sub(r"<[^>]+>|\[/?[a-z0-9=#]+\]", " ", " ".join(parts)))
        if len(text) > 120:
            h.metin = text
        for k in ("basvuruBitisTarihi", "bitisTarihi", "sonBasvuruTarihi"):
            v = data.get(k)
            if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v):
                h.son_basvuru = v[:10]
                break


enrich = _Enricher()
