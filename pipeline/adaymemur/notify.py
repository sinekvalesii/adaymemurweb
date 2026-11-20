"""Firebase Cloud Messaging (HTTP v1) ile konu bazlı bildirim.

Konular:
  pro            Pro aboneler — her yeni ilan anında
  il_all / il_XX Pro kullanıcının il tercihi (XX = plaka kodu)
  free           Ücretsiz kullanıcılar — günlük özet
FIREBASE_SERVICE_ACCOUNT (JSON) tanımlı değilse bildirim gönderilmez.
"""
from __future__ import annotations

import json
import logging
import os

import requests

log = logging.getLogger(__name__)
SCOPE = "https://www.googleapis.com/auth/firebase.messaging"


class Notifier:
    def __init__(self, dry_run: bool = False) -> None:
        self.dry_run = dry_run
        self.sent = 0
        self._token = None
        self._project = None
        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
        if raw:
            from google.auth.transport.requests import Request
            from google.oauth2 import service_account
            info = json.loads(raw)
            creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
            creds.refresh(Request())
            self._token = creds.token
            self._project = info["project_id"]

    @property
    def active(self) -> bool:
        return bool(self._token) or self.dry_run

    def send(self, *, title: str, body: str, data: dict, topic: str | None = None, condition: str | None = None) -> bool:
        msg = {
            "notification": {"title": title, "body": body},
            "data": {k: str(v) for k, v in data.items()},
            "android": {"priority": "high", "notification": {"channel_id": "ilanlar", "color": "#F1D23A"}},
        }
        if topic:
            msg["topic"] = topic
        else:
            msg["condition"] = condition
        if self.dry_run or not self._token:
            log.info("[bildirim] %s | %s | %s", topic or condition, title, body)
            return self.dry_run
        r = requests.post(
            f"https://fcm.googleapis.com/v1/projects/{self._project}/messages:send",
            headers={"Authorization": f"Bearer {self._token}"}, json={"message": msg}, timeout=30,
        )
        if r.ok:
            self.sent += 1
            return True
        log.warning("FCM hata %s: %s", r.status_code, r.text[:300])
        return False


def pro_condition(iller: list[str]) -> str:
    if not iller or len(iller) > 3:
        return "'pro' in topics"
    alt = " || ".join(["'il_all' in topics"] + [f"'il_{k}' in topics" for k in iller])
    return f"'pro' in topics && ({alt})"
