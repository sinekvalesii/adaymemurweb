"""Yeni ilanları abonelerin profiline göre eşleştirir; e-posta (Brevo) ve web push gönderir."""
import json, math, os, re, sys, unicodedata
from datetime import date, datetime, timedelta, timezone
import requests
from pywebpush import webpush, WebPushException

SITE = os.environ.get("SITE_URL", "https://sinekvalesii.github.io/adaymemurweb").rstrip("/")
SB = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
if SB and not SB.startswith("http"):
    SB = f"https://{SB}.supabase.co"
SBK = os.environ.get("SUPABASE_SERVICE_KEY", "")
BREVO = os.environ.get("BREVO_API_KEY", "")
VAPID = os.environ.get("VAPID_PRIVATE", "")
GONDEREN = os.environ.get("GONDEREN", "selcukyuss@gmail.com")
EG = {"ilkogretim": "İlköğretim", "ortaogretim": "Ortaöğretim", "onlisans": "Önlisans", "lisans": "Lisans", "yukseklisans": "Yüksek lisans", "doktora": "Doktora"}
SIRA = list(EG)
BOS = {"ve", "bolumu", "bolum", "programi", "lisans", "onlisans", "fakultesi", "mezun", "bilimi", "bilimleri"}
TR = str.maketrans("İIıîÎŞşĞğÜüûÛÖöÇçÂâ", "iiiiissgguuuuoocc" + "aa")


def katla(s):
    return re.sub(r"\s+", " ", (s or "").translate(TR).lower()).strip()


def anahtar(b):
    k = re.sub(r"\s+", " ", re.sub(r"[^a-z\s]", " ", katla(b))).strip()
    if not k:
        return []
    if k.endswith("muhendisligi"):
        return [k]
    kel = [w for w in k.split() if len(w) > 3 and w not in BOS]
    return [" ".join(kel), kel[0]] if kel else [k]


def uygun(i, p):
    g = []
    pu = p.get("puanlar") or {}
    if p.get("egitim"):
        e = i.get("egitim") or []
        if not e:
            g.append("B")
        elif p["egitim"] in e:
            g.append("E")
        elif SIRA.index(p["egitim"]) > max(SIRA.index(x) for x in e if x in SIRA):
            g.append("B")
        else:
            g.append("H")
    k = i.get("kpss") or []
    if i.get("kpssGerekli") is False:
        g.append("E")
    elif k:
        es = [x for x in k if pu.get(x["tur"]) is not None]
        if not es:
            g.append("H")
        else:
            g.append("E" if any(x.get("min") is None or pu[x["tur"]] >= x["min"] for x in es) else "H")
    else:
        g.append("B")
    if i.get("bolumSarti") == "yok":
        g.append("E")
    elif p.get("bolum"):
        m = katla(" ".join([i.get("ozet") or "", " ".join(i.get("bolumler") or []), " ".join(i.get("unvanlar") or [])]))
        g.append("E" if any(a in m for a in anahtar(p["bolum"])) else "B")
    iller = p.get("iller") or []
    if iller:
        g.append("E" if not i.get("iller") or set(i["iller"]) & set(iller) else "H")
    return None if "H" in g else ("UYGUN" if "B" not in g else "KONTROL")


def sb(method, yol, **kw):
    return requests.request(method, f"{SB}/rest/v1/{yol}", headers={"apikey": SBK, "Authorization": f"Bearer {SBK}"} if not SBK.startswith("sb_") else {"apikey": SBK}, timeout=30, **kw)


def gonder(a, eslesen, konu, baslik_html):
    """Bir aboneye e-posta ve push gönderir. (eposta_ok, push_ok) döner."""
    iptal = f"{SITE}/?iptal={a['token']}"
    e_ok = p_ok = False
    if a.get("eposta") and BREVO:
        satir = "".join(
            f'<tr><td style="padding:12px 0;border-bottom:1px solid #E1E5EB"><div style="font-size:13px;color:#4A505B">{i.get("kurum") or ""}</div>'
            f'<a href="{SITE}/#/ilan/{i["id"]}" style="font-size:16px;font-weight:600;color:#1B1E23;text-decoration:none">{i["baslik"]}</a>'
            f'<div style="font-size:13px;color:#4A505B">{"✅ Uygunsun" if d == "UYGUN" else "⚠️ Şartları kontrol et"}'
            f'{" · " + str(i["kadro"]) + " kadro" if i.get("kadro") else ""}{" · Son başvuru " + i["sonBasvuru"] if i.get("sonBasvuru") else ""}</div></td></tr>'
            for i, d in eslesen[:25])
        html = (f'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1B1E23"><h2 style="margin:0 0 4px">{baslik_html}</h2>'
                f'<p style="color:#4A505B;margin:0 0 8px">Profiline göre seçildi. Başvurmadan önce şartları resmî ilan metninden doğrula.</p><table width="100%">{satir}</table>'
                f'<p style="margin-top:16px"><a href="{SITE}/#/uygun" style="background:#1B1E23;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Tümünü gör</a></p>'
                f'<p style="font-size:12px;color:#767D89">Aday Memur bağımsız bir sitedir, kamu kurumlarıyla bağlantısı yoktur. <a href="{iptal}">Abonelikten çık</a> · Yapım: selcukyus</p></div>')
        rr = requests.post("https://api.brevo.com/v3/smtp/email", timeout=30, headers={"api-key": BREVO}, json={
            "sender": {"name": "Aday Memur", "email": GONDEREN}, "to": [{"email": a["eposta"]}],
            "subject": konu, "htmlContent": html, "headers": {"List-Unsubscribe": f"<{iptal}>"}})
        e_ok = rr.ok
        if not rr.ok:
            print("Brevo hata:", rr.status_code, rr.text[:300])
    if a.get("push") and VAPID:
        i0 = eslesen[0][0]
        try:
            webpush(subscription_info=a["push"], vapid_private_key=VAPID, vapid_claims={"sub": f"mailto:{GONDEREN}"}, ttl=86400,
                    data=json.dumps({"title": konu[:80], "body": i0["baslik"][:120],
                                     "url": f"{SITE}/#/" + ("uygun" if len(eslesen) > 1 else f"ilan/{i0['id']}")}))
            p_ok = True
        except WebPushException as e:
            if e.response is not None and e.response.status_code in (404, 410):
                sb("PATCH", f"aboneler?id=eq.{a['id']}", json={"push": None})
            print("Push hata:", e)
    return e_ok, p_ok


def main(eski_yol, yeni_yol):
    yeni = json.load(open(yeni_yol, encoding="utf-8"))["ilanlar"]
    bugun = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()
    aktif = [i for i in yeni if (i.get("sonBasvuru") or "9999") >= bugun]
    try:
        eski = {x["id"] for x in json.load(open(eski_yol, encoding="utf-8"))["ilanlar"]}
    except Exception:
        eski = None
    taze = [] if eski is None else [i for i in aktif if i["id"] not in eski and not any(x in eski for x in i.get("ayni") or [])]
    print(f"Yeni ilan: {len(taze)}")
    if not SB or not SBK:
        print("Supabase ayarı eksik.")
        return
    r = sb("GET", "aboneler?select=*&order=olusturma.desc")
    if not r.ok:
        print("Supabase okuma hatası:", r.status_code, r.text[:300])
        return
    gorulen, sayac = set(), [0, 0, 0]
    for a in r.json():
        anah = a.get("eposta") or (a.get("push") or {}).get("endpoint")
        if not anah or anah in gorulen:
            continue
        gorulen.add(anah)
        profil = a.get("profil") or {}
        if a.get("hosgeldin") is False:
            # Yeni abone: bildirimlerin çalıştığını göstermek için güncel uygun ilanları gönder
            es = [(i, d) for i in aktif if (d := uygun(i, profil))]
            es.sort(key=lambda x: (x[1] != "UYGUN", x[0].get("sonBasvuru") or "9999"))
            if es:
                ok = gonder(a, es, f"Bildirimler açık: sana uygun {len(es)} güncel ilan", f"Bildirimler açık. Şu an sana uygun {len(es)} ilan var")
            else:
                ok = gonder(a, [(aktif[0], "KONTROL")] if aktif else [], "Aday Memur bildirimleri açık", "Bildirimler açık. Sana uygun yeni ilan çıktığında haber vereceğiz") if aktif else (False, False)
            sb("PATCH", f"aboneler?id=eq.{a['id']}", json={"hosgeldin": True})
            sayac[2] += 1
            continue
        es = [(i, d) for i in taze if (d := uygun(i, profil))]
        if not es:
            continue
        es.sort(key=lambda x: x[1] != "UYGUN")
        e_ok, p_ok = gonder(a, es, f"{len(es)} yeni ilan sana uygun: {es[0][0]['baslik'][:60]}", f"Sana uygun {len(es)} yeni kamu ilanı")
        sayac[0] += e_ok
        sayac[1] += p_ok
    print(f"E-posta: {sayac[0]}, push: {sayac[1]}, hoş geldin: {sayac[2]}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
