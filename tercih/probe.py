import re, urllib.request, io
UA={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36","Referer":"https://osym.gov.tr/"}
def al(u): 
    r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=90); return r.geturl(), r.headers.get("content-type"), r.read()
s="https://osym.gov.tr/kpss20261-bazi-kamu-kurum-ve-kuruluslarinin-kadro-ve-pozisyonlarina-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler"
_,_,h=al(s); h=h.decode("utf-8","ignore")
for l in sorted(set(re.findall(r'(?:href|src)="([^"]+)"',h))):
    if "2026" in l and ("KPSS" in l.upper() or "minmax" in l.lower() or "sayisal" in l.lower()): print("L",l)
print("TITLE", re.findall(r"<title>(.*?)</title>",h))
u="https://dokuman.osym.gov.tr/pdfdokuman/2025/KPSS/TERCIH2/minmaxort07012025.pdf"
url,ct,b=al(u); print("GOT",url,ct,len(b),b[:200])
