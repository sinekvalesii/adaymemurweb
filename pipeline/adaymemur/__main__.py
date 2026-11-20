"""Kullanım:
  python -m adaymemur --out site                # tüm kaynaklar
  python -m adaymemur --out site --only ilangov # tek kaynak
  python -m adaymemur --out site --state-file state.json.gz --dry-run
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from .build import run


def main() -> int:
    ap = argparse.ArgumentParser(prog="adaymemur")
    ap.add_argument("--out", required=True, type=Path, help="Yayın klasörü (GitHub Pages kökü)")
    ap.add_argument("--state-url", default=os.environ.get("STATE_URL"), help="Önceki _state.json.gz adresi")
    ap.add_argument("--state-file", type=Path, help="Yerel durum dosyası (test için)")
    ap.add_argument("--content", type=Path, help="Elle düzenlenen JSON içerikler (takvim, duyurular)")
    ap.add_argument("--only", nargs="*", help="Yalnızca bu kaynaklar")
    ap.add_argument("--no-notify", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="Bildirimleri göndermeden logla")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    summary = run(a.out, state_url=a.state_url, local_state=a.state_file, only=a.only,
                  notify=not a.no_notify, dry_run=a.dry_run, content_dir=a.content)
    ok = any(v.get("ok") for v in summary["kaynaklar"].values())
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("## Aday Memur veri güncellemesi\n\n")
            f.write(f"- Yayındaki ilan: **{summary['ilan']}** · yeni: **{summary['yeni']}** · bildirim: {summary['bildirim']}\n")
            for k, v in summary["kaynaklar"].items():
                f.write(f"- {k}: {'✅ ' + str(v.get('adet')) if v.get('ok') else '❌ ' + v.get('hata', '')}\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
