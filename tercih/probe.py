import re, urllib.request, io
import pdfplumber
UA={"User-Agent":"Mozilla/5.0"}
def al(u): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=90).read()
s="https://osym.gov.tr/kpss20261-bazi-kamu-kurum-ve-kuruluslarinin-kadro-ve-pozisyonlarina-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler"
for slug in [s, s.replace("kuruluslarinin","kuruluslarin")]:
    try:
        h=al(slug).decode("utf-8","ignore"); print("OK",slug); [print("L",l) for l in sorted(set(re.findall(r'href="([^"]+\.pdf)"',h))) if "KPSS" in l]
    except Exception as e: print("ERR",slug,e)
u="https://dokuman.osym.gov.tr/pdfdokuman/2025/KPSS/TERCIH2/minmaxort07012025.pdf"
with pdfplumber.open(io.BytesIO(al(u))) as pdf:
    print("PAGES",len(pdf.pages))
    p=pdf.pages[0]; print(p.extract_text()[:1500])
    for t in p.extract_tables()[:1]:
        for r in t[:8]: print("ROW",r)
    print("LAST", pdf.pages[-1].extract_text()[-600:])
