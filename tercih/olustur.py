"""KPSS merkezi yerleştirme taban/tavan puanlarını ÖSYM PDF'lerinden çıkarır -> tercih.json
Kaynak: ÖSYM 'Yerleştirme Sonuçlarına İlişkin En Küçük ve En Büyük Puanlar' tabloları."""
import io, json, re, sys, urllib.request
import pdfplumber

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}
DUZEY = {"ort": ("ortaogretim", "P94"), "onl": ("onlisans", "P93"), "lis": ("lisans", "P3")}
# Dönem -> sayısal bilgiler sayfası (PDF bağlantıları buradan bulunur)
DONEMLER = {
    "2025/2": "https://osym.gov.tr/kpss20252-bazi-kamu-kurum-ve-kuruluslarin-kadro-ve-pozisyonlarina-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler",
    "2026/1": "ARA:kpss-20261",
    "2026/2": "ARA:kpss-20262",
}

def al(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read()

def baglantilar(html):
    return [l.replace("&amp;", "&") for l in re.findall(r'href="([^"]+)"', html)]

def pdfleri_bul(kaynak):
    if kaynak.startswith("ARA:"):
        anahtar = kaynak[4:]
        sayfalar = []
        for idx in ["https://osym.gov.tr/Duyurular/Index", "https://osym.gov.tr/Duyurular/Index?yil=2026", "https://www.osym.gov.tr/TR,6/duyurular.html"]:
            try:
                h = al(idx).decode("utf-8", "ignore")
                sayfalar += [l for l in baglantilar(h) if anahtar in l.lower() and ("sonuc" in l.lower() or "sayisal" in l.lower())]
            except Exception as e:
                print("dizin hatası", idx, e, file=sys.stderr)
        pdfler = []
        for s in dict.fromkeys(sayfalar):
            u = s if s.startswith("http") else "https://osym.gov.tr" + s
            try:
                h = al(u).decode("utf-8", "ignore")
                for l in baglantilar(h):
                    if l.lower().endswith(".pdf"):
                        pdfler.append(l)
                        if "sayisal" in l.lower() and "kpss" in l.lower():
                            pass
                # sayısal bilgiler alt sayfası
                for l in baglantilar(h):
                    if "sayisal-bilgiler" in l and anahtar.replace("-", "") in l.replace("-", ""):
                        h2 = al(l if l.startswith("http") else "https://osym.gov.tr" + l).decode("utf-8", "ignore")
                        pdfler += [x for x in baglantilar(h2) if x.lower().endswith(".pdf")]
            except Exception as e:
                print("sayfa hatası", u, e, file=sys.stderr)
        return list(dict.fromkeys(pdfler))
    h = al(kaynak).decode("utf-8", "ignore")
    return [l for l in baglantilar(h) if l.lower().endswith(".pdf")]

def duzey_bul(url, ilk_metin):
    f = url.lower().rsplit("/", 1)[-1]
    if "ort" in f: return "ort"
    if "onl" in f or "on-l" in f: return "onl"
    if "lis" in f or "lsans" in f: return "lis"
    t = ilk_metin.replace("İ", "I").upper()
    if "ORTA" in t: return "ort"
    if "ÖN LISANS" in t or "ON LISANS" in t: return "onl"
    if "LISANS" in t: return "lis"
    return None

def sayi(s):
    try: return float(str(s).replace(".", "").replace(",", "."))
    except: return None

def isle(url, donem):
    b = al(url)
    if b[:4] != b"%PDF": return []
    satirlar = []
    with pdfplumber.open(io.BytesIO(b)) as pdf:
        ilk = pdf.pages[0].extract_text() or ""
        if "En Küçük" not in ilk and "EN KÜÇÜK" not in ilk.upper(): return []
        d = duzey_bul(url, ilk)
        if not d: return []
        for p in pdf.pages:
            for tb in p.extract_tables():
                for r in tb:
                    if not r or not r[0] or not re.fullmatch(r"\d{6,}", str(r[0]).strip()): continue
                    r = [(c or "").replace("\n", " ").strip() for c in r]
                    if len(r) < 8: continue
                    parca = [x.strip() for x in r[1].split("/")]
                    satirlar.append({
                        "k": r[0], "d": d, "kurum": parca[0], "il": parca[1] if len(parca) > 1 else "",
                        "yer": " / ".join(parca[2:]), "unvan": r[2], "kont": int(sayi(r[3]) or 0), "yerlesen": int(sayi(r[4]) or 0),
                        "min": sayi(r[6]), "max": sayi(r[7]), "donem": donem,
                    })
    print(donem, d, url.rsplit("/", 1)[-1], len(satirlar), file=sys.stderr)
    return satirlar

def main(cikti):
    tum = []
    for donem, kaynak in DONEMLER.items():
        try:
            for u in pdfleri_bul(kaynak):
                try: tum += isle(u, donem)
                except Exception as e: print("pdf hatası", u, e, file=sys.stderr)
        except Exception as e:
            print("dönem hatası", donem, e, file=sys.stderr)
    out = {"donemler": list(DONEMLER), "puanTuru": {k: v[1] for k, v in DUZEY.items()}, "kadrolar": tum}
    with open(cikti, "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("toplam", len(tum), file=sys.stderr)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "tercih.json")
