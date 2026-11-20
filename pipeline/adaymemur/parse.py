"""İlan metninden yapılandırılmış alanlar çıkaran kural tabanlı ayrıştırıcı.

Çıkarılan alanlar: tür, KPSS puan türleri ve taban puanlar, öğrenim düzeyleri,
bölüm şartı, kadro sayısı, unvanlar, başvuru başlangıç/son tarihleri.
Aynı mantığın TypeScript karşılığı: app/src/lib/parse.ts (cihazda zenginleştirme).
"""
from __future__ import annotations

import re
from datetime import date

from .text import fold

AYLAR = {
    "ocak": 1, "subat": 2, "mart": 3, "nisan": 4, "mayis": 5, "haziran": 6,
    "temmuz": 7, "agustos": 8, "eylul": 9, "ekim": 10, "kasim": 11, "aralik": 12,
}
_AY = "|".join(AYLAR)

# 15.12.2025 / 15/12/2025 / 15-12-2025
_D_NUM = r"(\d{1,2})\s?[./-]\s?(\d{1,2})\s?[./-]\s?(\d{4})"
# 15 aralik 2025
_D_TXT = rf"(\d{{1,2}})\s+({_AY})\s+(\d{{4}})"

_RANGE_PATTERNS = [
    # 15.12.2025 - 26.12.2025
    re.compile(rf"{_D_NUM}\s*(?:-|–|ile|ila|ve)\s*{_D_NUM}"),
    # 15 aralik 2025 - 26 aralik 2025
    re.compile(rf"{_D_TXT}\s*(?:-|–|ile|ila|ve)\s*{_D_TXT}"),
    # 15 - 26 aralik 2025
    re.compile(rf"(\d{{1,2}})\s*(?:-|–)\s*(\d{{1,2}})\s+({_AY})\s+(\d{{4}})"),
    # 15 kasim - 2 aralik 2025
    re.compile(rf"(\d{{1,2}})\s+({_AY})\s*(?:-|–)\s*(\d{{1,2}})\s+({_AY})\s+(\d{{4}})"),
    # 15/12/2025 - 26/12/2025 already covered; 15.12-26.12.2025
    re.compile(r"(\d{1,2})[./](\d{1,2})\s*(?:-|–)\s*(\d{1,2})[./](\d{1,2})[./](\d{4})"),
]
_SINGLE = [re.compile(_D_NUM), re.compile(_D_TXT)]

_BASVURU_KW = re.compile(r"basvuru|basvurular|son gun|tarihleri arasinda|saat 23")


def _mk(d, m, y) -> date | None:
    try:
        d, m, y = int(d), int(m), int(y)
        if not (2020 <= y <= 2100):
            return None
        return date(y, m, d)
    except (ValueError, TypeError):
        return None


def _range_from(m: re.Match, idx: int) -> tuple[date | None, date | None]:
    g = m.groups()
    if idx == 0:
        return _mk(g[0], g[1], g[2]), _mk(g[3], g[4], g[5])
    if idx == 1:
        return _mk(g[0], AYLAR[g[1]], g[2]), _mk(g[3], AYLAR[g[4]], g[5])
    if idx == 2:
        ay = AYLAR[g[2]]
        return _mk(g[0], ay, g[3]), _mk(g[1], ay, g[3])
    if idx == 3:
        return _mk(g[0], AYLAR[g[1]], g[4]), _mk(g[2], AYLAR[g[3]], g[4])
    if idx == 4:
        return _mk(g[0], g[1], g[4]), _mk(g[2], g[3], g[4])
    return None, None


def tarihler(text: str, yayin: date | None = None) -> tuple[str | None, str | None]:
    """(basvuru_baslangic, son_basvuru) ISO tarihleri. Bulunamazsa (None, None)."""
    t = fold(text)
    ref = yayin or date.today()
    adaylar: list[tuple[int, date | None, date]] = []  # (skor, baslangic, son)

    def skor(pos: int, end: int) -> int:
        once = t[max(0, pos - 160):pos]
        sonra = t[end:end + 80]
        s = 0
        if _BASVURU_KW.search(once):
            s += 3
        if re.search(r"tarihleri arasinda|arasinda|kadar|son gun", sonra):
            s += 2
        if re.search(r"sinav|mulakat|sozlu|yazili|sonuc|ilan edil|yayim", once[-60:]):
            s -= 2
        return s

    for i, rx in enumerate(_RANGE_PATTERNS):
        for m in rx.finditer(t):
            b, e = _range_from(m, i)
            if e and (not b or b <= e) and (e - ref).days > -400 and (e - ref).days < 400:
                adaylar.append((skor(m.start(), m.end()) + 1, b, e))

    if not adaylar:
        for rx in _SINGLE:
            for m in rx.finditer(t):
                g = m.groups()
                d = _mk(g[0], AYLAR.get(g[1], g[1]) if not g[1].isdigit() else g[1], g[2])
                if not d:
                    continue
                s = skor(m.start(), m.end())
                if s >= 3 and abs((d - ref).days) < 400:
                    adaylar.append((s, None, d))

    if not adaylar:
        return None, None
    adaylar.sort(key=lambda x: (-x[0], x[2]))
    _, b, e = adaylar[0]
    if yayin and e < yayin:
        return None, None
    return (b.isoformat() if b else None), e.isoformat()


# --- KPSS --------------------------------------------------------------------
_KPSS_TUR = re.compile(r"\bkpss\s*[-_]?\s*p\s*[-_]?\s*(\d{1,3})\b|\b(?:puan turu|puan turleri)\s*:?\s*(?:kpss)?\s*p\s?(\d{1,3})\b")
_PURE_P = re.compile(r"\bp\s?(3|93|94|\d{1,2})\b")
_MIN_PUAN = [
    re.compile(r"(\d{2,3})(?:[.,]\d+)?\s*(?:\(\w+\)\s*)?(?:ve|veya)\s*(?:daha\s*)?(?:uzeri|ustu|yuksek)"),
    re.compile(r"en\s*az\s*(\d{2,3})(?:[.,]\d+)?\s*(?:\(\w+\)\s*)?puan"),
    re.compile(r"(\d{2,3})(?:[.,]\d+)?\s*puan(?:in| ve)?\s*(?:ve\s*)?uzeri"),
    re.compile(r"(?:taban|asgari|minimum)\s*(?:kpss\s*)?puan[a-z]*\s*:?\s*(\d{2,3})"),
]


def kpss(text: str) -> tuple[list[dict], bool | None]:
    """[{'tur': 'P3', 'min': 70}], kpss_gerekli"""
    t = fold(text)
    turler: list[str] = []
    for m in _KPSS_TUR.finditer(t):
        n = m.group(1) or m.group(2)
        if n and 1 <= int(n) <= 125 and f"P{int(n)}" not in turler:
            turler.append(f"P{int(n)}")
    if not turler and "kpss" in t:
        for m in _PURE_P.finditer(t):
            # sadece "puan" kelimesinin yakınındaki P kodları
            if "puan" in t[max(0, m.start() - 60):m.end() + 30]:
                k = f"P{int(m.group(1))}"
                if k not in turler:
                    turler.append(k)

    minler: list[int] = []
    for rx in _MIN_PUAN:
        for m in rx.finditer(t):
            ctx = t[max(0, m.start() - 120):m.end() + 40]
            if "kpss" in ctx or "puan" in ctx:
                v = int(m.group(1))
                if 40 <= v <= 100:
                    minler.append(v)
    taban = min(minler) if minler else None

    if re.search(r"kpss\s*(?:puan[a-z]*\s*)?(?:sarti\s*)?(?:aranmaz|aranmayacak|sarti yoktur|sarti bulunmamaktadir)", t):
        gerekli: bool | None = False
    elif turler or re.search(r"kpss\s*\(?b\)?\s*grubu|kpss puan", t):
        gerekli = True
    else:
        gerekli = None

    out = [{"tur": k, **({"min": taban} if taban is not None else {})} for k in turler]
    return out, gerekli


# --- Öğrenim -------------------------------------------------------------------
EGITIM_SIRA = ["ilkogretim", "ortaogretim", "onlisans", "lisans", "yukseklisans", "doktora"]

_P_EGITIM = {3: "lisans", 93: "onlisans", 94: "ortaogretim"}


def egitim(text: str, kpss_turler: list[dict] | None = None) -> list[str]:
    t = fold(text)
    found: set[str] = set()
    if re.search(r"\b(ortaogretim|lise|meslek lisesi|lise ve dengi)\b", t):
        found.add("ortaogretim")
    if re.search(r"\bon\s?lisans\b|\bonlisans\b|meslek yuksekokulu", t):
        found.add("onlisans")
    # "lisans" (ön lisans / yüksek lisans hariç)
    for m in re.finditer(r"\blisans\b", t):
        once = t[max(0, m.start() - 8):m.start()]
        if not re.search(r"(on\s?|yuksek\s?)$", once):
            found.add("lisans")
            break
    if re.search(r"yuksek\s?lisans|master", t):
        found.add("yukseklisans")
    if re.search(r"\bdoktora\b|doktor ogretim uyesi", t):
        found.add("doktora")
    if re.search(r"\bilkogretim\b|\bilkokul\b|\bortaokul\b", t):
        found.add("ilkogretim")
    for k in kpss_turler or []:
        n = int(k["tur"][1:])
        if n in _P_EGITIM:
            found.add(_P_EGITIM[n])
        elif 1 <= n <= 48 or 100 <= n <= 125:
            found.add("lisans")
    return [e for e in EGITIM_SIRA if e in found]


def bolum_sarti(text: str) -> str:
    """'yok' (tüm bölümler), 'var', 'bilinmiyor'"""
    t = fold(text)
    if re.search(
        r"herhangi bir (?:lisans|on\s?lisans|onlisans|yuksekogretim|ortaogretim|lise)?\s*(?:programindan|bolumunden|bolumden)"
        r"|tum bolumler|tum lisans|her bolum|bolum (?:sarti|sinirlamasi) (?:aranmaz|yoktur|bulunmamaktadir)"
        r"|bolum ayrimi (?:yapilmaksizin|yoktur)",
        t,
    ):
        return "yok"
    if re.search(r"bolum(?:u|unden|lerinden|lerin|leri)\b|muhendisligi|fakultesi|programlarindan", t):
        return "var"
    return "bilinmiyor"


# --- Tür / unvan / kadro --------------------------------------------------------
def tur(text: str, kategori: str = "") -> str:
    k = fold(kategori)
    t = fold(text)
    if "akademik" in k or re.search(r"ogretim (?:uyesi|gorevlisi)|arastirma gorevlisi|doktor ogretim", t[:400]):
        return "akademik"
    if "isci" in k or re.search(r"\bisci\b|surekli isci|gecici isci", t[:400]):
        return "isci"
    if "askeri" in k or re.search(r"\b(?:subay|astsubay|uzman erbas|sozlesmeli er|polis|bekci|jandarma|sahil guvenlik)\b", t[:300]):
        return "kolluk"
    if "sozlesmeli" in k or "sozlesmeli" in t[:400]:
        return "sozlesmeli"
    if "memur" in k or "kpss" in k or re.search(r"\bmemur\b|kadrolu|uzman yardimcisi|denetci yardimcisi|mufettis yardimcisi", t[:500]):
        return "memur"
    if "hakim" in k or "savci" in k:
        return "memur"
    return "diger"


UNVANLAR = [
    "Büro Personeli", "Koruma ve Güvenlik Görevlisi", "Destek Personeli", "Temizlik Personeli",
    "Hemşire", "Ebe", "Sağlık Teknikeri", "Sağlık Teknisyeni", "Tıbbi Sekreter", "Psikolog",
    "Sosyal Çalışmacı", "Çocuk Gelişimci", "Diyetisyen", "Fizyoterapist", "Biyolog", "Kimyager",
    "Mühendis", "Mimar", "Tekniker", "Teknisyen", "Avukat", "Programcı", "Çözümleyici",
    "Bilişim Personeli", "Yazılım Geliştirici", "Uzman Yardımcısı", "Müfettiş Yardımcısı",
    "Denetçi Yardımcısı", "Veri Hazırlama ve Kontrol İşletmeni", "Memur", "Şoför", "Sürekli İşçi",
    "Öğretim Üyesi", "Öğretim Görevlisi", "Araştırma Görevlisi", "Aşçı", "Bekçi", "İtfaiye Eri",
    "Zabıta Memuru", "Kütüphaneci", "Mütercim", "Tercüman", "Veteriner Hekim", "Ziraat Mühendisi",
    "Orman Muhafaza Memuru", "Ambar Memuru", "Teknik Ressam", "Laborant", "Eczacı", "Uzman",
    "Zabıt Katibi", "Mübaşir", "İcra Katibi", "İnfaz ve Koruma Memuru", "Öğretmen", "Polis Memuru",
    "Gassal", "Usta Öğretici", "Hizmetli", "Kaloriferci", "Elektrik Teknisyeni", "Bilgisayar İşletmeni",
    "Sosyal Hizmet Uzmanı", "Rehber Öğretmen", "Sözleşmeli Er", "Uzman Erbaş", "Astsubay", "Subay",
]
_UNVAN_FOLD = [(fold(u), u) for u in UNVANLAR]


def unvanlar(text: str, limit: int = 6) -> list[str]:
    t = fold(text)
    hits: list[tuple[int, str]] = []
    covered: list[str] = []
    for f, u in sorted(_UNVAN_FOLD, key=lambda x: -len(x[0])):
        m = re.search(rf"\b{re.escape(f)}\b(?!lari kanun| kanun)", t)
        i = m.start() if m else -1
        if i >= 0 and not any(f in c for c in covered):
            hits.append((i, u))
            covered.append(f)
    hits.sort()
    return [u for _, u in hits[:limit]]


_KADRO = [
    re.compile(r"toplam\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*\(?[a-z ]{0,20}\)?\s*(?:adet\s*)?(?:sozlesmeli |surekli |kadrolu |gecici |daimi )?(?:personel|isci|memur|kadro|pozisyon|ogretim|uzman|aday)"),
    re.compile(r"(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:adet\s*|kisi\s*|\(.{1,12}\)\s*)?(?:sozlesmeli |surekli |kadrolu |gecici |daimi )?[a-z ]{0,40}?(?:personel|isci|memur)\s*(?:alacak|alinacak|alimi|istihdam)"),
    re.compile(r"toplam\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:adet\s*|kisi\s*)?[a-z ]{0,40}?(?:alinacak|alimi yapilacak|istihdam edilecek)"),
]


def kadro(text: str) -> int | None:
    t = fold(text)
    for rx in _KADRO:
        m = rx.search(t)
        if m:
            try:
                n = int(m.group(1).replace(".", ""))
            except ValueError:
                continue
            if 0 < n < 100000:
                return n
    return None


def ozet(text: str, n: int = 320) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0]
    return cut.rstrip(",;:-") + "…"


def ayristir(baslik: str, metin: str, kategori: str = "", yayin: date | None = None) -> dict:
    """Tüm alanları tek seferde çıkarır."""
    tam = f"{baslik}\n{metin}"
    k, gerekli = kpss(tam)
    bas, son = tarihler(metin or baslik, yayin)
    return {
        "tur": tur(tam, kategori),
        "kpss": k,
        "kpssGerekli": gerekli,
        "egitim": egitim(tam, k),
        "bolumSarti": bolum_sarti(metin) if metin else "bilinmiyor",
        "kadro": kadro(tam),
        "unvanlar": unvanlar(tam),
        "basvuruBaslangic": bas,
        "sonBasvuru": son,
    }
