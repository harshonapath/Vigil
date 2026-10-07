import ast
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from app.services.ai.context.schemas import ChangedFileContext, ReviewContext
from app.services.ai.review.schemas import (
    FindingCategory,
    FindingConfidence,
    FindingSeverity,
    ReviewFinding,
)
from app.services.ai.security_assumptions.registry import SecurityAssumptionRegistry
from app.services.ai.security_assumptions.schemas import (
    AssumptionChangeType,
    AssumptionScope,
    SecurityAssumption,
    SecurityAssumptionDetectionResult,
)


class SecurityAssumptionAnalyzer:
    """Deterministic analyzer that compares security & behavioral assumptions before and after PR changes.

    Identifies removed, weakened, contradicted, or changed security assumptions across:
    - Authentication (endpoints, dependencies)
    - Authorization (ownership checks, role checks)
    - Input types (int -> str, required -> Optional)
    - Validation constraints (Pydantic Field bounds, value ranges)
    - State preconditions
    """

    def __init__(self, registry: Optional[SecurityAssumptionRegistry] = None):
        self.registry = registry or SecurityAssumptionRegistry()

    def scan_context(self, context: ReviewContext) -> List[ReviewFinding]:
        """Scans all changed files in the ReviewContext for security assumption regressions."""
        findings: List[ReviewFinding] = []
        if not context.changed_files:
            return findings

        # Check repository-wide context for global auth middleware
        has_global_auth_middleware = False
        if context.repository and context.repository.file_paths:
            for p in context.repository.file_paths:
                if "middleware" in p.lower() and "auth" in p.lower():
                    has_global_auth_middleware = True
                    break

        for changed_file in context.changed_files:
            results = self.analyze_file_change(
                changed_file=changed_file,
                has_global_auth_middleware=has_global_auth_middleware,
            )
            for res in results:
                if res.detected:
                    finding = ReviewFinding(
                        category=FindingCategory.SECURITY_ASSUMPTION,
                        severity=res.severity,
                        confidence=res.confidence,
                        title=res.title,
                        file=res.file_path,
                        line=res.line_number,
                        problem=res.problem,
                        why=res.why,
                        evidence=res.evidence,
                        suggestion=res.suggestion,
                        assumption_name=res.assumption_name,
                        scope=res.scope,
                        previous_assumption=res.previous_assumption,
                        new_assumption=res.new_assumption,
                        change_type=res.change_type.value if hasattr(res.change_type, "value") else str(res.change_type),
                        potential_repercussions=res.potential_repercussions,
                        source="SECURITY_ASSUMPTION_ANALYZER",
                        is_grounded=True,
                    )
                    findings.append(finding)

        return findings

    def analyze_file_change(
        self,
        changed_file: ChangedFileContext,
        has_global_auth_middleware: bool = False,
    ) -> List[SecurityAssumptionDetectionResult]:
        """Analyzes a single changed file by comparing baseline assumptions vs modified assumptions."""
        results: List[SecurityAssumptionDetectionResult] = []
        file_path = changed_file.file_path

        old_content = changed_file.old_content
        new_content = changed_file.new_content or changed_file.file_content
        diff_patch = changed_file.diff_patch or ""

        # If old_content is not explicitly provided, attempt extraction from diff_patch
        if not old_content and diff_patch:
            old_content, new_from_diff = self._reconstruct_from_diff(diff_patch)
            if not new_content:
                new_content = new_from_diff

        if not old_content and not new_content and not diff_patch:
            return results

        # 1. Extract assumptions from old and new code
        old_assumptions = self.registry.extract_assumptions(old_content or "", file_path)
        new_assumptions = self.registry.extract_assumptions(new_content or "", file_path)

        # 2. Compare baseline assumptions vs modified assumptions
        results.extend(
            self._compare_assumptions(
                old_assumptions=old_assumptions,
                new_assumptions=new_assumptions,
                old_content=old_content or "",
                new_content=new_content or "",
                diff_patch=diff_patch,
                file_path=file_path,
                has_global_auth_middleware=has_global_auth_middleware,
            )
        )

        # 3. Direct Diff Line Analysis fallback (if AST diff doesn't catch pure diff removals)
        if diff_patch and not results:
            results.extend(
                self._analyze_diff_lines(
                    diff_patch=diff_patch,
                    file_path=file_path,
                    has_global_auth_middleware=has_global_auth_middleware,
                )
            )

        return results

    def _compare_assumptions(
        self,
        old_assumptions: List[SecurityAssumption],
        new_assumptions: List[SecurityAssumption],
        old_content: str,
        new_content: str,
        diff_patch: str,
        file_path: str,
        has_global_auth_middleware: bool,
    ) -> List[SecurityAssumptionDetectionResult]:
        results: List[SecurityAssumptionDetectionResult] = []

        # Index new assumptions by (scope, target)
        new_by_target: Dict[Tuple[str, str], SecurityAssumption] = {
            (a.scope.value, a.target): a for a in new_assumptions
        }

        # Check for removed or weakened old assumptions
        for old in old_assumptions:
            target_key = (old.scope.value, old.target)

            # A. Authentication Assumption Removed/Weakened
            if old.scope == AssumptionScope.AUTHENTICATION:
                # Did any new auth assumption match this target?
                matched_new = new_by_target.get(target_key)
                if not matched_new:
                    # Also check if endpoint/function still exists in new_content
                    func_or_target_name = old.target.split(":")[-1].split("/")[-1]
                    if func_or_target_name in new_content:
                        # Check if global middleware covers it
                        if not has_global_auth_middleware:
                            results.append(
                                SecurityAssumptionDetectionResult(
                                    detected=True,
                                    severity=FindingSeverity.HIGH,
                                    confidence=FindingConfidence.HIGH,
                                    title=f"Authentication requirement removed from '{old.target}'",
                                    file_path=file_path,
                                    line_number=old.source_line or 1,
                                    assumption_name="authentication_required",
                                    scope="authentication",
                                    previous_assumption=f"Authenticated users required ({old.evidence}).",
                                    new_assumption="Authentication dependency removed; endpoint accepts unauthenticated requests.",
                                    change_type=AssumptionChangeType.REMOVED,
                                    potential_repercussions="Endpoint may now be accessible to unauthenticated callers, exposing sensitive operations or data.",
                                    problem=f"The authentication dependency '{old.evidence}' on '{old.target}' was removed in this pull request.",
                                    why="Removing authentication allows anonymous external access, violating previous access control assumptions.",
                                    evidence=old.evidence,
                                    suggestion="Restore the authentication dependency (e.g. Depends(get_current_user)) or explicitly verify and document if the endpoint is intentionally made public.",
                                )
                            )

            # B. Authorization Assumption Removed/Weakened
            elif old.scope == AssumptionScope.AUTHORIZATION:
                matched_new = new_by_target.get(target_key)
                if not matched_new:
                    func_name = old.target
                    if func_name in new_content:
                        results.append(
                            SecurityAssumptionDetectionResult(
                                detected=True,
                                severity=FindingSeverity.HIGH,
                                confidence=FindingConfidence.HIGH,
                                title=f"Authorization/ownership validation removed in '{old.target}'",
                                file_path=file_path,
                                line_number=old.source_line or 1,
                                assumption_name="authorization_check",
                                scope="authorization",
                                previous_assumption=f"Users can only access/modify resources they own or have permissions for ({old.evidence}).",
                                new_assumption="Ownership/permission validation was removed.",
                                change_type=AssumptionChangeType.REMOVED,
                                potential_repercussions="A user may access, modify, or delete another user's private resources (IDOR / Broken Object Level Authorization).",
                                problem=f"Authorization check '{old.evidence}' in function '{old.target}' was removed.",
                                why="Bypassing ownership verification creates Broken Object-Level Authorization (BOLA/IDOR) vulnerability.",
                                evidence=old.evidence,
                                suggestion="Restore the ownership check (e.g., verify document.owner_id == current_user.id) or ensure authorization is validated upstream.",
                            )
                        )

            # C. Input Type Assumptions Changed (e.g. int -> str)
            elif old.scope == AssumptionScope.INPUT:
                matched_new = new_by_target.get(target_key)
                if matched_new:
                    # Compare types
                    old_t = str(old.expected_value).strip()
                    new_t = str(matched_new.expected_value).strip()

                    # Detect type widening: int/float -> str, T -> Optional[T]
                    is_widened = False
                    if old_t in ("int", "int | None") and new_t in ("str", "str | None", "Any"):
                        is_widened = True
                    elif "Optional" not in old_t and ("Optional" in new_t or "None" in new_t):
                        is_widened = True
                    elif old_t != new_t and old_t in ("int", "float", "bool", "UUID", "UUID4") and new_t == "str":
                        is_widened = True

                    if is_widened:
                        param_target = old.target
                        results.append(
                            SecurityAssumptionDetectionResult(
                                detected=True,
                                severity=FindingSeverity.MEDIUM,
                                confidence=FindingConfidence.HIGH,
                                title=f"Input type assumption widened from '{old_t}' to '{new_t}' on '{param_target}'",
                                file_path=file_path,
                                line_number=matched_new.source_line or old.source_line or 1,
                                assumption_name=old.name,
                                scope="input",
                                previous_assumption=f"Parameter '{param_target}' is assumed to be {old_t}.",
                                new_assumption=f"Parameter '{param_target}' accepts arbitrary {new_t}.",
                                change_type=AssumptionChangeType.CHANGED,
                                potential_repercussions="Database queries may fail or behave unexpectedly, type-dependent validation may be bypassed, or downstream code expecting integer IDs may encounter runtime errors.",
                                problem=f"Type annotation on '{param_target}' was changed from '{old_t}' to '{new_t}'.",
                                why="Widening input types can bypass type-level security constraints and cause unexpected type coercion bugs.",
                                evidence=f"Old: {old.evidence} -> New: {matched_new.evidence}",
                                suggestion=f"Verify if widening from {old_t} to {new_t} is intentional, and ensure explicit validation is added if string input is accepted.",
                            )
                        )

            # D. Validation Constraints Weakened or Removed
            elif old.scope == AssumptionScope.VALIDATION:
                matched_new = new_by_target.get(target_key)
                if not matched_new:
                    # Field still exists in new_content?
                    field_name = old.target.split(".")[-1]
                    if field_name in new_content:
                        results.append(
                            SecurityAssumptionDetectionResult(
                                detected=True,
                                severity=FindingSeverity.MEDIUM,
                                confidence=FindingConfidence.HIGH,
                                title=f"Validation constraint removed or weakened on '{old.target}'",
                                file_path=file_path,
                                line_number=old.source_line or 1,
                                assumption_name=old.name,
                                scope="validation",
                                previous_assumption=f"Field was constrained with validation rule: {old.evidence}",
                                new_assumption="Validation constraint was removed or relaxed.",
                                change_type=AssumptionChangeType.WEAKENED,
                                potential_repercussions="Invalid, negative, empty, or out-of-range values may pass into backend business logic.",
                                problem=f"Validation rule on '{old.target}' ({old.evidence}) was removed.",
                                why="Removing input validation bounds permits boundary violations, negative numbers, or buffer overruns.",
                                evidence=old.evidence,
                                suggestion="Restore the Field(...) validation constraints or add equivalent input validation.",
                            )
                        )

        return results

    def _analyze_diff_lines(
        self,
        diff_patch: str,
        file_path: str,
        has_global_auth_middleware: bool,
    ) -> List[SecurityAssumptionDetectionResult]:
        """Scans diff line additions/deletions directly for removed security checks."""
        results: List[SecurityAssumptionDetectionResult] = []
        deleted_lines: List[Tuple[int, str]] = []
        added_lines: List[Tuple[int, str]] = []

        curr_line = 1
        for raw_line in diff_patch.splitlines():
            if raw_line.startswith("@@"):
                # Parse hunk header e.g. @@ -10,6 +10,5 @@
                m = re.search(r"\+(\d+)", raw_line)
                if m:
                    curr_line = int(m.group(1))
            elif raw_line.startswith("-") and not raw_line.startswith("---"):
                deleted_lines.append((curr_line, raw_line[1:].strip()))
            elif raw_line.startswith("+") and not raw_line.startswith("+++"):
                added_lines.append((curr_line, raw_line[1:].strip()))
                curr_line += 1
            else:
                curr_line += 1

        added_text = " \n ".join(text for _, text in added_lines)

        # 1. Removed Depends(get_current_user)
        for lno, del_line in deleted_lines:
            if "Depends(" in del_line and any(
                kw in del_line.lower() for kw in ("user", "auth", "token", "login", "admin", "permission")
            ):
                if "Depends(" not in added_text and not has_global_auth_middleware:
                    results.append(
                        SecurityAssumptionDetectionResult(
                            detected=True,
                            severity=FindingSeverity.HIGH,
                            confidence=FindingConfidence.HIGH,
                            title="Authentication requirement removed from endpoint",
                            file_path=file_path,
                            line_number=lno,
                            assumption_name="authentication_required",
                            scope="authentication",
                            previous_assumption=f"Authenticated users required: {del_line}",
                            new_assumption="Authentication dependency removed; endpoint accepts unauthenticated requests.",
                            change_type=AssumptionChangeType.REMOVED,
                            potential_repercussions="Endpoint may now be accessible without authentication.",
                            problem=f"Authentication dependency '{del_line}' was removed in diff.",
                            why="Removing authentication allows unauthenticated callers to execute this endpoint.",
                            evidence=del_line,
                            suggestion="Restore authentication dependency or explicitly document that the endpoint is intentionally public.",
                        )
                    )

            # 2. Removed ownership check (e.g. if doc.owner_id != current_user.id)
            if re.search(r"if\s+.*(?:owner_id|user_id|created_by|author_id)\s*!=\s*.*(?:user|current_user)", del_line):
                if not re.search(r"(?:owner_id|user_id|created_by|author_id)\s*!=\s*.*(?:user|current_user)", added_text):
                    results.append(
                        SecurityAssumptionDetectionResult(
                            detected=True,
                            severity=FindingSeverity.HIGH,
                            confidence=FindingConfidence.HIGH,
                            title="Ownership authorization check removed",
                            file_path=file_path,
                            line_number=lno,
                            assumption_name="authorization_check",
                            scope="authorization",
                            previous_assumption=f"Users can only access resources they own: {del_line}",
                            new_assumption="Ownership validation check was removed.",
                            change_type=AssumptionChangeType.REMOVED,
                            potential_repercussions="A user may access or modify another user's documents or resources.",
                            problem=f"Authorization check '{del_line}' was removed without equivalent replacement.",
                            why="Removes access control guarding resource ownership.",
                            evidence=del_line,
                            suggestion="Restore ownership validation check.",
                        )
                    )

            # 3. Weakened Field(gt=0...) validation
            if "= Field(" in del_line and any(c_kw in del_line for c_kw in ("gt=", "ge=", "min_length=", "max_length=")):
                if "= Field(" not in added_text or not any(c_kw in added_text for c_kw in ("gt=", "ge=", "min_length=", "max_length=")):
                    results.append(
                        SecurityAssumptionDetectionResult(
                            detected=True,
                            severity=FindingSeverity.MEDIUM,
                            confidence=FindingConfidence.HIGH,
                            title="Validation constraint removed from field definition",
                            file_path=file_path,
                            line_number=lno,
                            assumption_name="validation_constraint",
                            scope="validation",
                            previous_assumption=f"Field had constraints: {del_line}",
                            new_assumption="Validation constraints removed.",
                            change_type=AssumptionChangeType.WEAKENED,
                            potential_repercussions="Out-of-bound or negative values may reach application logic.",
                            problem=f"Constraint in '{del_line}' was removed.",
                            why="Weakens input validation safeguards.",
                            evidence=del_line,
                            suggestion="Restore field validation constraints.",
                        )
                    )

        return results

    def _reconstruct_from_diff(self, diff_patch: str) -> Tuple[str, str]:
        """Reconstructs approximate old and new file contents from a unified diff patch."""
        old_lines = []
        new_lines = []
        for line in diff_patch.splitlines():
            if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
                continue
            if line.startswith("-"):
                old_lines.append(line[1:])
            elif line.startswith("+"):
                new_lines.append(line[1:])
            else:
                old_lines.append(line)
                new_lines.append(line)
        return "\n".join(old_lines), "\n".join(new_lines)
