import ast
import re
from typing import Any, Dict, List, Optional, Set
from pydantic import BaseModel, ConfigDict, Field

from app.services.ai.context.schemas import ReviewContext
from app.services.ai.review.schemas import (
    FindingCategory,
    FindingConfidence,
    FindingSeverity,
    ReviewFinding,
)


class EdgeCaseDetectionResult(BaseModel):
    """Result of deterministic edge-case analysis on code diffs."""

    model_config = ConfigDict(extra="ignore")

    detected: bool = False
    severity: FindingSeverity = FindingSeverity.MEDIUM
    title: str = ""
    file_path: str = ""
    line_number: Optional[int] = None
    edge_case_type: str = "Missing Validation"
    scenario: str = ""
    expected_behavior: str = ""
    current_behavior: str = ""
    potential_impact: str = ""
    problem: str = ""
    why: str = ""
    evidence: Optional[str] = None
    suggestion: str = ""


class EdgeCaseAnalyzer:
    """Lightweight deterministic edge-case analyzer that detects potential missing

    null checks, unchecked division, missing input range validation, unchecked index access,
    and unhandled external dependency calls in pull request diffs.
    """

    def analyze_python_ast(
        self, code: str, file_path: str
    ) -> List[EdgeCaseDetectionResult]:
        """Analyzes Python AST for real-world unhandled edge cases."""
        results: List[EdgeCaseDetectionResult] = []
        try:
            tree = ast.parse(code)
        except Exception:
            return results

        code_lines = code.splitlines()

        class EdgeCaseVisitor(ast.NodeVisitor):
            def visit_FunctionDef(self, node: ast.FunctionDef):
                self.check_function(node)
                self.generic_visit(node)

            def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
                self.check_function(node)
                self.generic_visit(node)

            def check_function(self, func_node: Any):
                assigned_nullable_vars: Dict[str, int] = {}
                checked_vars: Set[str] = set()

                for stmt in func_node.body:
                    line_no = getattr(stmt, "lineno", 1)

                    # 1. Detect lookup calls that return Optional/None (e.g. get_user, db.scalar, dict.get, .first, .one_or_none)
                    if isinstance(stmt, ast.Assign):
                        for target in stmt.targets:
                            if isinstance(target, ast.Name):
                                var_name = target.id
                                val = stmt.value
                                # Check call expression
                                if isinstance(val, ast.Call):
                                    func_repr = ""
                                    if isinstance(val.func, ast.Name):
                                        func_repr = val.func.id
                                    elif isinstance(val.func, ast.Attribute):
                                        func_repr = val.func.attr

                                    if func_repr in (
                                        "get",
                                        "get_user",
                                        "find",
                                        "scalar",
                                        "first",
                                        "one_or_none",
                                        "pop",
                                        "find_one",
                                        "get_by_id",
                                        "fetch_one",
                                    ):
                                        assigned_nullable_vars[var_name] = line_no

                    # 2. Check if variable is checked against None / boolean condition
                    if isinstance(stmt, ast.If):
                        for test_node in ast.walk(stmt.test):
                            if isinstance(test_node, ast.Name):
                                checked_vars.add(test_node.id)

                    # 3. Detect ungrounded dereference of unchecked nullable variable
                    for expr_node in ast.walk(stmt):
                        if isinstance(expr_node, ast.Attribute):
                            if isinstance(expr_node.value, ast.Name):
                                target_var = expr_node.value.id
                                if (
                                    target_var in assigned_nullable_vars
                                    and target_var not in checked_vars
                                ):
                                    assign_line = assigned_nullable_vars[target_var]
                                    attr_line = getattr(expr_node, "lineno", line_no)
                                    if attr_line >= assign_line:
                                        start_idx = max(0, assign_line - 1)
                                        end_idx = min(len(code_lines), attr_line + 2)
                                        snippet = "\n".join(code_lines[start_idx:end_idx])

                                        results.append(
                                            EdgeCaseDetectionResult(
                                                detected=True,
                                                severity=FindingSeverity.MEDIUM,
                                                title=f"Unchecked Null/None Dereference on '{target_var}'",
                                                file_path=file_path,
                                                line_number=attr_line,
                                                edge_case_type="Missing/Null Data",
                                                scenario=f"The lookup assigned to '{target_var}' at line {assign_line} returns None/null when the record or key is absent.",
                                                expected_behavior=f"Explicitly check if '{target_var}' is None or raise an appropriate error/HTTP 404 before accessing attributes.",
                                                current_behavior=f"Directly accesses '{target_var}.{expr_node.attr}' without checking whether '{target_var}' is None.",
                                                potential_impact=f"Uncaught AttributeError (NoneType has no attribute '{expr_node.attr}') causing 500 server crashes in production.",
                                                problem=f"Variable '{target_var}' is assigned from a lookup that can return None, but attribute '{expr_node.attr}' is accessed at line {attr_line} without a None check.",
                                                why="When a record, user, or key is missing, dereferencing None results in an unhandled AttributeError crash.",
                                                evidence=snippet,
                                                suggestion=f"Add 'if {target_var} is None:' validation or error handling prior to accessing '{target_var}.{expr_node.attr}'.",
                                            )
                                        )
                                        # Mark as checked so we don't repeat for same variable
                                        checked_vars.add(target_var)

                        # 4. Check for direct indexing without length verification e.g. items[0]
                        if isinstance(expr_node, ast.Subscript):
                            if isinstance(expr_node.value, ast.Name) and isinstance(expr_node.slice, ast.Constant):
                                list_var = expr_node.value.id
                                if list_var not in checked_vars and list_var not in ("self", "cls", "kwargs", "args"):
                                    idx_val = expr_node.slice.value
                                    if isinstance(idx_val, int):
                                        sub_line = getattr(expr_node, "lineno", line_no)
                                        snippet = code_lines[sub_line - 1] if sub_line <= len(code_lines) else None
                                        results.append(
                                            EdgeCaseDetectionResult(
                                                detected=True,
                                                severity=FindingSeverity.MEDIUM,
                                                title=f"Unchecked Collection Index Access on '{list_var}'",
                                                file_path=file_path,
                                                line_number=sub_line,
                                                edge_case_type="Collection Boundary",
                                                scenario=f"Indexing into '{list_var}[{idx_val}]' when '{list_var}' is empty or has fewer than {idx_val + 1} elements.",
                                                expected_behavior=f"Verify that '{list_var}' contains sufficient elements (e.g. 'if len({list_var}) > {idx_val}:') before indexing.",
                                                current_behavior=f"Accesses '{list_var}[{idx_val}]' directly assuming elements are always present.",
                                                potential_impact="Uncaught IndexError causing runtime failure when processing empty or short collections.",
                                                problem=f"Direct indexing '{list_var}[{idx_val}]' at line {sub_line} without verifying collection size.",
                                                why="Empty collections or truncated lists will crash with IndexError if index bounds are not checked.",
                                                evidence=snippet,
                                                suggestion=f"Check 'if {list_var} and len({list_var}) > {idx_val}:' before indexing.",
                                            )
                                        )
                                        checked_vars.add(list_var)

                        # 5. Unchecked Division by Zero e.g. a / b
                        if isinstance(expr_node, ast.BinOp) and isinstance(expr_node.op, (ast.Div, ast.FloorDiv, ast.Mod)):
                            if isinstance(expr_node.right, ast.Name):
                                denom_var = expr_node.right.id
                                if denom_var not in checked_vars:
                                    div_line = getattr(expr_node, "lineno", line_no)
                                    snippet = code_lines[div_line - 1] if div_line <= len(code_lines) else None
                                    results.append(
                                        EdgeCaseDetectionResult(
                                            detected=True,
                                            severity=FindingSeverity.MEDIUM,
                                            title=f"Potential Unchecked Division by Zero on '{denom_var}'",
                                            file_path=file_path,
                                            line_number=div_line,
                                            edge_case_type="Input Boundary",
                                            scenario=f"Performing division by variable '{denom_var}' when its value is 0.",
                                            expected_behavior=f"Validate that '{denom_var} != 0' before performing division or modulo operations.",
                                            current_behavior=f"Divides by '{denom_var}' directly at line {div_line}.",
                                            potential_impact="ZeroDivisionError causing application panic or 500 error response.",
                                            problem=f"Division operation uses denominator '{denom_var}' without verifying non-zero value.",
                                            why="Zero values supplied as denominator will crash with ZeroDivisionError.",
                                            evidence=snippet,
                                            suggestion=f"Validate 'if {denom_var} == 0: raise ValueError(...) or handle fallback' before division.",
                                        )
                                    )
                                    checked_vars.add(denom_var)

        visitor = EdgeCaseVisitor()
        visitor.visit(tree)
        return results

    def analyze_diff_text(
        self, diff_text: str, file_path: str
    ) -> List[EdgeCaseDetectionResult]:
        """Pattern-based edge case scanner for git diff patches across all programming languages."""
        results: List[EdgeCaseDetectionResult] = []
        if not diff_text or not diff_text.strip():
            return results

        lines = diff_text.splitlines()

        # Regex patterns for common unhandled edge cases in diffs
        balance_sub_pattern = re.compile(
            r"^\+?\s*(?:\w+\.)?(?:balance|total|amount|qty)\s*(?:-=\s*|\s*=\s*.*\s*-\s*)(\w+)",
            re.IGNORECASE,
        )
        external_api_pattern = re.compile(
            r"^\+?\s*(?:response|res|r)\s*=\s*(?:requests|httpx|aiohttp|fetch|axios)\.(?:get|post|put|delete)",
            re.IGNORECASE,
        )

        current_target_line = 1

        for line in lines:
            if line.startswith("@@"):
                m = re.search(r"\+(\d+)", line)
                if m:
                    current_target_line = int(m.group(1))
                continue

            is_added = line.startswith("+") and not line.startswith("+++")
            clean_line = line[1:] if is_added else line

            # Check monetary/balance operations without range check
            m_bal = balance_sub_pattern.search(clean_line)
            if m_bal and "if " not in clean_line and "assert" not in clean_line:
                amt_var = m_bal.group(1)
                results.append(
                    EdgeCaseDetectionResult(
                        detected=True,
                        severity=FindingSeverity.HIGH,
                        title=f"Unvalidated Balance Operation with Parameter '{amt_var}'",
                        file_path=file_path,
                        line_number=current_target_line,
                        edge_case_type="Input Boundary",
                        scenario=f"The operation accepts a negative or zero value for '{amt_var}' (e.g. amount <= 0).",
                        expected_behavior=f"Validate that '{amt_var} > 0' and verify user has sufficient funds prior to modifying balances.",
                        current_behavior=f"Directly modifies balance using '{amt_var}' without checking positive range boundaries.",
                        potential_impact="Data corruption, negative account balances, or financial calculation errors.",
                        problem=f"Balance/total modification at line {current_target_line} does not validate that '{amt_var}' is positive.",
                        why="Allowing negative or zero transaction amounts can corrupt balances or invert transaction logic.",
                        evidence=clean_line.strip(),
                        suggestion=f"Add validation: 'if {amt_var} <= 0: raise ValueError(\"Amount must be positive\")'.",
                    )
                )

            # Check external API calls without explicit failure handling
            m_ext = external_api_pattern.search(clean_line)
            if m_ext and "try" not in clean_line:
                results.append(
                    EdgeCaseDetectionResult(
                        detected=True,
                        severity=FindingSeverity.MEDIUM,
                        title="Unhandled External Network/API Dependency Call",
                        file_path=file_path,
                        line_number=current_target_line,
                        edge_case_type="External Dependency Failure",
                        scenario="The external service experiences network timeout, HTTP 5xx errors, or returns malformed payloads.",
                        expected_behavior="Wrap network calls in try/except blocks with timeouts and handle failure/fallback gracefully.",
                        current_behavior="Executes external network HTTP request without timeout or exception handling block.",
                        potential_impact="Service hang, unhandled ConnectionError/Timeout crash, or cascaded outage.",
                        problem=f"External API call at line {current_target_line} lacks explicit failure/timeout handling.",
                        why="External APIs can fail, time out, or return error status codes unpredictably.",
                        evidence=clean_line.strip(),
                        suggestion="Wrap request in try/except (e.g. requests.exceptions.RequestException) with explicit timeout.",
                    )
                )

            if is_added or (not line.startswith("-") and not line.startswith("\\")):
                current_target_line += 1

        return results

    def scan_context(self, context: ReviewContext) -> List[ReviewFinding]:
        """Scans ReviewContext changed files for edge cases and returns grounded ReviewFinding objects."""
        findings: List[ReviewFinding] = []
        if not hasattr(context, "changed_files") or not context.changed_files:
            return findings

        # Check if validation or error handling exists in repository/RepoLens context
        repo_has_pydantic_validation = False
        if hasattr(context, "repository") and context.repository:
            if any("pydantic" in str(dep).lower() for dep in (context.repository.dependencies or {})):
                repo_has_pydantic_validation = True

        for cf in context.changed_files:
            file_path = cf.file_path or "unknown"
            detected_results: List[EdgeCaseDetectionResult] = []

            # 1. AST Analysis for Python files
            if cf.file_content and file_path.endswith(".py"):
                detected_results.extend(self.analyze_python_ast(cf.file_content, file_path))

            # 2. Diff Pattern Analysis across all file types
            if cf.diff_patch:
                diff_results = self.analyze_diff_text(cf.diff_patch, file_path)
                # Deduplicate against AST results
                for dr in diff_results:
                    if not any(ar.line_number == dr.line_number and ar.title == dr.title for ar in detected_results):
                        detected_results.append(dr)

            for res in detected_results:
                findings.append(
                    ReviewFinding(
                        category=FindingCategory.EDGE_CASE,
                        severity=res.severity,
                        confidence=FindingConfidence.HIGH,
                        title=res.title,
                        file=res.file_path,
                        line=res.line_number,
                        problem=res.problem,
                        why=res.why,
                        evidence=res.evidence,
                        suggestion=res.suggestion,
                        edge_case_type=res.edge_case_type,
                        scenario=res.scenario,
                        expected_behavior=res.expected_behavior,
                        current_behavior=res.current_behavior,
                        potential_impact=res.potential_impact,
                        source="EDGE_CASE_ANALYZER",
                        is_grounded=True,
                    )
                )

        return findings


edge_case_analyzer = EdgeCaseAnalyzer()
