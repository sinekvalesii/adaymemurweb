import re, sys, urllib.request, io
import pdfplumber
UA={"User-Agent":"Mozilla/5.0"}
SAYFALAR=["https://osym.gov.tr/kpss20252-bazi-kamu-kurum-ve-kuruluslarin-kadro-ve-pozisyonlarina-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler",
"https://osym.gov.tr/kpss20261-bazi-kamu-kurum-ve-kuruluslarinin-kadro-ve-pozisyonlarina-yerlestirme-sonuclari-aciklandi",
"https://osym.gov.tr/kpss20252-bazi-kamu-kurum-ve-kuruluslarinin-kadro-ve-pozisyonlarina-yerlestirme-sonuclari-aciklandi"]
def al(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read()
for s in SAYFALAR:
    try: h=al(s).decode("utf-8","ignore")
    except Exception as e: print("ERR",s,e); continue
    links=set(re.findall(r'href="([^"]+)"',h))
    for l in sorted(links):
        if ".pdf" in l.lower() or "sayisal" in l.lower() or "TR," in l: print(s[-40:],"->",l)
