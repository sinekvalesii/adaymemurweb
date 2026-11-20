# Aday Memur — web

Kamu personel alım ilanları resmî kaynaklardan (Kariyer Kapısı, ilan.gov.tr, İŞKUR, ÖSYM). Ücretsiz, tüm özellikler açık: KPSS filtreleri, Bana Uygun eşleştirmesi, kayıtlı ilanlar, KPSS gündemi, kişiye özel e-posta ve anlık bildirim.

- `site/` statik web uygulaması (PWA)
- `pipeline/` ilan toplayıcı
- `notify/bildir.py` yeni ilanları abonelerin profiline göre eşleştirip Brevo e-postası ve web push gönderir
- `.github/workflows/yayin.yml` 30 dakikada bir çalışır

Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `BREVO_API_KEY`, `VAPID_PRIVATE`.

Yapım: selcukyus
