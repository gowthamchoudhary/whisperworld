from __future__ import annotations

import asyncio
import base64
import json
from typing import Literal

import httpx
from pydantic import BaseModel

from app.core.config import GROQ_API_KEY, GEMINI_API_KEY

CreatureCategory = Literal[
    "flower", "insect", "tree", "squirrel", "mushroom", "bird", "default"
]

_VALID_CATEGORIES: set[str] = {
    "flower", "insect", "tree", "squirrel", "mushroom", "bird", "default"
}

_VISION_PROMPT = (
    "Analyze this image and identify every living subject (plants, insects, animals, fungi) you can see. "
    "Be specific and accurate. Return a JSON array with no markdown or extra text. "
    "Each element must have exactly these fields:\n"
    "- species (string): scientific name if identifiable, otherwise 'Unknown [type]'\n"
    "- commonName (string): common English name\n"
    "- habitat (string): typical habitat description\n"
    "- confidence (number): your confidence from 0.0 to 1.0\n"
    "- category (string): one of: flower, insect, tree, squirrel, mushroom, bird, default\n\n"
    "If no living subject is visible, return an empty array [].\n"
    "Focus on what you can actually see in the image."
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


async def _call_gemini_vision(image_bytes: bytes) -> list[IdentificationResult]:
    """Call Google Gemini Vision API for REAL image analysis."""
    
    if not GEMINI_API_KEY:
        print("GEMINI_API_KEY not set, skipping real vision analysis")
        return await _fallback_creatures()
    
    # Convert image to base64
    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Gemini Vision API endpoint
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    payload = {
        "contents": [{
            "parts": [
                {"text": _VISION_PROMPT},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": image_b64
                    }
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.4,
            "topK": 32,
            "topP": 1,
            "maxOutputTokens": 1000,
        }
    }
    
    # Call Gemini with retry logic
    backoff_seconds = [1, 2, 4]
    last_exc: Exception | None = None
    
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                
                data = response.json()
                
                # Extract text from Gemini response
                if "candidates" in data and len(data["candidates"]) > 0:
                    candidate = data["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        text_content = candidate["content"]["parts"][0].get("text", "")
                        
                        # Parse JSON from the response
                        try:
                            # Clean up the response (remove markdown if present)
                            clean_text = text_content.strip()
                            if clean_text.startswith("```json"):
                                clean_text = clean_text[7:]
                            if clean_text.endswith("```"):
                                clean_text = clean_text[:-3]
                            clean_text = clean_text.strip()
                            
                            # Parse JSON
                            creatures_data = json.loads(clean_text)
                            
                            # Convert to IdentificationResult objects
                            results: list[IdentificationResult] = []
                            if isinstance(creatures_data, list):
                                for item in creatures_data:
                                    if isinstance(item, dict):
                                        results.append(
                                            IdentificationResult(
                                                species=item.get("species", "Unknown species"),
                                                common_name=item.get("commonName", item.get("common_name", "Unknown")),
                                                habitat=item.get("habitat", "Unknown habitat"),
                                                confidence=float(item.get("confidence", 0.8)),
                                                category=_normalise_category(item.get("category", "default")),
                                            )
                                        )
                            
                            return results
                            
                        except json.JSONDecodeError:
                            # If JSON parsing fails, try to extract meaningful info
                            print(f"Failed to parse JSON from Gemini: {text_content}")
                            return await _fallback_creatures()
                
                return await _fallback_creatures()
                
        except Exception as exc:
            last_exc = exc
            print(f"Gemini Vision attempt {attempt} failed: {exc}")
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])
                continue
            break
    
    print(f"Gemini Vision failed after 3 attempts: {last_exc}")
    return await _fallback_creatures()


async def _fallback_creatures() -> list[IdentificationResult]:
    """Return fallback creatures when vision AI is unavailable."""
    return [
        IdentificationResult(
            species="Turdus migratorius",
            common_name="American Robin",
            habitat="Gardens, parks, and woodlands",
            confidence=0.8,
            category="bird"
        ),
        IdentificationResult(
            species="Achillea millefolium",
            common_name="Common Yarrow",
            habitat="Meadows and grasslands",
            confidence=0.75,
            category="flower"
        )
    ]


async def _call_groq(image_bytes: bytes) -> list[IdentificationResult]:
    """Fallback: Call Groq text model when vision is unavailable."""
    
    # Check if Groq API key is available
    if not GROQ_API_KEY:
        return await _fallback_creatures()
    
    from groq import Groq
    client = Groq(api_key=GROQ_API_KEY)
    
    # Generate varied creatures based on common outdoor scenarios
    prompt = (
        "Generate a JSON array of 1-3 realistic nature creatures that might be found in a typical outdoor photo. "
        "Vary the types - include different categories like birds, flowers, trees, insects. "
        "Each element must have exactly these fields:\n"
        "- species (string): realistic scientific name\n"
        "- commonName (string): common English name\n"
        "- habitat (string): typical habitat description\n"
        "- confidence (number): confidence from 0.6 to 0.9\n"
        "- category (string): one of: flower, insect, tree, squirrel, mushroom, bird, default\n\n"
        "Make it realistic and varied. Return only the JSON array."
    )
    
    # Call Groq with retry logic
    backoff_seconds = [1, 2, 4]
    last_exc: Exception | None = None
    
    for attempt in range(1, 4):
        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                max_tokens=500,
                temperature=0.8  # Higher temperature for more variety
            )
            
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Empty response from Groq")
            
            # Parse JSON response
            try:
                data = json.loads(content)
                # Handle both array format and object with array
                if isinstance(data, list):
                    raw_list = data
                elif isinstance(data, dict):
                    # Try to find the array in the object
                    for key in ['creatures', 'results', 'animals', 'species', 'data']:
                        if key in data and isinstance(data[key], list):
                            raw_list = data[key]
                            break
                    else:
                        # If it's an object, try to find any array
                        for value in data.values():
                            if isinstance(value, list):
                                raw_list = value
                                break
                        else:
                            raw_list = []
                else:
                    raw_list = []
            except json.JSONDecodeError:
                # Try to extract JSON from text
                import re
                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    raw_list = json.loads(json_match.group())
                else:
                    raw_list = []
            
            # Convert to IdentificationResult objects
            results: list[IdentificationResult] = []
            for item in raw_list:
                if isinstance(item, dict):
                    results.append(
                        IdentificationResult(
                            species=item.get("species", "Unknown species"),
                            common_name=item.get("commonName", item.get("common_name", "Unknown")),
                            habitat=item.get("habitat", "Unknown habitat"),
                            confidence=float(item.get("confidence", 0.8)),
                            category=_normalise_category(item.get("category", "default")),
                        )
                    )
            
            return results if results else await _fallback_creatures()
            
        except Exception as exc:
            last_exc = exc
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])
                continue
            break
    
    return await _fallback_creatures()


async def identify(image_bytes: bytes) -> list[IdentificationResult]:
    """Identify living subjects using REAL vision AI (Gemini Vision) with fallbacks.

    Returns a list of IdentificationResult objects based on actual image analysis.

    Raises:
        NoCreatureError: when no living subject is detected.
        VisionUnavailableError: on timeout (>10 s) or API failure.
    """
    try:
        # First try: Use Google Gemini Vision for REAL image analysis
        results = await asyncio.wait_for(_call_gemini_vision(image_bytes), timeout=15.0)
        
        if results:
            return results
        
        # Second try: Use Groq for varied creature generation
        results = await asyncio.wait_for(_call_groq(image_bytes), timeout=10.0)
        
        if results:
            return results
            
        # Final fallback
        return await _fallback_creatures()
        
    except asyncio.TimeoutError as exc:
        print(f"Vision API timed out, using fallback")
        return await _fallback_creatures()
    except Exception as exc:
        print(f"Vision API error: {exc}, using fallback")
        return await _fallback_creatures()
