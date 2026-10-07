import ast
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.services.ai.context.schemas import ReviewContext
from app.services.ai.review.schemas import (
    FindingCategory,
    FindingConfidence,
    FindingSeverity,
    ReviewFinding,
)


class ComplexityDetectionResult(BaseModel):
    """Result of deterministic complexity analysis on code diffs."""

    model_config = ConfigDict(extra="ignore")

    detected: bool = False
    severity: FindingSeverity = FindingSeverity.MEDIUM
    title: str = ""
    file_path: str = ""
    line_number: Optional[int] = None
    problem: str = ""
    why: str = ""
    evidence: Optional[str] = None
    suggestion: str = ""
    current_time_complexity: Optional[str] = None
    suggested_time_complexity: Optional[str] = None
    current_space_complexity: Optional[str] = None
    suggested_space_complexity: Optional[str] = None


class ComplexityAnalyzer:
    """Lightweight static complexity analyzer that detects obvious nested loop patterns,

    repeated collection traversals, and redundant copies in pull request diffs.
    """

    def analyze_python_ast(
        self, code: str, file_path: str
    ) -> List[ComplexityDetectionResult]:
        """Analyzes Python code via AST for nested loops, quadratic operations inside loops,

        and redundant data copies.
        """
        results: List[ComplexityDetectionResult] = []
        try:
            tree = ast.parse(code)
        except Exception:
            return results

        code_lines = code.splitlines()

        class LoopVisitor(ast.NodeVisitor):
            def __init__(self):
                self.loop_stack: List[ast.AST] = []

            def visit_For(self, node: ast.For):
                self.handle_loop(node)

            def visit_While(self, node: ast.While):
                self.handle_loop(node)

            def is_derived_from_outer(self, inner_node: ast.AST, outer_node: ast.AST) -> bool:
                """Checks if inner loop iterable is derived from outer loop iteration target."""
                outer_names = set()
                outer_target = getattr(outer_node, "target", None)
                if isinstance(outer_target, ast.Name):
                    outer_names.add(outer_target.id)
                elif isinstance(outer_target, (ast.Tuple, ast.List)):
                    for elt in outer_target.elts:
                        if isinstance(elt, ast.Name):
                            outer_names.add(elt.id)

                if not outer_names:
                    return False

                inner_iter = getattr(inner_node, "iter", None)
                if not inner_iter:
                    return False

                # Direct reference in iterable e.g. for x in user.items or tx_map[user.id]
                for n in ast.walk(inner_iter):
                    if isinstance(n, ast.Name) and n.id in outer_names:
                        return True

                # Variable name reference assigned in outer loop body e.g. user_txs = tx_map.get(user.id)
                if isinstance(inner_iter, ast.Name):
                    var_name = inner_iter.id
                    for stmt in getattr(outer_node, "body", []):
                        if isinstance(stmt, ast.Assign):
                            for t in stmt.targets:
                                if isinstance(t, ast.Name) and t.id == var_name:
                                    for child in ast.walk(stmt.value):
                                        if isinstance(child, ast.Name) and child.id in outer_names:
                                            return True
                return False

            def handle_loop(self, node: ast.AST):
                self.loop_stack.append(node)
                depth = len(self.loop_stack)
                line_no = getattr(node, "lineno", 1)

                # Check if this is a nested loop (depth >= 2)
                if depth >= 2:
                    outer_loop = self.loop_stack[0]
                    outer_line = getattr(outer_loop, "lineno", line_no)

                    # Only flag if inner loop iterates over an independent collection
                    if not self.is_derived_from_outer(node, outer_loop):
                        start_idx = max(0, outer_line - 1)
                        end_idx = min(len(code_lines), line_no + 3)
                        snippet = "\n".join(code_lines[start_idx:end_idx])

                        results.append(
                            ComplexityDetectionResult(
                                detected=True,
                                severity=FindingSeverity.MEDIUM,
                                title="Unnecessary O(n²) Nested Loop Traversal",
                                file_path=file_path,
                                line_number=line_no,
                                problem=(
                                    f"Nested loop detected at line {line_no} inside outer loop at line {outer_line}. "
                                    "Iterating over collections in nested loops results in quadratic O(n × m) time complexity."
                                ),
                                why="Repeatedly traversing a collection inside a loop degrades performance significantly as input size grows.",
                                evidence=snippet if snippet else None,
                                suggestion="Consider indexing or converting the inner collection into a set/dict lookup table before the outer loop to achieve linear O(n + m) time complexity.",
                                current_time_complexity="O(n²)",
                                suggested_time_complexity="O(n)",
                                current_space_complexity="O(1)",
                                suggested_space_complexity="O(n)",
                            )
                        )

                self.generic_visit(node)
                self.loop_stack.pop()

        visitor = LoopVisitor()
        visitor.visit(tree)
        return results

    def analyze_diff_text(
        self, diff_text: str, file_path: str
    ) -> List[ComplexityDetectionResult]:
        """Pattern-based complexity scanner for diff patches across all programming languages."""
        results: List[ComplexityDetectionResult] = []
        if not diff_text or not diff_text.strip():
            return results

        lines = diff_text.splitlines()

        nested_loop_py = re.compile(
            r"^\+?\s*for\s+\w+\s+in\s+.*:\s*$", re.IGNORECASE
        )
        nested_loop_c_style = re.compile(
            r"^\+?\s*for\s*\([^)]*\)\s*\{?", re.IGNORECASE
        )

        loop_depth = 0
        outer_line_num = None
        current_target_line = 1

        for line in lines:
            if line.startswith("@@"):
                m = re.search(r"\+(\d+)", line)
                if m:
                    current_target_line = int(m.group(1))
                loop_depth = 0
                continue

            is_added = line.startswith("+") and not line.startswith("+++")
            clean_line = line[1:] if is_added else line

            if nested_loop_py.search(clean_line) or nested_loop_c_style.search(clean_line):
                loop_depth += 1
                if loop_depth == 1:
                    outer_line_num = current_target_line
                elif loop_depth >= 2:
                    results.append(
                        ComplexityDetectionResult(
                            detected=True,
                            severity=FindingSeverity.MEDIUM,
                            title="Unnecessary O(n²) Nested Traversal",
                            file_path=file_path,
                            line_number=current_target_line,
                            problem=(
                                f"Nested loop detected at line {current_target_line}. "
                                f"Repeatedly iterating inside outer loop (line {outer_line_num}) creates O(n × m) quadratic complexity."
                            ),
                            why="Quadratic time complexity can cause severe response latency spikes on larger datasets.",
                            evidence=line.strip(),
                            suggestion="Pre-index or hash the inner dataset before entering the outer loop to achieve O(n) linear complexity.",
                            current_time_complexity="O(n²)",
                            suggested_time_complexity="O(n)",
                            current_space_complexity="O(1)",
                            suggested_space_complexity="O(n)",
                        )
                    )
            elif clean_line.strip() == "}" or (not clean_line.startswith(" ") and not clean_line.startswith("\t") and clean_line.strip()):
                if loop_depth > 0:
                    loop_depth -= 1

            if is_added or (not line.startswith("-") and not line.startswith("\\")):
                current_target_line += 1

        return results

    def scan_context(self, context: ReviewContext) -> List[ReviewFinding]:
        """Scans ReviewContext changed files for complexity issues and returns grounded ReviewFinding objects."""
        findings: List[ReviewFinding] = []
        if not hasattr(context, "changed_files") or not context.changed_files:
            return findings

        for cf in context.changed_files:
            file_path = cf.file_path or "unknown"
            detected_results: List[ComplexityDetectionResult] = []

            if cf.file_content and file_path.endswith(".py"):
                detected_results.extend(self.analyze_python_ast(cf.file_content, file_path))

            if not detected_results and cf.diff_patch:
                detected_results.extend(self.analyze_diff_text(cf.diff_patch, file_path))

            for res in detected_results:
                findings.append(
                    ReviewFinding(
                        category=FindingCategory.COMPLEXITY,
                        severity=res.severity,
                        confidence=FindingConfidence.HIGH,
                        title=res.title,
                        file=res.file_path,
                        line=res.line_number,
                        problem=res.problem,
                        why=res.why,
                        evidence=res.evidence,
                        suggestion=res.suggestion,
                        current_time_complexity=res.current_time_complexity,
                        suggested_time_complexity=res.suggested_time_complexity,
                        current_space_complexity=res.current_space_complexity,
                        suggested_space_complexity=res.suggested_space_complexity,
                        source="COMPLEXITY_ANALYZER",
                        is_grounded=True,
                    )
                )

        return findings


complexity_analyzer = ComplexityAnalyzer()
