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


def main(eski_yol, yeni_yol):
    yeni = json.load(open(yeni_yol, encoding="utf-8"))["ilanlar"]
    try:
        eski = {x["id"] for x in json.load(open(eski_yol, encoding="utf-8"))["ilanlar"]}
    except Exception:
        print("Önceki veri yok; ilk çalışma, bildirim gönderilmedi.")
        return
    bugun = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()
    taze = [i for i in yeni if i["id"] not in eski and not any(a in eski for a in i.get("ayni") or []) and (i.get("sonBasvuru") or "9999") >= bugun]
    print(f"Yeni ilan: {len(taze)}")
    if not taze or not SB or not SBK:
        return
    r = sb("GET", "aboneler?select=id,eposta,push,profil,token&order=olusturma.desc")
    r.raise_for_status()
    gorulen, eposta_n, push_n = set(), 0, 0
    for a in r.json():
        anah = a.get("eposta") or (a.get("push") or {}).get("endpoint")
        if not anah or anah in gorulen:
            continue
        gorulen.add(anah)
        eslesen = [(i, d) for i in taze if (d := uygun(i, a.get("profil") or {}))]
        if not eslesen:
            continue
        eslesen.sort(key=lambda x: x[1] != "UYGUN")
        iptal = f"{SITE}/?iptal={a['token']}"
        if a.get("eposta") and BREVO:
            satir = "".join(
                f'<tr><td style="padding:12px 0;border-bottom:1px solid #E1E5EB"><div style="font-size:13px;color:#4A505B">{i.get("kurum") or ""}</div>'
                f'<a href="{SITE}/#/ilan/{i["id"]}" style="font-size:16px;font-weight:600;color:#1B1E23;text-decoration:none">{i["baslik"]}</a>'
                f'<div style="font-size:13px;color:#4A505B">{"✅ Uygunsun" if d == "UYGUN" else "⚠️ Şartları kontrol et"}'
                f'{" · " + str(i["kadro"]) + " kadro" if i.get("kadro") else ""}{" · Son başvuru " + i["sonBasvuru"] if i.get("sonBasvuru") else ""}</div></td></tr>'
                for i, d in eslesen[:25])
            html = (f'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1B1E23"><h2 style="margin:0 0 4px">Sana uygun {len(eslesen)} yeni kamu ilanı</h2>'
                    f'<p style="color:#4A505B;margin:0 0 8px">Profiline göre seçildi. Başvurmadan önce şartları resmî ilan metninden doğrula.</p><table width="100%">{satir}</table>'
                    f'<p style="margin-top:16px"><a href="{SITE}/#/uygun" style="background:#1B1E23;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Tümünü gör</a></p>'
                    f'<p style="font-size:12px;color:#767D89">Aday Memur bağımsız bir sitedir, kamu kurumlarıyla bağlantısı yoktur. <a href="{iptal}">Abonelikten çık</a> · Yapım: selcukyus</p></div>')
            rr = requests.post("https://api.brevo.com/v3/smtp/email", timeout=30, headers={"api-key": BREVO}, json={
                "sender": {"name": "Aday Memur", "email": GONDEREN}, "to": [{"email": a["eposta"]}],
                "subject": f"{len(eslesen)} yeni ilan sana uygun: {eslesen[0][0]['baslik'][:60]}", "htmlContent": html,
                "headers": {"List-Unsubscribe": f"<{iptal}>"}})
            eposta_n += rr.ok
            if not rr.ok:
                print("Brevo hata:", rr.status_code, rr.text[:200])
        if a.get("push") and VAPID:
            i0 = eslesen[0][0]
            try:
                webpush(subscription_info=a["push"], vapid_private_key=VAPID, vapid_claims={"sub": f"mailto:{GONDEREN}"}, ttl=86400,
                        data=json.dumps({"title": f"{len(eslesen)} yeni ilan sana uygun" if len(eslesen) > 1 else (i0.get("kurum") or "Yeni ilan"),
                                         "body": i0["baslik"][:120], "url": f"{SITE}/#/" + ("uygun" if len(eslesen) > 1 else f"ilan/{i0['id']}")}))
                push_n += 1
            except WebPushException as e:
                if e.response is not None and e.response.status_code in (404, 410):
                    sb("PATCH", f"aboneler?id=eq.{a['id']}", json={"push": None})
                print("Push hata:", e)
    print(f"E-posta: {eposta_n}, push: {push_n}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
