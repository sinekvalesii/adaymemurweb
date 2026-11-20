"use strict";
const IL = {"01":"Adana","02":"Adıyaman","03":"Afyonkarahisar","04":"Ağrı","05":"Amasya","06":"Ankara","07":"Antalya","08":"Artvin","09":"Aydın","10":"Balıkesir","11":"Bilecik","12":"Bingöl","13":"Bitlis","14":"Bolu","15":"Burdur","16":"Bursa","17":"Çanakkale","18":"Çankırı","19":"Çorum","20":"Denizli","21":"Diyarbakır","22":"Edirne","23":"Elazığ","24":"Erzincan","25":"Erzurum","26":"Eskişehir","27":"Gaziantep","28":"Giresun","29":"Gümüşhane","30":"Hakkari","31":"Hatay","32":"Isparta","33":"Mersin","34":"İstanbul","35":"İzmir","36":"Kars","37":"Kastamonu","38":"Kayseri","39":"Kırklareli","40":"Kırşehir","41":"Kocaeli","42":"Konya","43":"Kütahya","44":"Malatya","45":"Manisa","46":"Kahramanmaraş","47":"Mardin","48":"Muğla","49":"Muş","50":"Nevşehir","51":"Niğde","52":"Ordu","53":"Rize","54":"Sakarya","55":"Samsun","56":"Siirt","57":"Sinop","58":"Sivas","59":"Tekirdağ","60":"Tokat","61":"Trabzon","62":"Tunceli","63":"Şanlıurfa","64":"Uşak","65":"Van","66":"Yozgat","67":"Zonguldak","68":"Aksaray","69":"Bayburt","70":"Karaman","71":"Kırıkkale","72":"Batman","73":"Şırnak","74":"Bartın","75":"Ardahan","76":"Iğdır","77":"Yalova","78":"Karabük","79":"Kilis","80":"Osmaniye","81":"Düzce"};
const TUR = {memur:"Memur",sozlesmeli:"Sözleşmeli",isci:"İşçi",akademik:"Akademik",kolluk:"Askerî / Kolluk",diger:"Diğer"};
const EG_SIRA = ["ilkogretim","ortaogretim","onlisans","lisans","yukseklisans","doktora"];
const EG = {ilkogretim:"İlköğretim",ortaogretim:"Ortaöğretim",onlisans:"Önlisans",lisans:"Lisans",yukseklisans:"Yüksek lisans",doktora:"Doktora"};
const PUAN = ["P94","P93","P3"];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const katla = s => (s||"").replace(/[İIıîÎ]/g,"i").replace(/[Şş]/g,"s").replace(/[Ğğ]/g,"g").replace(/[ÜüûÛ]/g,"u").replace(/[Öö]/g,"o").replace(/[Çç]/g,"c").replace(/[Ââ]/g,"a").toLowerCase().replace(/\s+/g," ").trim();
const oku = (k, v) => { try { return JSON.parse(localStorage.getItem(k)) ?? v; } catch { return v; } };
const yaz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const kalan = s => { if (!s) return null; const d = new Date(s + "T23:59:59+03:00"); return Math.floor((d - Date.now()) / 864e5); };
const tarih = s => s ? new Date(s).toLocaleDateString("tr-TR", {day:"numeric", month:"long", year:"numeric"}) : "";

let ILANLAR = [], GUNCEL = "", profil = oku("am_profil", {egitim:"", bolum:"", puanlar:{}, iller:[]}), kayit = oku("am_kayit", []);
let filtre = {arama:"", tur:"", egitim:"", puanTuru:"", puan:"", il:"", siralama:"yeni"};

// ---- Uygunluk (Android uygulamasıyla aynı mantık) ----
const BOS = new Set(["ve","bolumu","bolum","programi","lisans","onlisans","fakultesi","mezun","bilimi","bilimleri"]);
function bolumAnahtar(b) {
  const k = katla(b).replace(/[^a-z\s]/g," ").replace(/\s+/g," ").trim();
  if (!k) return []; if (k.endsWith("muhendisligi")) return [k];
  const kel = k.split(" ").filter(w => w.length > 3 && !BOS.has(w));
  return kel.length ? [kel.join(" "), kel[0]] : [k];
}
function uygunluk(i, p, detay) {
  const g = []; const E = (s, m) => g.push([s, m]);
  const kg = kalan(i.sonBasvuru); if (kg !== null && kg < 0) E("H", "Başvuru süresi doldu");
  if (p.egitim) {
    if (!i.egitim.length) E("B", "Öğrenim şartı ilan metninde");
    else if (i.egitim.includes(p.egitim)) E("E", `${EG[p.egitim]} mezunları başvurabilir`);
    else if (EG_SIRA.indexOf(p.egitim) > Math.max(...i.egitim.map(e => EG_SIRA.indexOf(e)))) E("B", `Kadrolar ${i.egitim.map(e=>EG[e]).join(", ")} düzeyinde`);
    else E("H", `İstenen: ${i.egitim.map(e=>EG[e]).join(", ")}`);
  }
  const pu = p.puanlar || {};
  if (i.kpssGerekli === false) E("E", "KPSS şartı yok");
  else if (i.kpss.length) {
    const es = i.kpss.filter(k => pu[k.tur] != null);
    if (!es.length) E("H", `İstenen puan türü: ${i.kpss.map(k=>k.tur).join(", ")}`);
    else { const y = es.find(k => k.min == null || pu[k.tur] >= k.min);
      if (y) E("E", y.min != null ? `KPSS ${y.tur}: ${pu[y.tur]} ≥ ${y.min} taban` : `KPSS ${y.tur} puanınla başvurabilirsin`);
      else E("H", `KPSS ${es[0].tur}: ${pu[es[0].tur]} < ${es[0].min} taban`); }
  } else if (i.kpssGerekli === true) E("B", "KPSS istenir; puan türü ilan metninde");
  else E("B", "KPSS şartını ilan metninden kontrol et");
  if (i.bolumSarti === "yok") E("E", "Bölüm şartı yok");
  else if (p.bolum) {
    const m = katla([detay||"", i.ozet, (i.bolumler||[]).join(" "), (i.unvanlar||[]).join(" ")].join(" "));
    if (bolumAnahtar(p.bolum).some(a => m.includes(a))) E("E", `${p.bolum} ilanda geçiyor`);
    else E("B", "Bölüm şartını ilan metninden kontrol et");
  }
  if (p.iller.length) {
    if (!i.iller.length) E("E", "Türkiye geneli / çok ilde kadro");
    else if (i.iller.some(x => p.iller.includes(x))) E("E", i.iller.map(x=>IL[x]).join(", "));
    else E("H", `Kadro yeri: ${i.iller.map(x=>IL[x]).join(", ")}`);
  }
  const h = g.filter(x=>x[0]==="H").length, b = g.filter(x=>x[0]==="B").length, e = g.length - h - b;
  return {durum: h ? "DEGIL" : b ? "KONTROL" : "UYGUN", puan: e*10 - b*3 - h*50 + (i.kadro ? Math.min(10, Math.log10(i.kadro+1)*3) : 0), g};
}
const profilVar = () => profil.egitim || Object.keys(profil.puanlar||{}).length || profil.bolum;

// ---- Görünümler ----
function kart(i, u) {
  const k = kalan(i.sonBasvuru);
  const son = k === null ? "" : k < 0 ? "Süresi doldu" : k === 0 ? "Son gün bugün" : `${k} gün kaldı`;
  const bas = (i.kurum||i.baslik).split(/\s+/).filter(w=>w.length>2).slice(0,2).map(w=>w[0]).join("").toLocaleUpperCase("tr");
  const cip = [TUR[i.tur], i.kadro ? `${i.kadro} kadro` : "", ...i.kpss.map(x => x.min ? `${x.tur} ≥ ${x.min}` : x.tur), ...i.egitim.map(e=>EG[e])].filter(Boolean);
  const etk = u ? `<span class="etiket e-${u.durum}">${{UYGUN:"Uygunsun",KONTROL:"Kontrol et",DEGIL:"Uygun değil"}[u.durum]}</span>` : "";
  return `<a class="kart" href="#/ilan/${encodeURIComponent(i.id)}"><div class="ust1"><div class="logo">${esc(bas)}</div><div><div class="kurum">${esc(i.kurum)}</div><div class="kurum">${esc(i.iller.length ? i.iller.slice(0,3).map(x=>IL[x]).join(", ") + (i.iller.length>3?"…":"") : "Türkiye geneli")}</div></div></div>
  <div class="bas">${esc(i.baslik)}</div><div class="cipler">${cip.map(c=>`<span class="cip">${esc(c)}</span>`).join("")}</div>
  <div class="alt1"><span class="son ${k!==null&&k<=2?"acil":""}">${son}</span>${etk}</div></a>`;
}
function filtrele(list) {
  const t = katla(filtre.arama).split(" ").filter(Boolean);
  let o = list.filter(i => {
    const k = kalan(i.sonBasvuru); if (k !== null && k < 0) return false;
    if (filtre.tur && i.tur !== filtre.tur) return false;
    if (filtre.egitim && i.egitim.length && !i.egitim.includes(filtre.egitim)) return false;
    if (filtre.il && i.iller.length && !i.iller.includes(filtre.il)) return false;
    if (filtre.puanTuru && i.kpssGerekli !== false) { const x = i.kpss.find(k => k.tur === filtre.puanTuru); if (!x) return false; if (filtre.puan && x.min && x.min > +filtre.puan) return false; }
    if (t.length) { const h = katla([i.baslik, i.kurum, (i.unvanlar||[]).join(" "), i.iller.map(x=>IL[x]).join(" "), TUR[i.tur], i.ozet].join(" ")); if (!t.every(w => h.includes(w))) return false; }
    return true;
  });
  if (filtre.siralama === "sonGun") o.sort((a,b) => (a.sonBasvuru||"9").localeCompare(b.sonBasvuru||"9"));
  if (filtre.siralama === "kadro") o.sort((a,b) => (b.kadro||0) - (a.kadro||0));
  return o;
}
const secenek = (obj, sec, bos) => `<option value="">${bos}</option>` + Object.entries(obj).map(([k,v]) => `<option value="${k}" ${k===sec?"selected":""}>${esc(v)}</option>`).join("");
const ilSirali = () => Object.entries(IL).sort((a,b)=>a[1].localeCompare(b[1],"tr"));

function vIlanlar() {
  const ilObj = Object.fromEntries(ilSirali());
  $("#ana").innerHTML = `<h1>Kamu ilanları, <span class="vurgu">tek yerde.</span></h1><p class="alt">${ILANLAR.length} güncel ilan · resmî kaynaklardan otomatik derlenir · ${GUNCEL ? "güncelleme " + new Date(GUNCEL).toLocaleString("tr-TR",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"}) : ""}</p>
  <div class="arac"><input type="search" id="f-arama" placeholder="Kurum, unvan, il ara…" value="${esc(filtre.arama)}">
  <select id="f-tur">${secenek(TUR, filtre.tur, "Tüm kadrolar")}</select>
  <select id="f-egitim">${secenek(EG, filtre.egitim, "Tüm öğrenim")}</select>
  <select id="f-il">${secenek(ilObj, filtre.il, "Tüm iller")}</select>
  <select id="f-puanTuru">${secenek(Object.fromEntries(PUAN.map(p=>[p,"KPSS "+p])), filtre.puanTuru, "Puan türü")}</select>
  <input id="f-puan" type="number" step="0.01" placeholder="Puanın" style="width:110px" value="${esc(filtre.puan)}">
  <select id="f-siralama">${secenek({sonGun:"Son başvurusu yakın",kadro:"En çok kadro"}, filtre.siralama, "En yeni")}</select></div><div id="liste"></div>`;
  const ciz = () => { const l = filtrele(ILANLAR); $("#liste").innerHTML = l.length ? l.slice(0,300).map(i => kart(i, profilVar() ? uygunluk(i, profil) : null)).join("") : `<p class="bos">Bu filtrelere uyan ilan yok.</p>`; };
  for (const k of Object.keys(filtre)) { const el = $("#f-" + k); if (el) el.addEventListener("input", () => { filtre[k] = el.value; ciz(); }); }
  ciz();
}
function vUygun() {
  if (!profilVar()) { $("#ana").innerHTML = `<h1>Sana <span class="vurgu">uygun</span> ilanlar</h1><div class="panel"><p>Öğrenim düzeyini, bölümünü ve KPSS puanını gir; başvurabileceğin ilanları şart şart karşılaştırarak listeleyelim.</p><a class="b ana" href="#/profil" style="display:inline-block;text-decoration:none;padding:9px 14px;border-radius:10px">Profilimi oluştur</a></div>`; return; }
  const r = ILANLAR.filter(i => { const k = kalan(i.sonBasvuru); return k === null || k >= 0; }).map(i => [i, uygunluk(i, profil)]).filter(x => x[1].durum !== "DEGIL").sort((a,b) => (a[1].durum===b[1].durum ? 0 : a[1].durum==="UYGUN" ? -1 : 1) || b[1].puan - a[1].puan);
  const uy = r.filter(x=>x[1].durum==="UYGUN").length;
  $("#ana").innerHTML = `<h1>Sana <span class="vurgu">uygun</span> ilanlar</h1><p class="alt">${uy} ilan doğrudan uygun · ${r.length-uy} ilanda şartları kontrol et · <a href="#/profil">profili düzenle</a></p>` + (r.length ? r.map(x => kart(x[0], x[1])).join("") : `<p class="bos">Şu an profiline uyan ilan yok. Yeni ilan çıktığında bildirim alırsın.</p>`);
}
function vKayitli() {
  const l = ILANLAR.filter(i => kayit.includes(i.id));
  $("#ana").innerHTML = `<h1>Kayıtlı <span class="vurgu">ilanlar</span></h1>` + (l.length ? l.map(i => kart(i, profilVar() ? uygunluk(i, profil) : null)).join("") : `<p class="bos">Henüz ilan kaydetmedin. İlan detayında “Kaydet”e bas.</p>`);
}
async function vIlan(id) {
  const i = ILANLAR.find(x => x.id === id); if (!i) { $("#ana").innerHTML = `<p class="bos">İlan bulunamadı. <a href="#/">Tüm ilanlar</a></p>`; return; }
  const k = kalan(i.sonBasvuru), kayitli = kayit.includes(i.id);
  const ciz = (detay) => {
    const u = profilVar() ? uygunluk(i, profil, detay) : null;
    $("#ana").innerHTML = `<p><a href="#/">← İlanlar</a></p><div class="panel"><div class="kurum">${esc(i.kurum)}</div><h1 style="font-size:24px">${esc(i.baslik)}</h1>
    <div class="cipler" style="margin:8px 0">${[TUR[i.tur], i.kadro?`${i.kadro} kadro`:"", ...i.egitim.map(e=>EG[e])].filter(Boolean).map(c=>`<span class="cip">${esc(c)}</span>`).join("")}</div>
    <p><b>Son başvuru:</b> ${i.sonBasvuru ? `${tarih(i.sonBasvuru)} ${k!==null ? `(${k<0?"süresi doldu":k===0?"bugün":k+" gün kaldı"})` : ""}` : "İlan metninde"}<br>
    <b>KPSS:</b> ${i.kpssGerekli===false ? "Şart yok" : i.kpss.length ? i.kpss.map(x=>x.min?`${x.tur} ≥ ${x.min}`:x.tur).join(", ") : "İlan metninde"}<br>
    <b>Kadro yeri:</b> ${i.iller.length ? i.iller.map(x=>IL[x]).join(", ") : "Türkiye geneli / ilan metninde"}${i.unvanlar?.length ? `<br><b>Unvanlar:</b> ${esc(i.unvanlar.slice(0,12).join(", "))}` : ""}</p>
    <div class="arac"><a class="b ana" style="text-decoration:none" href="${esc(i.url)}" target="_blank" rel="noopener">Resmî ilana git ↗</a>
    <button class="b" id="kaydet">${kayitli ? "Kaydedildi ✓" : "Kaydet"}</button>
    ${i.sonBasvuru ? `<a class="b" style="text-decoration:none" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Son başvuru: " + i.baslik)}&dates=${i.sonBasvuru.replace(/-/g,"")}/${i.sonBasvuru.replace(/-/g,"")}">Takvime ekle</a>` : ""}</div></div>
    ${u ? `<div class="panel"><h2>Sana uygun mu? <span class="etiket e-${u.durum}">${{UYGUN:"Uygunsun",KONTROL:"Kontrol et",DEGIL:"Uygun değil"}[u.durum]}</span></h2><ul class="gerekce">${u.g.map(([s,m]) => `<li>${s==="E"?"✅":s==="H"?"❌":"⚠️"} ${esc(m)}</li>`).join("")}</ul></div>` : `<div class="panel">Profilini oluşturursan bu ilanın şartlarını seninle karşılaştırırız. <a href="#/profil">Profil oluştur</a></div>`}
    <div class="panel"><h2>İlan özeti</h2><div class="metin">${esc(detay || i.ozet || "Ayrıntılar resmî ilan metnindedir.")}</div><p class="not">Özet resmî metinden otomatik çıkarılmıştır; başvurmadan önce resmî ilanı oku.</p></div>`;
    $("#kaydet").onclick = () => { kayit = kayit.includes(i.id) ? kayit.filter(x => x !== i.id) : [...kayit, i.id]; yaz("am_kayit", kayit); ciz(detay); };
  };
  ciz(null);
  try { const r = await fetch(`data/ilan/${encodeURIComponent(id)}.json`); if (r.ok) ciz((await r.json()).metin); } catch {}
}
async function vGundem() {
  $("#ana").innerHTML = `<h1>KPSS <span class="vurgu">gündemi</span></h1><div id="g"><p class="bos">Yükleniyor…</p></div>`;
  let t = {ogeler:[]}, d = {duyurular:[]};
  try { [t, d] = await Promise.all([fetch("data/takvim.json").then(r=>r.json()), fetch("data/duyurular.json").then(r=>r.json())]); } catch {}
  const bugun = new Date().toISOString().slice(0,10);
  $("#g").innerHTML = (d.duyurular||[]).map(x => `<div class="panel"><div class="kurum">${tarih(x.tarih)}</div><h2>${esc(x.baslik)}</h2><p>${esc(x.metin)}</p>${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">Kaynak ↗</a>`:""}</div>`).join("")
    + `<div class="panel"><h2>Sınav ve başvuru takvimi</h2>${(t.ogeler||[]).filter(o => (o.bitis||o.tarih) >= bugun).map(o => `<p><b>${tarih(o.tarih)}${o.bitis?" – "+tarih(o.bitis):""}</b><br>${esc(o.baslik)}${o.not?`<br><span class="not">${esc(o.not)}</span>`:""}</p>`).join("") || "<p class='bos'>Yaklaşan tarih yok.</p>"}${t.kaynakUrl?`<p class="not">Kaynak: <a href="${esc(t.kaynakUrl)}" target="_blank" rel="noopener">${esc(t.kaynak||"ÖSYM")}</a></p>`:""}</div>`;
}

// ---- Profil & bildirim ----
const sb = (yol, govde) => fetch(`${AM.SUPABASE_URL}/rest/v1/${yol}`, {method:"POST", headers:{apikey:AM.SUPABASE_KEY, "Content-Type":"application/json", Prefer:"return=minimal"}, body:JSON.stringify(govde)});
const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g,"+").replace(/_/g,"/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
async function pushAboneligi() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const izin = await Notification.requestPermission(); if (izin !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) || reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64(AM.VAPID_PUBLIC)});
}
function vProfil() {
  const ab = oku("am_abone", null);
  $("#ana").innerHTML = `<h1>Profil & <span class="vurgu">bildirim</span></h1><p class="alt">Bilgilerin yalnızca bu tarayıcıda saklanır. Bildirim açarsan profilin ve e-postan yalnızca sana uygun ilanları göndermek için kaydedilir.</p>
  <div class="panel"><h2>Profil</h2><div class="izgara">
   <label>Öğrenim düzeyi<select id="p-egitim">${secenek(EG, profil.egitim, "Seç")}</select></label>
   <label>Bölüm (varsa)<input id="p-bolum" value="${esc(profil.bolum)}" placeholder="ör. Bilgisayar Mühendisliği"></label>
   ${PUAN.map(p => `<label>KPSS ${p} puanın<input type="number" step="0.001" data-puan="${p}" value="${profil.puanlar?.[p] ?? ""}" placeholder="yoksa boş bırak"></label>`).join("")}
  </div><label style="margin-top:12px">Çalışmak istediğin iller (boş = tüm Türkiye)</label><div class="iller">${ilSirali().map(([k,v]) => `<label><input type="checkbox" value="${k}" ${profil.iller.includes(k)?"checked":""}>${v}</label>`).join("")}</div>
  <div class="arac" style="margin-top:12px"><button class="b ana" id="p-kaydet">Profili kaydet</button></div></div>
  <div class="panel"><h2>Yeni ilan bildirimi</h2><p>Sana uygun yeni bir ilan yayımlandığında e-posta ve tarayıcı/telefon bildirimi gönderelim.</p>
  <div class="arac"><input id="p-eposta" type="email" placeholder="E-posta adresin" value="${esc(ab?.eposta||"")}" style="flex:1;min-width:220px">
  <button class="b ana" id="p-bildirim">${ab ? "Bildirim ayarlarını güncelle" : "Bildirimleri aç"}</button>${ab ? `<button class="b" id="p-kapat">Bildirimleri kapat</button>` : ""}</div>
  <p class="not">E-posta istemiyorsan boş bırak; yalnızca anlık bildirim gelir. iPhone'da anlık bildirim için siteyi önce “Ana Ekrana Ekle” ile kur. Her e-postada abonelikten çıkma bağlantısı bulunur.</p><div class="durum" id="p-durum"></div></div>`;
  const oku_ = () => { const p = {egitim:$("#p-egitim").value, bolum:$("#p-bolum").value.trim(), puanlar:{}, iller:[...document.querySelectorAll(".iller input:checked")].map(x=>x.value)};
    document.querySelectorAll("[data-puan]").forEach(x => { if (x.value) p.puanlar[x.dataset.puan] = +x.value; }); return p; };
  const durum = m => $("#p-durum").textContent = m;
  $("#p-kaydet").onclick = () => { profil = oku_(); yaz("am_profil", profil); durum("Profil kaydedildi. Bana Uygun sekmesine bakabilirsin."); };
  $("#p-bildirim").onclick = async () => {
    profil = oku_(); yaz("am_profil", profil);
    const eposta = $("#p-eposta").value.trim();
    if (eposta && !/^\S+@\S+\.\S+$/.test(eposta)) return durum("E-posta adresini kontrol et.");
    durum("Kaydediliyor…");
    let push = null; try { push = await pushAboneligi(); } catch {}
    if (!eposta && !push) return durum("Bildirim izni verilmedi. E-posta adresi girersen e-postayla haber veririz.");
    const token = crypto.randomUUID();
    const eski = oku("am_abone", null);
    if (eski?.token) await sb("rpc/abonelik_iptal", {t: eski.token}).catch(()=>{});
    const r = await sb("aboneler", {eposta: eposta || null, push: push ? push.toJSON() : null, profil, token}).catch(() => null);
    if (!r || !r.ok) return durum("Kaydedilemedi, biraz sonra tekrar dene.");
    yaz("am_abone", {eposta, token});
    durum(`Bildirimler açık${eposta ? " · e-posta: " + eposta : ""}${push ? " · anlık bildirim: açık" : ""}.`);
  };
  if ($("#p-kapat")) $("#p-kapat").onclick = async () => { const a = oku("am_abone", null); if (a?.token) await sb("rpc/abonelik_iptal", {t:a.token}).catch(()=>{});
    try { const reg = await navigator.serviceWorker.ready; (await reg.pushManager.getSubscription())?.unsubscribe(); } catch {}
    localStorage.removeItem("am_abone"); vProfil(); durum("Bildirimler kapatıldı."); };
}
function vGizlilik() {
  $("#ana").innerHTML = `<h1>Gizlilik</h1><div class="panel"><p>Profil bilgilerin (öğrenim, bölüm, KPSS puanı, il tercihi) ve kayıtlı ilanların yalnızca tarayıcında saklanır.</p><p>Bildirimleri açarsan e-posta adresin, tarayıcı bildirim adresin ve profilin yalnızca sana uygun yeni ilanları göndermek için saklanır (Supabase). E-postalar Brevo üzerinden gönderilir. Bu bilgiler başka hiçbir amaçla kullanılmaz, paylaşılmaz.</p><p>Her e-postadaki bağlantıyla ya da Profil & Bildirim sayfasındaki “Bildirimleri kapat” ile kayıtlarını tamamen silebilirsin. Sitede analiz veya izleme aracı yoktur.</p><p>İletişim: <a href="mailto:selcukyuss@gmail.com">selcukyuss@gmail.com</a></p></div>`;
}
async function iptal(t) {
  $("#ana").innerHTML = `<p class="bos">İşleniyor…</p>`;
  const r = await sb("rpc/abonelik_iptal", {t}).catch(() => null);
  localStorage.removeItem("am_abone");
  $("#ana").innerHTML = `<div class="panel"><h1>${r && r.ok ? "Abonelikten çıktın" : "İşlem tamamlanamadı"}</h1><p>${r && r.ok ? "Artık e-posta ve bildirim almayacaksın. İstediğin zaman yeniden açabilirsin." : "Lütfen biraz sonra tekrar dene."}</p><a href="#/">İlanlara dön</a></div>`;
}

function yonlendir() {
  const h = location.hash.slice(2), [s, x] = h.split("/");
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.dataset.s === (s || "ilanlar")));
  window.scrollTo(0, 0);
  ({"":vIlanlar, uygun:vUygun, kayitli:vKayitli, gundem:vGundem, profil:vProfil, gizlilik:vGizlilik, ilan:() => vIlan(decodeURIComponent(x))}[s] || vIlanlar)();
}
const tema = () => { const k = oku("am_tema", matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("koyu", k); document.querySelector("meta[name=theme-color]").content = k ? "#0F1115" : "#F4F6F9"; };
$("#tema").onclick = () => { yaz("am_tema", !document.documentElement.classList.contains("koyu")); tema(); };
tema();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
(async () => {
  const q = new URLSearchParams(location.search).get("iptal");
  try { const d = await (await fetch("data/ilanlar.json", {cache:"no-cache"})).json(); ILANLAR = d.ilanlar; GUNCEL = d.guncelleme; }
  catch { $("#ana").innerHTML = `<p class="bos">İlanlar yüklenemedi. İnternet bağlantını kontrol et.</p>`; }
  if (q) return iptal(q);
  addEventListener("hashchange", yonlendir); yonlendir();
})();
