"""Türkçe metin yardımcıları: temizleme, katlama (aksan/büyük harf), il listesi."""
from __future__ import annotations

import html
import re
import unicodedata

_WS = re.compile(r"\s+")

_FOLD_MAP = str.maketrans({
    "İ": "i", "I": "i", "ı": "i", "Ş": "s", "ş": "s", "Ğ": "g", "ğ": "g",
    "Ü": "u", "ü": "u", "Ö": "o", "ö": "o", "Ç": "c", "ç": "c", "Â": "a", "â": "a",
    "Î": "i", "î": "i", "Û": "u", "û": "u",
})


def clean(s: str | None) -> str:
    if not s:
        return ""
    s = html.unescape(s).replace("\xa0", " ").replace("​", "")
    return _WS.sub(" ", s).strip()


def fold(s: str | None) -> str:
    """Karşılaştırma için: küçük harf, Türkçe karakterler ASCII, tek boşluk."""
    if not s:
        return ""
    s = s.translate(_FOLD_MAP)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return _WS.sub(" ", s.lower()).strip()


def tr_title(s: str) -> str:
    """BÜYÜK HARFLİ kurum adlarını okunur hale getirir (Türkçe i/İ kurallarıyla)."""
    if not s or not s.isupper():
        return s
    small = {"ve", "ile", "de", "da", "ki", "veya"}
    out = []
    for i, w in enumerate(s.split(" ")):
        lw = w.replace("I", "ı").replace("İ", "i").lower()
        if i and lw in small:
            out.append(lw)
        elif lw:
            first = lw[0]
            first = "İ" if first == "i" else ("I" if first == "ı" else first.upper())
            out.append(first + lw[1:])
        else:
            out.append(lw)
    return " ".join(out)


# Plaka kodu -> il adı
ILLER: dict[str, str] = {
    "01": "Adana", "02": "Adıyaman", "03": "Afyonkarahisar", "04": "Ağrı", "05": "Amasya",
    "06": "Ankara", "07": "Antalya", "08": "Artvin", "09": "Aydın", "10": "Balıkesir",
    "11": "Bilecik", "12": "Bingöl", "13": "Bitlis", "14": "Bolu", "15": "Burdur",
    "16": "Bursa", "17": "Çanakkale", "18": "Çankırı", "19": "Çorum", "20": "Denizli",
    "21": "Diyarbakır", "22": "Edirne", "23": "Elazığ", "24": "Erzincan", "25": "Erzurum",
    "26": "Eskişehir", "27": "Gaziantep", "28": "Giresun", "29": "Gümüşhane", "30": "Hakkari",
    "31": "Hatay", "32": "Isparta", "33": "Mersin", "34": "İstanbul", "35": "İzmir",
    "36": "Kars", "37": "Kastamonu", "38": "Kayseri", "39": "Kırklareli", "40": "Kırşehir",
    "41": "Kocaeli", "42": "Konya", "43": "Kütahya", "44": "Malatya", "45": "Manisa",
    "46": "Kahramanmaraş", "47": "Mardin", "48": "Muğla", "49": "Muş", "50": "Nevşehir",
    "51": "Niğde", "52": "Ordu", "53": "Rize", "54": "Sakarya", "55": "Samsun",
    "56": "Siirt", "57": "Sinop", "58": "Sivas", "59": "Tekirdağ", "60": "Tokat",
    "61": "Trabzon", "62": "Tunceli", "63": "Şanlıurfa", "64": "Uşak", "65": "Van",
    "66": "Yozgat", "67": "Zonguldak", "68": "Aksaray", "69": "Bayburt", "70": "Karaman",
    "71": "Kırıkkale", "72": "Batman", "73": "Şırnak", "74": "Bartın", "75": "Ardahan",
    "76": "Iğdır", "77": "Yalova", "78": "Karabük", "79": "Kilis", "80": "Osmaniye",
    "81": "Düzce",
}

_IL_FOLD = {fold(v): k for k, v in ILLER.items()}
_IL_FOLD.update({"afyon": "03", "maras": "46", "urfa": "63", "antep": "27", "icel": "33"})
_IL_RE = re.compile(r"\b(" + "|".join(sorted(map(re.escape, _IL_FOLD), key=len, reverse=True)) + r")\b")


def il_kodu(name: str | None) -> str | None:
    return _IL_FOLD.get(fold(name)) if name else None


def iller_bul(text: str, limit: int = 6) -> list[str]:
    """Metinde geçen illerin plaka kodları (geçiş sırasına göre, en fazla `limit`)."""
    seen: list[str] = []
    for m in _IL_RE.finditer(fold(text)):
        k = _IL_FOLD[m.group(1)]
        if k not in seen:
            seen.append(k)
        if len(seen) >= limit:
            break
    return seen
