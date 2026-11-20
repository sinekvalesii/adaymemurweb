from __future__ import annotations

from dataclasses import asdict, dataclass, field


class SourceError(Exception):
    """Kaynak beklenen biçimde yanıt vermedi."""


@dataclass
class Ham:
    """Kaynaktan gelen ham ilan."""
    kaynak: str            # kariyerkapisi | ilangov | iskur
    kid: str               # kaynaktaki kimlik
    baslik: str
    url: str
    kurum: str = ""
    kategori: str = ""
    yayin: str | None = None        # ISO tarih
    il: str | None = None           # plaka kodu (kaynak verdiyse)
    son_basvuru: str | None = None  # kaynak verdiyse
    adet: int | None = None
    logo: str | None = None
    metin: str = ""                 # detay metni (zenginleştirildiyse)
    extra: dict = field(default_factory=dict)

    @property
    def id(self) -> str:
        pre = {"kariyerkapisi": "kk", "ilangov": "ig", "iskur": "is"}[self.kaynak]
        return f"{pre}-{self.kid}"

    def to_dict(self) -> dict:
        return asdict(self)
