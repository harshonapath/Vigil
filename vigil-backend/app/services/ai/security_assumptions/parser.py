import json
import re
from typing import Any, Dict

from app.services.ai.exceptions import AIResponseError
from app.services.ai.security_assumptions.schemas import SecurityAssumptionExtraction


class SecurityAssumptionParser:
    """Strict parser for assumption responses; never converts malformed text to zero findings."""

    def parse(self, content: str) -> SecurityAssumptionExtraction:
        text = (content or "").strip()
        if not text:
            raise AIResponseError("AI provider returned an empty security assumption response.")
        try:
            data: Any = json.loads(text)
        except json.JSONDecodeError:
            match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, flags=re.IGNORECASE | re.DOTALL)
            if not match:
                raise AIResponseError("Security assumption response was not valid JSON.")
            try:
                data = json.loads(match.group(1))
            except json.JSONDecodeError as exc:
                raise AIResponseError("Fenced security assumption response contained invalid JSON.") from exc
        if not isinstance(data, Dict):
            raise AIResponseError("Security assumption response must be a JSON object.")
        try:
            return SecurityAssumptionExtraction.model_validate(data)
        except Exception as exc:
            raise AIResponseError("Security assumption response did not match the required schema.") from exc
