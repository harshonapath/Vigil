import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PromptInjectionDetectionResult(BaseModel):
    """Structured result returned by PromptInjectionDetector."""
    model_config = ConfigDict(extra="ignore")

    detected: bool = False
    severity: str = "HIGH"
    reason: str = ""
    matched_indicators: List[str] = Field(default_factory=list)
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    evidence: Optional[str] = None


# High-confidence prompt injection patterns
INJECTION_PATTERNS = [
    (
        re.compile(
            r"(?i)\b(?:ignore|disregard|override|forget)\s+(?:all\s+)?(?:previous|prior|system|developer|assistant|above)\s+(?:instructions|directives|prompts|rules|guidelines|messages)\b"
        ),
        "Instruction override attempt ('ignore/disregard/override previous instructions')",
    ),
    (
        re.compile(
            r"(?i)\b(?:ignore|disregard)\s+the\s+(?:system|developer)\s+(?:prompt|message|instructions)\b"
        ),
        "System prompt override attempt",
    ),
    (
        re.compile(
            r"(?i)\b(?:reveal|show|print|display|dump|output)\s+(?:your|the)\s+(?:system\s+prompt|system\s+instructions|developer\s+message|hidden\s+instructions)\b"
        ),
        "Prompt extraction attempt ('reveal system prompt')",
    ),
    (
        re.compile(
            r"(?i)\b(?:you\s+are\s+now|act\s+as)\s+(?:a|an)?\s*(?:unrestricted|jailbroken|evil|dan|developer|system|helpful\s+assistant\s+that\s+ignores)\b"
        ),
        "Role-play / persona hijacking attempt ('you are now / act as')",
    ),
    (
        re.compile(
            r"(?i)\b(?:follow\s+these\s+instructions\s+instead|new\s+instructions\s*:)\b"
        ),
        "Instruction replacement directive",
    ),
    (
        re.compile(
            r"(?i)\b(?:do\s+not|never)\s+report\s+(?:any\s+)?(?:vulnerabilities|bugs|flaws|security\s+issues|findings|defects)\b"
        ),
        "Vulnerability suppression directive ('do not report vulnerabilities')",
    ),
    (
        re.compile(
            r"(?i)\b(?:do\s+not|never)\s+mention\s+(?:any\s+)?(?:vulnerabilities|bugs|flaws|security\s+issues|findings)\b"
        ),
        "Vulnerability suppression directive ('do not mention vulnerabilities')",
    ),
    (
        re.compile(
            r"(?i)\b(?:tell|inform)\s+the\s+reviewer\s+(?:that\s+)?(?:this\s+code\s+is\s+safe|secure|clean|audited)\b"
        ),
        "Reviewer deception directive ('tell the reviewer this code is safe')",
    ),
    (
        re.compile(
            r"(?i)^\s*(?:system\s+message|developer\s+message|assistant\s+instructions)\s*:"
        ),
        "Pseudo-system prompt header injection",
    ),
]


class PromptInjectionDetector:
    """Deterministic prompt injection detector for repository-derived content."""

    def detect_in_text(
        self,
        text: str,
        file_path: Optional[str] = None,
    ) -> Optional[PromptInjectionDetectionResult]:
        """Scans a block of text for prompt injection patterns.

        Returns a PromptInjectionDetectionResult if a match is found, or None if clean.
        """
        if not text or not text.strip():
            return None

        lines = text.splitlines()

        for idx, line in enumerate(lines, start=1):
            for pattern, reason_msg in INJECTION_PATTERNS:
                match = pattern.search(line)
                if match:
                    matched_str = match.group(0).strip()
                    return PromptInjectionDetectionResult(
                        detected=True,
                        severity="HIGH",
                        reason=f"Instruction-like content detected: {reason_msg}",
                        matched_indicators=[matched_str],
                        file_path=file_path,
                        line_number=idx,
                        evidence=line.strip(),
                    )

        return None

    def detect_in_diff(
        self,
        file_path: str,
        diff_patch: str,
    ) -> Optional[PromptInjectionDetectionResult]:
        """Scans a git unified diff patch for prompt injection in added lines.

        Extracts real line numbers from diff chunk headers (@@ -x,y +a,b @@).
        """
        if not diff_patch:
            return None

        current_target_line = 1
        lines = diff_patch.splitlines()

        for line in lines:
            if line.startswith("@@"):
                # Chunk header e.g. @@ -10,5 +15,8 @@
                m = re.search(r"\+(\d+)", line)
                if m:
                    current_target_line = int(m.group(1))
                continue

            # Only check added or modified lines (starting with '+')
            is_added = line.startswith("+") and not line.startswith("+++")
            check_text = line[1:] if is_added else line

            for pattern, reason_msg in INJECTION_PATTERNS:
                match = pattern.search(check_text)
                if match:
                    matched_str = match.group(0).strip()
                    return PromptInjectionDetectionResult(
                        detected=True,
                        severity="HIGH",
                        reason=f"Instruction-like content detected in code diff: {reason_msg}",
                        matched_indicators=[matched_str],
                        file_path=file_path,
                        line_number=current_target_line if is_added else None,
                        evidence=line.strip(),
                    )

            if is_added or (not line.startswith("-") and not line.startswith("\\")):
                current_target_line += 1

        return None

    def scan_context(self, context: Any) -> List[PromptInjectionDetectionResult]:
        """Scans an entire ReviewContext (changed files, PR description, commit messages)

        and returns a list of all detected prompt injection instances.
        """
        results: List[PromptInjectionDetectionResult] = []

        # 1. Check PR Description
        if hasattr(context, "pull_request") and context.pull_request:
            if context.pull_request.description:
                res = self.detect_in_text(
                    context.pull_request.description,
                    file_path="PR Description",
                )
                if res:
                    results.append(res)

        # 2. Check Commits
        if hasattr(context, "commits") and context.commits:
            for commit in context.commits:
                if commit.message:
                    res = self.detect_in_text(
                        commit.message,
                        file_path=f"Commit [{commit.sha[:8] if commit.sha else 'N/A'}]",
                    )
                    if res:
                        results.append(res)

        # 3. Check Changed Files & Diffs
        if hasattr(context, "changed_files") and context.changed_files:
            for cf in context.changed_files:
                file_path = cf.file_path or "unknown_file"
                if cf.diff_patch:
                    res = self.detect_in_diff(file_path, cf.diff_patch)
                    if res:
                        results.append(res)
                elif cf.file_content:
                    res = self.detect_in_text(cf.file_content, file_path=file_path)
                    if res:
                        results.append(res)

        return results


prompt_injection_detector = PromptInjectionDetector()
