from __future__ import annotations

import tempfile
from pathlib import Path

import certifi
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

UA = "AdayMemurBot/1.0 (+https://github.com/sinekvalesii/adaymemur; resmi ilan takibi)"

# Bazı .gov.tr siteleri ara sertifikayı göndermiyor; eksik ara sertifika certs/ içinde.
_CERTS = Path(__file__).resolve().parent / "certs"


def _ca_bundle() -> str:
    bundle = Path(tempfile.gettempdir()) / "adaymemur-ca.pem"
    parts = [Path(certifi.where()).read_text()] + [p.read_text() for p in sorted(_CERTS.glob("*.pem"))]
    bundle.write_text("\n".join(parts))
    return str(bundle)


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = UA
    s.headers["Accept-Language"] = "tr-TR,tr;q=0.9"
    s.verify = _ca_bundle()
    retry = Retry(total=2, connect=1, backoff_factor=3,
                  status_forcelist=(429, 500, 502, 503, 504), allowed_methods=None)
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s
