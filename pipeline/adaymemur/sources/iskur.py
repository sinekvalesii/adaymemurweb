"""İŞKUR e-Şube — kamu işyerlerinin açık iş ilanları (işçi alımları)."""
from __future__ import annotations

import re

import requests
from bs4 import BeautifulSoup

from ..models import Ham, SourceError
from ..text import clean, il_kodu, tr_title

LABEL = "İŞKUR"
SEARCH = "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx"
DETAIL = "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID={}"
MAX_PAGES = 60


def _form(soup: BeautifulSoup) -> dict:
    form = {i["name"]: i.get("value", "") for i in soup.find_all("input", type="hidden") if i.get("name")}
    for sel in soup.find_all("select"):
        o = sel.find("option", selected=True) or sel.find("option")
        if sel.get("name"):
            form[sel["name"]] = o.get("value", "") if o else ""
    form["ctl04$IsyeriTuruRadios"] = "kamuRadio"
    form["__EVENTARGUMENT"] = ""
    return form


def _tr_date(v: str | None) -> str | None:
    m = re.match(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", v or "")
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None


def parse_page(html: str) -> list[Ham]:
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.select("a[data-ilanno]"):
        no = a["data-ilanno"]
        tr = a.find_parent("tr")
        org = tr.find("span", id=re.compile("Isveren")) if tr else None
        meslek = clean(a.get("data-meslekler"))
        adet = a.get("data-acikissayi")
        out.append(Ham(
            kaynak="iskur", kid=no,
            baslik=f"{meslek} alımı" if meslek else "Kamu işyeri iş ilanı",
            url=DETAIL.format(no),
            kurum=tr_title(clean(org.get_text())) if org else "",
            kategori="İşçi",
            il=il_kodu(clean(a.get("data-il"))),
            son_basvuru=_tr_date(a.get("data-sontarih")),
            adet=int(adet) if adet and adet.isdigit() else None,
            extra={"meslek": meslek},
        ))
    return out


def fetch(s: requests.Session) -> list[Ham]:
    r = s.get(SEARCH, timeout=90)
    r.raise_for_status()
    form = _form(BeautifulSoup(r.text, "html.parser"))
    form["__EVENTTARGET"] = "ctl04$ctlAcikIsPageCommand$CommandItem_Search"
    form["ctl04$ctlIlanTarihi"] = "1"
    rows: dict[str, Ham] = {}
    for _ in range(MAX_PAGES):
        r = s.post(SEARCH, data=form, timeout=120)
        r.raise_for_status()
        if "data-ilanno" not in r.text:
            if "bulunamad" in r.text or rows:
                break
            raise SourceError("e-Şube sonucu beklenen biçimde değil")
        before = len(rows)
        for h in parse_page(r.text):
            rows.setdefault(h.kid, h)
        soup = BeautifulSoup(r.text, "html.parser")
        nxt = soup.find("a", id=re.compile("btnNext"))
        if len(rows) == before or not nxt or "disabled" in (nxt.get("class") or []):
            break
        form = _form(soup)
        form["__EVENTTARGET"] = nxt.get("id", "").replace("_", "$")
    return list(rows.values())


def enrich(s: requests.Session, h: Ham) -> None:
    r = s.get(h.url, timeout=90)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    for t in soup(["script", "style", "nav", "header", "footer"]):
        t.decompose()
    text = clean(soup.get_text(" "))
    m = re.search(r"(İlan No.*?)(?:İlan Geri Bildirim|×|$)", text)
    text = m.group(1) if m else text
    if len(text) > 80:
        h.metin = text[:6000]
