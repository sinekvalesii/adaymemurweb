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

let ILANLAR = [], GUNCEL = "", profil = Object.assign({egitim:"", bolum:"", puanlar:{}, iller:[]}, oku("am_profil", {})), kayit = oku("am_kayit", []);
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
  if ((p.iller||[]).length) {
    if (!i.iller.length) E("E", "Türkiye geneli / çok ilde kadro");
    else if (i.iller.some(x => p.iller.includes(x))) E("E", i.iller.map(x=>IL[x]).join(", "));
    else E("H", `Kadro yeri: ${i.iller.map(x=>IL[x]).join(", ")}`);
  }
  const h = g.filter(x=>x[0]==="H").length, b = g.filter(x=>x[0]==="B").length, e = g.length - h - b;
  return {durum: h ? "DEGIL" : b ? "KONTROL" : "UYGUN", puan: e*10 - b*3 - h*50 + (i.kadro ? Math.min(10, Math.log10(i.kadro+1)*3) : 0), g};
}
const profilVar = () => profil.egitim || Object.keys(profil.puanlar||{}).length || profil.bolum;
const BUGUN = () => new Date(Date.now() + 3*36e5).toISOString().slice(0,10);
const acilmadi = i => !!i.basvuruBaslangic && i.basvuruBaslangic > BUGUN();
const kisaT = s => new Date(s).toLocaleDateString("tr-TR", {day:"numeric", month:"short"});
const aktifler = () => ILANLAR.filter(i => { const k = kalan(i.sonBasvuru); return k === null || k >= 0; });
const uygunlar = () => aktifler().map(i => [i, uygunluk(i, profil)]).filter(x => x[1].durum !== "DEGIL").sort((a,b) => (a[1].durum===b[1].durum ? 0 : a[1].durum==="UYGUN" ? -1 : 1) || b[1].puan - a[1].puan);
function sayac() { const el = $("#uy-say"); if (!el) return; const n = profilVar() ? uygunlar().filter(x=>x[1].durum==="UYGUN").length : 0; el.textContent = n ? (n > 99 ? "99+" : n) : ""; }
function toast(b, m) {
  let t = document.querySelector(".yakinda");
  if (!t) { t = document.createElement("div"); t.className = "yakinda"; document.body.appendChild(t); }
  t.innerHTML = `<b>${esc(b)}</b><span>${esc(m)}</span>`;
  t.classList.add("acik"); clearTimeout(t._z); t._z = setTimeout(() => t.classList.remove("acik"), 3500);
}
const BOLGE = {"Marmara":"10 11 16 17 22 34 39 41 54 59 77","Ege":"03 09 20 35 43 45 48 64","İç Anadolu":"06 18 26 38 40 42 50 51 58 66 68 70 71","Akdeniz":"01 07 15 31 32 33 46 80","Karadeniz":"05 08 14 19 28 29 37 52 53 55 57 60 61 67 69 74 78 81","Doğu Anadolu":"04 12 13 23 24 25 30 36 44 49 62 65 75 76","Güneydoğu":"02 21 27 47 56 63 72 73 79"};
async function profilKaydet() { yaz("am_profil", profil); sayac(); return hesapGuncelle({profil}); }

// ---- Görünümler ----
function kart(i, u) {
  const k = kalan(i.sonBasvuru);
  const son = k === null ? "" : k < 0 ? "Süresi doldu" : k === 0 ? "Son gün bugün" : `${k} gün kaldı`;
  const bas = (i.kurum||i.baslik).split(/\s+/).filter(w=>w.length>2).slice(0,2).map(w=>w[0]).join("").toLocaleUpperCase("tr");
  const cip = [TUR[i.tur], i.kadro ? `${i.kadro} kadro` : "", ...i.kpss.map(x => x.min ? `${x.tur} ≥ ${x.min}` : x.tur), ...i.egitim.map(e=>EG[e])].filter(Boolean);
  const etk = u ? `<span class="etiket e-${u.durum}">${{UYGUN:"✓ Uygunsun",KONTROL:"Kontrol et",DEGIL:"Uygun değil"}[u.durum]}</span>` : "";
  if (acilmadi(i)) cip.unshift(`Başvuru açılışı: ${kisaT(i.basvuruBaslangic)}`);
  return `<a class="kart ${u?.durum==="UYGUN"?"k-uygun":""}" href="#/ilan/${encodeURIComponent(i.id)}"><div class="ust1"><div class="logo">${esc(bas)}</div><div><div class="kurum">${esc(i.kurum)}</div><div class="kurum">${esc(i.iller.length ? i.iller.slice(0,3).map(x=>IL[x]).join(", ") + (i.iller.length>3?"…":"") : "Türkiye geneli")}</div></div></div>
  <div class="bas">${esc(i.baslik)}</div><div class="cipler">${cip.map(c=>`<span class="cip ${c.startsWith("Başvuru ")?"c-yakin":""}">${esc(c)}</span>`).join("")}</div>
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
  <input type="search" id="f-arama" class="ara" placeholder="Kurum, unvan, il ara…" value="${esc(filtre.arama)}"><div class="arac filtreler">
  <select id="f-tur">${secenek(TUR, filtre.tur, "Tüm kadrolar")}</select>
  <select id="f-egitim">${secenek(EG, filtre.egitim, "Tüm öğrenim")}</select>
  <select id="f-il">${secenek(ilObj, filtre.il, "Tüm iller")}</select>
  <select id="f-puanTuru">${secenek(Object.fromEntries(PUAN.map(p=>[p,"KPSS "+p])), filtre.puanTuru, "Puan türü")}</select>
  <input id="f-puan" type="number" inputmode="decimal" step="0.01" placeholder="Puanın" style="width:110px" value="${esc(filtre.puan)}">
  <select id="f-siralama">${secenek({sonGun:"Son başvurusu yakın",kadro:"En çok kadro"}, filtre.siralama, "En yeni")}</select></div>${banner()}<div id="liste"></div>`;
  const ciz = () => { const l = filtrele(ILANLAR); $("#liste").innerHTML = l.length ? l.slice(0,300).map(i => kart(i, profilVar() ? uygunluk(i, profil) : null)).join("") : `<p class="bos">Bu filtrelere uyan ilan yok.</p>`; };
  for (const k of Object.keys(filtre)) { const el = $("#f-" + k); if (el) el.addEventListener("input", () => { filtre[k] = el.value; ciz(); }); }
  ciz();
}
function banner() {
  if (!KULLANICI) return `<a class="banner" href="#/kayit"><span class="b-ikon">🔔</span><div><b>Sana uygun ilanı ilk sen öğren</b><small>Ücretsiz hesap aç · e-posta ve anlık bildirim</small></div><em>Başla →</em></a>`;
  if (!profilVar()) return `<a class="banner" href="#/profil"><span class="b-ikon">✓</span><div><b>Profilini 1 dakikada doldur</b><small>Öğrenim, KPSS puanı ve iller · sana uygun ilanları eşleştirelim</small></div><em>Doldur →</em></a>`;
  const n = uygunlar().filter(x=>x[1].durum==="UYGUN").length;
  return `<a class="banner" href="#/uygun"><span class="b-ikon">${n}</span><div><b>Sana uygun ${n} ilan var</b><small>Profiline göre şart şart eşleştirildi</small></div><em>Gör →</em></a>`;
}
function profilOzet() {
  const p = profil, c = [p.egitim && EG[p.egitim], p.bolum, ...Object.entries(p.puanlar||{}).map(([k,v]) => `${k}: ${v}`), p.iller?.length ? (p.iller.length > 2 ? `${IL[p.iller[0]]} +${p.iller.length-1} il` : p.iller.map(x=>IL[x]).join(", ")) : "Tüm Türkiye"].filter(Boolean);
  return `<div class="ozet-kart"><div class="cipler">${c.map(x=>`<span class="cip">${esc(x)}</span>`).join("")}</div><a class="b kucuk" href="#/profil">Düzenle</a></div>`;
}
function vUygun() {
  if (!profilVar()) { $("#ana").innerHTML = `<h1>Sana <span class="vurgu">uygun</span> ilanlar</h1><div class="panel bos-panel"><div class="b-ikon buyuk">✓</div><h2>Kişisel ilan listen</h2><p>Öğrenim düzeyini, bölümünü, KPSS puanını ve çalışmak istediğin illeri gir. Başvurabileceğin ilanları şart şart karşılaştırır, yenileri çıktığında anında haber veririz.</p><a class="btn birincil genis" href="${KULLANICI ? "#/profil" : "#/kayit"}">${KULLANICI ? "Profilimi doldur" : "Ücretsiz hesap oluştur"}</a></div>`; return; }
  const r = uygunlar(), uy = r.filter(x=>x[1].durum==="UYGUN"), ko = r.filter(x=>x[1].durum!=="UYGUN");
  $("#ana").innerHTML = `<h1>Sana <span class="vurgu">uygun</span> ilanlar</h1>${profilOzet()}
  <div class="istat"><div><b>${uy.length}</b><span>Doğrudan uygun</span></div><div><b>${ko.length}</b><span>Şartı kontrol et</span></div><div><b>${(profil.takip||[]).length + (profil.acilis||[]).length}</b><span>Takip</span></div></div>
  ${uy.length ? `<h2 class="bolum-bas">✓ Başvurabilirsin</h2>` + uy.map(x => kart(x[0], x[1])).join("") : ""}
  ${ko.length ? `<h2 class="bolum-bas">Şartlarını kontrol et</h2>` + ko.map(x => kart(x[0], x[1])).join("") : ""}
  ${r.length ? "" : `<p class="bos">Şu an profiline uyan ilan yok. Yeni ilan çıktığında e-posta ve bildirimle haber vereceğiz.</p>`}`;
}
function vKayitli() {
  const l = ILANLAR.filter(i => kayit.includes(i.id));
  $("#ana").innerHTML = `<h1>Kayıtlı <span class="vurgu">ilanlar</span></h1>` + (l.length ? l.map(i => kart(i, profilVar() ? uygunluk(i, profil) : null)).join("") : `<p class="bos">Henüz ilan kaydetmedin. İlan detayında “Kaydet”e bas.</p>`);
}
async function vIlan(id) {
  const i = ILANLAR.find(x => x.id === id); if (!i) { $("#ana").innerHTML = `<p class="bos">İlan bulunamadı. <a href="#/">Tüm ilanlar</a></p>`; return; }
  const k = kalan(i.sonBasvuru);
  const unv = [...new Set((i.unvanlar||[]).length ? i.unvanlar : [i.baslik])].slice(0, 25);
  let tk = (profil.takip||[]).find(t => t.id === i.id), tKurum = tk ? !!tk.kurum : false, tIl = tk ? tk.profilIlleri !== false : true;
  const ciz = (detay) => {
    const u = profilVar() ? uygunluk(i, profil, detay) : null, kayitli = kayit.includes(i.id), takipte = (profil.acilis||[]).includes(i.id);
    tk = (profil.takip||[]).find(t => t.id === i.id);
    const son = i.sonBasvuru ? `${tarih(i.sonBasvuru)}${k!==null ? ` · ${k<0?"süresi doldu":k===0?"son gün bugün":k+" gün kaldı"}` : ""}` : "İlan metninde";
    $("#ana").innerHTML = `<a class="geri" href="#/">← İlanlar</a>
    <div class="panel hero"><div class="kurum">${esc(i.kurum)}</div><h1 class="ilan-bas">${esc(i.baslik)}</h1>
    <div class="cipler">${[TUR[i.tur], i.kadro?`${i.kadro} kadro`:"", ...i.egitim.map(e=>EG[e])].filter(Boolean).map(c=>`<span class="cip">${esc(c)}</span>`).join("")}${u ? `<span class="etiket e-${u.durum}">${{UYGUN:"✓ Uygunsun",KONTROL:"Kontrol et",DEGIL:"Uygun değil"}[u.durum]}</span>` : ""}</div>
    <div class="bilgi"><div class="${k!==null&&k<=2&&k>=0?"acil":""}"><span>Son başvuru</span><b>${son}</b></div>
    ${i.basvuruBaslangic ? `<div><span>Başvuru başlangıcı</span><b>${tarih(i.basvuruBaslangic)}</b></div>` : ""}
    <div><span>KPSS</span><b>${i.kpssGerekli===false ? "Şart yok" : i.kpss.length ? i.kpss.map(x=>x.min?`${x.tur} ≥ ${x.min}`:x.tur).join(", ") : "İlan metninde"}</b></div>
    <div><span>Kadro yeri</span><b>${i.iller.length ? esc(i.iller.map(x=>IL[x]).join(", ")) : "Türkiye geneli"}</b></div></div>
    ${i.unvanlar?.length ? `<p class="not"><b>Unvanlar:</b> ${esc(i.unvanlar.slice(0,12).join(", "))}${i.unvanlar.length>12?"…":""}</p>` : ""}
    <div class="eylem"><a class="btn birincil" href="${esc(i.url)}" target="_blank" rel="noopener">${acilmadi(i) ? "Resmî ilanı aç ↗" : "Başvur · Resmî ilan ↗"}</a>
    <button class="btn ikincil ${kayitli?"secili":""}" id="kaydet" aria-pressed="${kayitli}">${kayitli ? "★ Kaydedildi" : "☆ Kaydet"}</button></div>
    ${i.sonBasvuru ? `<a class="takvim" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Son başvuru: " + i.baslik)}&dates=${i.sonBasvuru.replace(/-/g,"")}/${i.sonBasvuru.replace(/-/g,"")}">📅 Son başvuruyu takvime ekle</a>` : ""}</div>
    ${acilmadi(i) ? `<div class="panel acilis-kart"><div class="a-ikon">⏳</div><div class="a-metin"><b>Başvurular ${tarih(i.basvuruBaslangic)} tarihinde açılıyor</b><span>Açıldığı anda e-posta ve anlık bildirim gönderelim.</span></div><button class="btn ${takipte?"ikincil secili":"birincil"}" id="acilis">${takipte ? "✓ Haber verilecek" : "Açılınca haber ver"}</button></div>` : ""}
    ${u ? `<div class="panel"><h2>Sana uygun mu?</h2><ul class="gerekce">${u.g.map(([s,m]) => `<li class="g-${s}"><i>${s==="E"?"✓":s==="H"?"✕":"!"}</i>${esc(m)}</li>`).join("")}</ul></div>` : `<a class="banner" href="${KULLANICI?"#/profil":"#/kayit"}"><span class="b-ikon">✓</span><div><b>Bu ilana uygun musun?</b><small>Profilini doldur, şartları seninle karşılaştıralım</small></div><em>→</em></a>`}
    <div class="panel takip-kart"><h2>🔔 Benzer ilanlar çıkınca haber al</h2><p class="not">Seçtiğin unvanda yeni ilan yayımlandığı anda e-posta ve bildirim gelir.</p>
     <label class="alan">Unvan<select id="t-unvan">${unv.map(x=>`<option ${tk?.unvanlar?.[0]===x?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
     <div class="secim"><span>Kurum</span><div class="segment" id="s-kurum"><button data-v="1" class="${tKurum?"on":""}">Yalnız bu kurum</button><button data-v="0" class="${tKurum?"":"on"}">Tümü</button></div></div>
     <div class="secim"><span>İl</span><div class="segment" id="s-il"><button data-v="1" class="${tIl?"on":""}">Profilimdeki iller</button><button data-v="0" class="${tIl?"":"on"}">Tüm Türkiye</button></div></div>
     <button class="btn ${tk?"ikincil secili":"birincil"} genis" id="t-al">${tk ? "✓ Bildirim açık · güncelle" : "🔔 Bildirim al"}</button>
     ${tk ? `<button class="metin-btn" id="t-sil">Takibi bırak</button>` : ""}<div class="durum" id="t-durum"></div></div>
    <div class="panel"><h2>İlan özeti</h2><div class="metin">${esc(detay || i.ozet || "Ayrıntılar resmî ilan metnindedir.")}</div><p class="not">Özet resmî metinden otomatik çıkarılmıştır; başvurmadan önce resmî ilanı oku.</p></div>`;
    $("#kaydet").onclick = () => { kayit = kayit.includes(i.id) ? kayit.filter(x => x !== i.id) : [...kayit, i.id]; yaz("am_kayit", kayit); hesapGuncelle({kayit}); ciz(detay); toast(kayit.includes(i.id) ? "Kaydedildi" : "Kayıttan çıkarıldı", kayit.includes(i.id) ? "Kayıtlı sekmesinde bulabilirsin." : ""); };
    const girisGerek = () => { if (KULLANICI) return false; toast("Ücretsiz hesap gerekli", "Bildirim gönderebilmemiz için hesap oluştur."); setTimeout(() => location.hash = "#/kayit", 900); return true; };
    const izinIste = async () => { if (HESAP?.push) return; try { const s = await pushAboneligi(); if (s) await hesapGuncelle({push:s.toJSON()}); } catch {} };
    const ac = $("#acilis"); if (ac) ac.onclick = async () => { if (girisGerek()) return;
      const l = profil.acilis || []; profil.acilis = l.includes(i.id) ? l.filter(x => x !== i.id) : [...l, i.id];
      const r = await profilKaydet(); if (r.error) return toast("Kaydedilemedi", r.error.message);
      if (profil.acilis.includes(i.id)) { await hesapGuncelle({bildirim:true}); toast("Haber vereceğiz", `Başvurular ${tarih(i.basvuruBaslangic)} tarihinde açılınca e-posta ve bildirim gelecek.`); izinIste(); }
      ciz(detay); };
    for (const [sid, f] of [["#s-kurum", v => tKurum = v], ["#s-il", v => tIl = v]])
      $(sid).querySelectorAll("button").forEach(b => b.onclick = () => { f(b.dataset.v === "1"); $(sid).querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); });
    $("#t-al").onclick = async () => { if (girisGerek()) return;
      const t = {id:i.id, unvanlar:[$("#t-unvan").value], kurum: tKurum ? i.kurum : "", profilIlleri: tIl};
      profil.takip = [...(profil.takip||[]).filter(x => x.id !== i.id), t];
      const r = await profilKaydet(); if (r.error) return toast("Kaydedilemedi", r.error.message);
      await hesapGuncelle({bildirim:true}); toast("Bildirim açık", `“${t.unvanlar[0]}” ilanı çıkınca anında haber vereceğiz.`); izinIste(); ciz(detay); };
    const ts = $("#t-sil"); if (ts) ts.onclick = async () => { profil.takip = (profil.takip||[]).filter(x => x.id !== i.id); await profilKaydet(); toast("Takip bırakıldı", ""); ciz(detay); };
  };
  ciz(null);
  try { const r = await fetch(`data/ilan/${encodeURIComponent(id)}.json`); if (r.ok) { const m = (await r.json()).metin; if (location.hash.includes(encodeURIComponent(id))) ciz(m); } } catch {}
}
async function vGundem() {
  $("#ana").innerHTML = `<h1>KPSS <span class="vurgu">gündemi</span></h1><div id="g"><p class="bos">Yükleniyor…</p></div>`;
  let t = {ogeler:[]}, d = {duyurular:[]};
  try { [t, d] = await Promise.all([fetch("data/takvim.json").then(r=>r.json()), fetch("data/duyurular.json").then(r=>r.json())]); } catch {}
  const bugun = new Date().toISOString().slice(0,10);
  $("#g").innerHTML = (d.duyurular||[]).map(x => `<div class="panel"><div class="kurum">${tarih(x.tarih)}</div><h2>${esc(x.baslik)}</h2><p>${esc(x.metin)}</p>${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">Kaynak ↗</a>`:""}</div>`).join("")
    + `<div class="panel"><h2>Sınav ve başvuru takvimi</h2>${(t.ogeler||[]).filter(o => (o.bitis||o.tarih) >= bugun).map(o => `<p><b>${tarih(o.tarih)}${o.bitis?" – "+tarih(o.bitis):""}</b><br>${esc(o.baslik)}${o.not?`<br><span class="not">${esc(o.not)}</span>`:""}</p>`).join("") || "<p class='bos'>Yaklaşan tarih yok.</p>"}${t.kaynakUrl?`<p class="not">Kaynak: <a href="${esc(t.kaynakUrl)}" target="_blank" rel="noopener">${esc(t.kaynak||"ÖSYM")}</a></p>`:""}</div>`;
}

// ---- Hesap (Supabase Auth) ----
const hatirla = oku("am_hatirla", true);
const KURTARMA = /type=recovery/.test(location.hash), LINK_HATA = /error_code=|error=/.test(location.hash) ? new URLSearchParams(location.hash.slice(1)).get("error_description") : null;
const db = supabase.createClient(AM.SUPABASE_URL, AM.SUPABASE_KEY, {auth:{persistSession:true, storage: KURTARMA ? localStorage : hatirla ? localStorage : sessionStorage, detectSessionInUrl:true, flowType:"implicit"}});
db.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY" && location.hash !== "#/sifre") location.hash = "#/sifre"; });
let KULLANICI = null, HESAP = null;
const sb = (yol, govde) => fetch(`${AM.SUPABASE_URL}/rest/v1/${yol}`, {method:"POST", headers:{apikey:AM.SUPABASE_KEY, "Content-Type":"application/json"}, body:JSON.stringify(govde)});
const telOk = t => /^(\+90|0)?5\d{9}$/.test(t.replace(/[\s()-]/g, ""));
const telDuz = t => "0" + t.replace(/[\s()-]/g, "").replace(/^(\+90|0)/, "");
function ustHesap() {
  const el = $("#hesap"); if (!el) return;
  el.textContent = KULLANICI ? (HESAP?.ad || "Hesabım") : "Giriş yap";
  el.href = KULLANICI ? "#/profil" : "#/giris";
}
async function hesapYukle() {
  const {data:{user}} = await db.auth.getUser(); KULLANICI = user;
  if (!user) { HESAP = null; ustHesap(); return; }
  let {data} = await db.from("profiller").select("*").eq("id", user.id).maybeSingle();
  if (!data) { // ilk giriş: kayıtta girilen bilgilerle hesabı oluştur
    const m = user.user_metadata || {};
    const satir = {id:user.id, ad:m.ad || "", soyad:m.soyad || "", telefon:m.telefon || "", eposta:user.email, profil, kayit};
    const r = await db.from("profiller").insert(satir).select().maybeSingle(); data = r.data;
  }
  HESAP = data;
  if (data) { profil = Object.assign({egitim:"", bolum:"", puanlar:{}, iller:[]}, data.profil || {}); kayit = data.kayit || []; yaz("am_profil", profil); yaz("am_kayit", kayit); }
  ustHesap(); sayac();
}
const hesapGuncelle = alan => KULLANICI && HESAP ? db.from("profiller").update({...alan, guncelleme:new Date().toISOString()}).eq("id", KULLANICI.id).then(r => { if (!r.error) Object.assign(HESAP, alan); return r; }) : Promise.resolve({});

function vGiris(mod = "giris") {
  if (KULLANICI) { location.hash = "#/profil"; return; }
  $("#ana").innerHTML = `<div class="giris"><h1>${mod === "kayit" ? "Hesap <span class='vurgu'>oluştur</span>" : "Giriş <span class='vurgu'>yap</span>"}</h1>
  <p class="alt">İlanlara herkes hesapsız bakabilir. Hesapla profilin, tercihlerin ve kayıtlı ilanların saklanır; sana uygun yeni ilanlar e-posta ve bildirimle gelir.</p>
  <div class="sekme"><a href="#/giris" class="${mod==="giris"?"on":""}">Giriş</a><a href="#/kayit" class="${mod==="kayit"?"on":""}">Kayıt ol</a></div>
  <form class="panel" id="f" autocomplete="on">
   ${mod === "kayit" ? `<div class="izgara"><label>Ad *<input name="ad" required autocomplete="given-name"></label><label>Soyad *<input name="soyad" required autocomplete="family-name"></label></div>
   <label>Telefon *<input name="tel" type="tel" required inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx"></label>` : ""}
   <label>E-posta *<input name="eposta" type="email" required autocomplete="email" inputmode="email"></label>
   <label>Şifre *<input name="sifre" type="password" required minlength="6" autocomplete="${mod==="kayit"?"new-password":"current-password"}"></label>
   <label class="satir"><input type="checkbox" name="hatirla" ${hatirla?"checked":""}> Beni hatırla</label>
   <button class="b ana genis" type="submit">${mod === "kayit" ? "Hesap oluştur" : "Giriş yap"}</button>
   ${mod === "giris" ? `<p class="not"><a href="#" id="unuttum">Şifremi unuttum</a></p>` : `<p class="not">Kayıt olarak <a href="#/gizlilik">gizlilik metnini</a> kabul etmiş olursun.</p>`}
   <div class="durum" id="g-durum"></div></form></div>`;
  const f = $("#f"), durum = (m, hata) => { const d = $("#g-durum"); d.textContent = m; d.classList.toggle("hata", !!hata); };
  f.onsubmit = async e => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(f)); const btn = f.querySelector("button"); 
    yaz("am_hatirla", !!v.hatirla);
    if (mod === "kayit") {
      if (!v.ad.trim() || !v.soyad.trim()) return durum("Ad ve soyad zorunlu.", 1);
      if (!telOk(v.tel)) return durum("Telefon numarasını 05xx xxx xx xx biçiminde yaz.", 1);
    }
    btn.disabled = true; durum("Bekleyin…");
    const r = mod === "kayit"
      ? await db.auth.signUp({email:v.eposta.trim(), password:v.sifre, options:{data:{ad:v.ad.trim(), soyad:v.soyad.trim(), telefon:telDuz(v.tel)}, emailRedirectTo: location.origin + location.pathname + "#/profil"}})
      : await db.auth.signInWithPassword({email:v.eposta.trim(), password:v.sifre});
    btn.disabled = false;
    if (r.error) return durum(({"Invalid login credentials":"E-posta veya şifre hatalı.","User already registered":"Bu e-postayla zaten hesap var, giriş yap.","Email not confirmed":"E-postanı doğrulamadın. Gelen kutundaki bağlantıya tıkla.","Email signups are disabled":"Kayıtlar şu an kapalı, biraz sonra tekrar dene."})[r.error.message] || r.error.message, 1);
    if (mod === "kayit" && !r.data.session) return durum("Hesabın oluşturuldu. E-postana gelen doğrulama bağlantısına tıkla, sonra giriş yap.");
    if (hatirla !== !!v.hatirla) return location.reload();
    await hesapYukle(); location.hash = "#/profil";
  };
  const u = $("#unuttum"); if (u) u.onclick = async e => { e.preventDefault(); const ep = f.eposta.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(ep)) { f.eposta.focus(); return durum("Önce hesabına ait e-posta adresini yaz, sonra “Şifremi unuttum”a bas.", 1); }
    u.style.pointerEvents = "none"; durum("Gönderiliyor…");
    const r = await db.auth.resetPasswordForEmail(ep, {redirectTo: location.origin + location.pathname});
    u.style.pointerEvents = "";
    if (r.error) { const m = r.error.message || ""; return durum(/rate limit|only request this after/i.test(m) ? "Çok sık istek gönderildi. Birkaç dakika sonra tekrar dene." : "Gönderilemedi: " + m, 1); }
    durum(`Şifre yenileme bağlantısı ${ep} adresine gönderildi. Gelen kutunu ve spam klasörünü kontrol et.`); };
}

const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g,"+").replace(/_/g,"/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
async function pushAboneligi() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission === "denied") return null;
  if (await Notification.requestPermission() !== "granted") return null;
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, r) => setTimeout(() => r(new Error("sw")), 8000))]);
  return (await reg.pushManager.getSubscription()) || reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64(AM.VAPID_PUBLIC)});
}
function vProfil() {
  if (!KULLANICI) { vGiris("kayit"); return; }
  const H = HESAP || {}, pushVar = !!H.push;
  $("#ana").innerHTML = `<h1>Merhaba ${esc(H.ad || "")}</h1><p class="alt">${esc(H.eposta || KULLANICI.email)} · <a href="#" id="cikis">Çıkış yap</a></p>
  <div class="panel"><h2>Bildirimler</h2><p>Sana uygun yeni bir ilan yayımlandığı anda e-posta${pushVar ? " ve bu cihaza anlık bildirim" : ""} gönderilir.</p>
  <label class="satir"><input type="checkbox" id="b-eposta" ${H.bildirim !== false ? "checked" : ""}> E-posta bildirimi (${esc(H.eposta || "")})</label>
  <div class="arac"><button class="b ${pushVar ? "" : "ana"}" id="b-push">${pushVar ? "Anlık bildirim açık ✓ (yenile)" : "Bu cihazda anlık bildirimi aç"}</button></div>
  <p class="not">iPhone'da anlık bildirim için siteyi önce Paylaş → “Ana Ekrana Ekle” ile kur.</p><div class="durum" id="b-durum"></div></div>
  <div class="panel"><h2>Profilim</h2><div class="izgara">
   <label>Öğrenim düzeyi<select id="p-egitim">${secenek(EG, profil.egitim, "Seç")}</select></label>
   <label>Bölüm (varsa)<input id="p-bolum" value="${esc(profil.bolum)}" placeholder="ör. Bilgisayar Mühendisliği"></label>
   ${PUAN.map(p => `<label>KPSS ${p}<input type="number" inputmode="decimal" step="0.001" data-puan="${p}" value="${profil.puanlar?.[p] ?? ""}" placeholder="yoksa boş"></label>`).join("")}
  </div><div class="ilsec" id="ilsec"></div>
  <div class="arac" style="margin-top:12px"><button class="b ana genis" id="p-kaydet">Profili kaydet</button></div><div class="durum" id="p-durum"></div></div>
  <div class="panel"><h2>🔔 Takiplerim</h2><div id="takipler"></div></div>
  <div class="panel"><h2>Hesap bilgileri</h2><div class="izgara"><label>Ad *<input id="h-ad" value="${esc(H.ad||"")}"></label><label>Soyad *<input id="h-soyad" value="${esc(H.soyad||"")}"></label></div>
  <label>Telefon *<input id="h-tel" type="tel" inputmode="tel" value="${esc(H.telefon||"")}"></label><div class="arac" style="margin-top:10px"><button class="b" id="h-kaydet">Bilgileri güncelle</button></div><div class="durum" id="h-durum"></div>
  <button class="metin-btn" id="h-sil" style="color:var(--no)">Hesabımı kalıcı olarak sil</button></div>`;
  const yazD = (id, m, hata) => { const d = $(id); d.textContent = m; d.classList.toggle("hata", !!hata); };
  const secili = new Set(profil.iller || []); ilSecici($("#ilsec"), secili);
  const takipCiz = () => {
    const t = (profil.takip||[]).map(x => `<li><div><b>${esc(x.unvanlar?.[0]||"")}</b><small>${esc(x.kurum || "Tüm kurumlar")} · ${x.profilIlleri===false ? "Tüm Türkiye" : "Profilimdeki iller"}</small></div><button class="sil" data-t="${esc(x.id)}" aria-label="Kaldır">✕</button></li>`);
    const a = (profil.acilis||[]).map(id => { const i = ILANLAR.find(x => x.id === id); return i ? `<li><div><b>⏳ ${esc(i.baslik)}</b><small>Başvuru açılınca haber · ${i.basvuruBaslangic ? tarih(i.basvuruBaslangic) : ""}</small></div><button class="sil" data-a="${esc(id)}" aria-label="Kaldır">✕</button></li>` : ""; });
    $("#takipler").innerHTML = t.length + a.length ? `<ul class="takip-liste">${t.join("")}${a.join("")}</ul>` : `<p class="not">Henüz takip yok. İlan detayında “Bildirim al” ya da “Açılınca haber ver”e bas.</p>`;
    $("#takipler").querySelectorAll(".sil").forEach(b => b.onclick = async () => { if (b.dataset.t) profil.takip = profil.takip.filter(x => x.id !== b.dataset.t); else profil.acilis = profil.acilis.filter(x => x !== b.dataset.a); await profilKaydet(); takipCiz(); });
  };
  takipCiz();
  $("#cikis").onclick = async e => { e.preventDefault(); await db.auth.signOut(); KULLANICI = HESAP = null; ustHesap(); location.hash = "#/"; };
  $("#p-kaydet").onclick = async () => {
    const p = {...profil, egitim:$("#p-egitim").value, bolum:$("#p-bolum").value.trim(), puanlar:{}, iller:[...secili]};
    document.querySelectorAll("[data-puan]").forEach(x => { if (x.value) p.puanlar[x.dataset.puan] = +x.value; });
    profil = p; const r = await profilKaydet(); if (r.error) return yazD("#p-durum", "Kaydedilemedi: " + r.error.message, 1);
    yazD("#p-durum", "✓ Profil kaydedildi."); setTimeout(() => location.hash = "#/uygun", 700);
  };
  $("#b-eposta").onchange = async e => { const r = await hesapGuncelle({bildirim:e.target.checked}); yazD("#b-durum", r.error ? r.error.message : e.target.checked ? "✓ E-posta bildirimi açık." : "E-posta bildirimi kapatıldı.", !!r.error); };
  $("#b-push").onclick = async () => {
    if (Notification?.permission === "denied") return yazD("#b-durum", "Bildirimler tarayıcıda engelli. Adres çubuğundaki kilit simgesinden izin ver.", 1);
    let s = null; try { s = await pushAboneligi(); } catch {}
    if (!s) return yazD("#b-durum", "Bildirim izni verilmedi.", 1);
    const r = await hesapGuncelle({push:s.toJSON()}); if (r.error) return yazD("#b-durum", r.error.message, 1);
    vProfil(); yazD("#b-durum", "✓ Bu cihazda anlık bildirim açık.");
  };
  $("#h-sil").onclick = async () => {
    if (!confirm("Hesabın, profilin ve takiplerin kalıcı olarak silinecek. Emin misin?")) return;
    const r = await db.rpc("hesap_sil"); if (r.error) return yazD("#h-durum", "Silinemedi: " + r.error.message, 1);
    await db.auth.signOut(); KULLANICI = HESAP = null; localStorage.removeItem("am_profil"); ustHesap(); location.hash = "#/"; toast("Hesabın silindi", "Tüm verilerin kaldırıldı.");
  };
  $("#h-kaydet").onclick = async () => {
    const ad = $("#h-ad").value.trim(), soyad = $("#h-soyad").value.trim(), tel = $("#h-tel").value;
    if (!ad || !soyad) return yazD("#h-durum", "Ad ve soyad zorunlu.", 1);
    if (!telOk(tel)) return yazD("#h-durum", "Telefon numarasını 05xx xxx xx xx biçiminde yaz.", 1);
    const r = await hesapGuncelle({ad, soyad, telefon:telDuz(tel)}); yazD("#h-durum", r.error ? r.error.message : "✓ Güncellendi.", !!r.error); ustHesap();
  };
}
function ilSecici(kok, secili) {
  const sirali = ilSirali();
  kok.innerHTML = `<div class="ilsec-ust"><div><b>Çalışmak istediğin iller</b><small id="il-say"></small></div>
   <label class="anahtar"><input type="checkbox" id="il-tum"><span></span>Tüm Türkiye</label></div>
   <div id="il-govde"><div class="secililer" id="il-secili"></div>
   <input type="search" id="il-ara" class="il-ara" placeholder="İl ara… (ör. İzmir)" autocomplete="off">
   <div class="bolgeler">${Object.keys(BOLGE).map(b => `<button type="button" data-b="${b}">${b}</button>`).join("")}</div>
   <div class="il-liste" id="il-liste"></div></div>`;
  let ara = "";
  const ciz = () => {
    const tum = $("#il-tum").checked;
    $("#il-govde").hidden = tum;
    $("#il-say").textContent = tum || !secili.size ? "İl fark etmez · tüm ilanlar" : `${secili.size} il seçili`;
    $("#il-secili").innerHTML = [...secili].sort((a,b) => IL[a].localeCompare(IL[b],"tr")).map(k => `<button type="button" class="secili-cip" data-k="${k}">${IL[k]} <i>✕</i></button>`).join("") || `<span class="not">Henüz il seçmedin. Aşağıdan dokunarak seç.</span>`;
    const a = katla(ara);
    $("#il-liste").innerHTML = sirali.filter(([,v]) => !a || katla(v).includes(a)).map(([k,v]) => `<button type="button" class="ilcip ${secili.has(k)?"on":""}" data-k="${k}">${secili.has(k)?"✓ ":""}${v}</button>`).join("") || `<span class="not">Eşleşen il yok.</span>`;
    kok.querySelectorAll(".bolgeler button").forEach(b => { const l = BOLGE[b.dataset.b].split(" "); b.classList.toggle("on", l.every(x => secili.has(x))); });
  };
  $("#il-tum").checked = !secili.size;
  $("#il-tum").onchange = e => { if (e.target.checked) secili.clear(); ciz(); };
  $("#il-ara").oninput = e => { ara = e.target.value; ciz(); };
  kok.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.k) { secili.has(b.dataset.k) ? secili.delete(b.dataset.k) : secili.add(b.dataset.k); }
    else if (b.dataset.b) { const l = BOLGE[b.dataset.b].split(" "); const hepsi = l.every(x => secili.has(x)); l.forEach(x => hepsi ? secili.delete(x) : secili.add(x)); }
    else return;
    if (secili.size) $("#il-tum").checked = false;
    ciz();
  });
  ciz();
}
async function vSifre() {
  const {data:{session}} = await db.auth.getSession();
  if (!session) { $("#ana").innerHTML = `<div class="giris"><h1>Şifre <span class="vurgu">yenile</span></h1><div class="panel"><p>Bağlantının süresi dolmuş ya da daha önce kullanılmış.</p><a class="btn birincil genis" href="#/giris">Yeni bağlantı iste</a></div></div>`; return; }
  $("#ana").innerHTML = `<div class="giris"><h1>Yeni <span class="vurgu">şifre</span></h1><p class="alt">${esc(session.user.email)} hesabı için yeni şifreni belirle.</p>
  <form class="panel" id="sf"><label>Yeni şifre *<input name="s1" type="password" minlength="6" required autocomplete="new-password"></label>
  <label>Yeni şifre (tekrar) *<input name="s2" type="password" minlength="6" required autocomplete="new-password"></label>
  <button class="btn birincil genis" type="submit" style="margin-top:14px">Şifreyi kaydet</button><div class="durum" id="sf-durum"></div></form></div>`;
  const f = $("#sf"), d = $("#sf-durum");
  f.onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(f));
    const yazD = (m, h) => { d.textContent = m; d.classList.toggle("hata", !!h); };
    if (v.s1.length < 6) return yazD("Şifre en az 6 karakter olmalı.", 1);
    if (v.s1 !== v.s2) return yazD("Şifreler aynı değil.", 1);
    f.querySelector("button").disabled = true;
    const r = await db.auth.updateUser({password:v.s1}); f.querySelector("button").disabled = false;
    if (r.error) return yazD(/different from the old/i.test(r.error.message) ? "Yeni şifre eskisiyle aynı olamaz." : r.error.message, 1);
    yazD("✓ Şifren güncellendi. Yönlendiriliyorsun…"); await hesapYukle(); setTimeout(() => location.hash = "#/profil", 900); };
}
function vGizlilik() {
  $("#ana").innerHTML = `<h1>Gizlilik ve <span class="vurgu">hesap silme</span></h1>
  <div class="panel"><h2>Aday Memur — toplanan veriler</h2><p>Bu metin Aday Memur internet sitesi ve Aday Memur Android uygulaması (geliştirici: selcukyus) için geçerlidir. İlanlara hesapsız bakabilirsin. Hesap oluşturursan ad, soyad, telefon, e-posta, şifre (şifrelenmiş), profil tercihlerin (öğrenim, bölüm, KPSS puanı, iller), takiplerin, kayıtlı ilanların ve bildirim izni verdiğin cihazın bildirim adresi saklanır.</p>
  <p>Bu bilgiler yalnızca hesabını sunmak ve sana uygun yeni ilanları e-posta (Brevo) ve anlık bildirimle iletmek için kullanılır; satılmaz, reklam için paylaşılmaz. Telefon numarasına SMS gönderilmez. Sitede analiz veya izleme aracı yoktur.</p></div>
  <div class="panel" id="hesap-silme"><h2>Hesabını ve verilerini silme</h2>
  <p><b>Uygulamada:</b> Aday Memur uygulaması → Hesap sekmesi → Hesabım → “Hesabımı sil” → “Kalıcı olarak sil”.</p>
  <p><b>Sitede:</b> Giriş yap → Hesabım → Hesap bilgileri → “Hesabımı kalıcı olarak sil”.</p>
  <p><b>E-postayla:</b> Kayıtlı e-posta adresinden <a href="mailto:selcukyuss@gmail.com?subject=Aday%20Memur%20hesap%20silme">selcukyuss@gmail.com</a> adresine “hesabımı sil” yaz; talep en geç 7 gün içinde işlenir.</p>
  <p><b>Silinen veriler:</b> ad, soyad, telefon, e-posta, şifre, profil tercihleri, takipler, kayıtlı ilanlar ve bildirim adresi. Silme anında ve kalıcıdır; yedeklerde veri tutulmaz. Google Play aboneliği ayrı yönetilir; aboneliği Google Play → Abonelikler bölümünden iptal etmelisin.</p>
  <p>E-posta bildirimini kapatmak için Hesabım sayfasındaki seçeneği ya da her e-postadaki bağlantıyı kullanabilirsin.</p></div>`;
}
async function iptal(t) {
  $("#ana").innerHTML = `<p class="bos">İşleniyor…</p>`;
  const r = await sb("rpc/abonelik_iptal", {t}).catch(() => null);
  $("#ana").innerHTML = `<div class="panel"><h1>${r && r.ok ? "Abonelikten çıktın" : "İşlem tamamlanamadı"}</h1><p>${r && r.ok ? "Artık e-posta ve bildirim almayacaksın. İstediğin zaman yeniden açabilirsin." : "Lütfen biraz sonra tekrar dene."}</p><a href="#/">İlanlara dön</a></div>`;
}

function yonlendir() {
  const h = location.hash.slice(2), [s, x] = h.split("/");
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.dataset.s === ({giris:"profil",kayit:"profil"}[s] || s || "ilanlar")));
  window.scrollTo(0, 0);
  ({"":vIlanlar, uygun:vUygun, kayitli:vKayitli, gundem:vGundem, profil:vProfil, giris:() => vGiris("giris"), kayit:() => vGiris("kayit"), gizlilik:vGizlilik, sifre:vSifre, ilan:() => vIlan(decodeURIComponent(x))}[s] || vIlanlar)();
}
const tema = () => { const k = oku("am_tema", matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("koyu", k); document.querySelector("meta[name=theme-color]").content = k ? "#0F1115" : "#F4F6F9"; };
$("#tema").onclick = () => { yaz("am_tema", !document.documentElement.classList.contains("koyu")); tema(); };
tema();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
(async () => {
  const q = new URLSearchParams(location.search).get("iptal");
  try { const d = await (await fetch("data/ilanlar.json", {cache:"no-cache"})).json(); ILANLAR = d.ilanlar; GUNCEL = d.guncelleme; }
  catch { $("#ana").innerHTML = `<p class="bos">İlanlar yüklenemedi. İnternet bağlantını kontrol et.</p>`; }
  try { await hesapYukle(); } catch {}
  if (KURTARMA) history.replaceState(null, "", location.pathname + "#/sifre");
  else if (LINK_HATA) { history.replaceState(null, "", location.pathname + "#/giris"); setTimeout(() => toast("Bağlantı geçersiz", "Şifre yenileme bağlantısının süresi dolmuş ya da kullanılmış. Yeniden iste."), 300); }
  sayac();
  if (q) return iptal(q);
  addEventListener("hashchange", yonlendir); yonlendir();
})();

// ---- Google Play ----
document.addEventListener("click", e => {
  const a = e.target.closest("[data-play]"); if (!a) return;
  if (AM.PLAY_URL) { a.href = AM.PLAY_URL; a.target = "_blank"; return; }
  e.preventDefault();
  let t = document.querySelector(".yakinda");
  if (!t) { t = document.createElement("div"); t.className = "yakinda"; document.body.appendChild(t); }
  t.innerHTML = `<b>Yakında Google Play'de</b><span>Aday Memur Android uygulaması inceleme aşamasında. Yayınlandığında bu düğmeden indirebileceksin.</span>`;
  t.classList.add("acik"); clearTimeout(t._z); t._z = setTimeout(() => t.classList.remove("acik"), 3500);
});
