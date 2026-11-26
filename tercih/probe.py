import urllib.request, io, pdfplumber
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}
def al(u): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=90).read()
for d in ["24072026","23072026","25072026"]:
  for n in ["minmaxort","minmaxonl","minmaxlisans","sayisalbil"]:
    u=f"https://dokuman.osym.gov.tr/pdfdokuman/2026/KPSS/TERCIH1/{n}{d}.pdf"
    try: b=al(u); print("FOUND" if b[:4]==b"%PDF" else "NOPDF",u,len(b))
    except Exception as e: pass
b=al("https://dokuman.osym.gov.tr/pdfdokuman/2025/KPSS/TERCIH2/minmaxort07012025.pdf")
with pdfplumber.open(io.BytesIO(b)) as pdf:
    print("PAGES",len(pdf.pages))
    t=pdf.pages[0].extract_text(); print("TXT",t[:900].replace("\n"," | "))
    for tb in pdf.pages[0].extract_tables()[:1]:
        for r in tb[:6]: print("ROW",r)
    tb=pdf.pages[3].extract_tables()
    for r in (tb[0][:4] if tb else []): print("ROW3",r)
