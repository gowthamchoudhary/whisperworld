from __future__ import annotations

import asyncio
import json
import re
from typing import Literal

import google.generativeai as genai
from pydantic import BaseModel

from app.core.config import GEMINI_API_KEY

CreatureCategory = Literal[
    "flower", "insect", "tree", "squirrel", "mushroom", "bird", "default"
]

_VALID_CATEGORIES: set[str] = {
    "flower", "insect", "tree", "squirrel", "mushroom", "bird", "default"
}

_PROMPT = (
    "Analyse the image and identify every living subject (plants, insects, animals, fungi).\n"
    "Return a JSON array — no markdown, no extra text — where each element has exactly these fields:\n"
    "  species      (string)  — scientific name\n"
    "  commonName   (string)  — common English name\n"
    "  habitat      (string)  — typical habitat description\n"
    "  confidence   (number)  — your confidence from 0.0 to 1.0\n"
    "  category     (string)  — one of: flower, insect, tree, squirrel, mushroom, bird, default\n"
    "If no living subject is visible, return an empty array []."
)


class IdentificationResult(BaseModel):
    species: str
    common_name: str
    habitat: str
    confidence: float
    category: CreatureCategory


class NoCreatureError(Exception):
    """Raised when no living subject is detected in the image."""


class VisionUnavailableError(Exception):
    """Raised on API timeout or general API failure."""


def _normalise_category(raw: str) -> CreatureCategory:
    value = raw.strip().lower()
    return value if value in _VALID_CATEGORIES else "default"  # type: ignore[return-value]


async def _call_gemini(image_bytes: bytes) -> list[IdentificationResult]:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")

    image_part = {"mime_type": "image/jpeg", "data": image_bytes}
    response = await asyncio.to_thread(
        model.generate_content,
        [_PROMPT, image_part],
    )

    text = response.text.strip()
    # Strip optional markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    raw_list: list[dict] = json.loads(text)

    results: list[IdentificationResult] = []
    for item in raw_list:
        results.append(
            IdentificationResult(
                species=item["species"],
                common_name=item["commonName"],
                habitat=item["habitat"],
                confidence=float(item["confidence"]),
                category=_normalise_category(item.get("category", "")),
            )
        )
    return results


async def identify(image_bytes: bytes) -> list[IdentificationResult]:
    """Identify living subjects in *image_bytes* using Gemini Vision.

    Returns a list of :class:`IdentificationResult` objects.

    Raises:
        NoCreatureError: when no living subject is detected.
        VisionUnavailableError: on timeout (>10 s) or API failure.
    """
    try:
        results = await asyncio.wait_for(_call_gemini(image_bytes), timeout=10.0)
    except asyncio.TimeoutError as exc:
        raise VisionUnavailableError("Gemini Vision timed out after 10 s") from exc
    except Exception as exc:
        raise VisionUnavailableError(f"Gemini Vision API error: {exc}") from exc

    if not results:
        raise NoCreatureError("No living subject detected in the image")

    return results
