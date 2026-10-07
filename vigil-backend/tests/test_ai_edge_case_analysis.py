"""Unit tests for the deterministic EdgeCaseAnalyzer.

Tests all five static analysis detectors:
  1. Unchecked Null/None dereference (AST)
  2. Unchecked collection index access (AST)
  3. Division by zero without guard (AST)
  4. Unvalidated balance/financial operations (diff regex)
  5. Unhandled external HTTP calls without try/except (diff regex)
"""

import pytest

from app.services.ai.edge_cases.analyzer import EdgeCaseAnalyzer, EdgeCaseDetectionResult
from app.services.ai.review.schemas import FindingCategory, FindingSeverity


@pytest.fixture
def analyzer():
    return EdgeCaseAnalyzer()


# ─── AST: Null Dereference ────────────────────────────────────────────

class TestNullDereference:
    def test_detects_unchecked_nullable_lookup(self, analyzer: EdgeCaseAnalyzer):
        code = """
def process_user(user_id):
    user = db.get(user_id)
    name = user.name
"""
        results = analyzer.analyze_python_ast(code, "app/service.py")
        assert len(results) >= 1
        r = results[0]
        assert r.detected is True
        assert "user" in r.title.lower()
        assert r.edge_case_type == "Missing/Null Data"

    def test_no_false_positive_when_none_checked(self, analyzer: EdgeCaseAnalyzer):
        code = """
def process_user(user_id):
    user = db.get(user_id)
    if user is None:
        return None
    name = user.name
"""
        results = analyzer.analyze_python_ast(code, "app/service.py")
        # The variable is checked before dereference, so no finding expected
        assert len(results) == 0

    def test_detects_first_or_none_pattern(self, analyzer: EdgeCaseAnalyzer):
        code = """
def get_latest_order(customer_id):
    order = session.first()
    total = order.total_amount
"""
        results = analyzer.analyze_python_ast(code, "orders/service.py")
        assert len(results) >= 1
        assert any("order" in r.title.lower() for r in results)


# ─── AST: Unchecked Index Access ──────────────────────────────────────

class TestUncheckedIndexAccess:
    def test_detects_direct_indexing(self, analyzer: EdgeCaseAnalyzer):
        code = """
def get_first_item(items_list):
    first = items_list[0]
    return first
"""
        results = analyzer.analyze_python_ast(code, "utils.py")
        assert len(results) >= 1
        r = results[0]
        assert r.detected is True
        assert r.edge_case_type == "Collection Boundary"

    def test_no_fp_for_self_access(self, analyzer: EdgeCaseAnalyzer):
        """self[0] or cls[0] should not trigger (special variables)."""
        code = """
def method(self):
    val = self[0]
"""
        results = analyzer.analyze_python_ast(code, "model.py")
        assert len(results) == 0


# ─── AST: Division by Zero ───────────────────────────────────────────

class TestDivisionByZero:
    def test_detects_unchecked_division(self, analyzer: EdgeCaseAnalyzer):
        code = """
def compute_average(total, count):
    avg = total / count
    return avg
"""
        results = analyzer.analyze_python_ast(code, "math_utils.py")
        assert len(results) >= 1
        r = results[0]
        assert r.detected is True
        assert "count" in r.title.lower()
        assert r.edge_case_type == "Input Boundary"

    def test_detects_floor_division(self, analyzer: EdgeCaseAnalyzer):
        code = """
def split_evenly(items, groups):
    per_group = items // groups
"""
        results = analyzer.analyze_python_ast(code, "utils.py")
        assert len(results) >= 1

    def test_no_fp_when_checked(self, analyzer: EdgeCaseAnalyzer):
        code = """
def compute_average(total, count):
    if count:
        avg = total / count
    return avg
"""
        results = analyzer.analyze_python_ast(code, "math_utils.py")
        assert len(results) == 0


# ─── Diff: Unvalidated Balance Operation ──────────────────────────────

class TestBalanceOperation:
    def test_detects_unvalidated_balance_subtraction(self, analyzer: EdgeCaseAnalyzer):
        diff = """@@ -1,5 +1,5 @@
+    balance -= amount
"""
        results = analyzer.analyze_diff_text(diff, "payments/transfer.py")
        assert len(results) >= 1
        r = results[0]
        assert r.detected is True
        assert r.severity == FindingSeverity.HIGH
        assert "amount" in r.title.lower()

    def test_no_fp_when_assertion_present(self, analyzer: EdgeCaseAnalyzer):
        diff = """@@ -1,5 +1,5 @@
+    assert amount > 0; balance -= amount
"""
        results = analyzer.analyze_diff_text(diff, "payments/transfer.py")
        # The assert in the same line should suppress the finding
        assert len(results) == 0


# ─── Diff: Unhandled External API Call ────────────────────────────────

class TestExternalAPICall:
    def test_detects_unhandled_requests_get(self, analyzer: EdgeCaseAnalyzer):
        diff = """@@ -10,6 +10,7 @@
+    response = requests.get(url)
"""
        results = analyzer.analyze_diff_text(diff, "integrations/weather.py")
        assert len(results) >= 1
        r = results[0]
        assert r.detected is True
        assert r.edge_case_type == "External Dependency Failure"

    def test_detects_httpx_post(self, analyzer: EdgeCaseAnalyzer):
        diff = """@@ -1,3 +1,4 @@
+    res = httpx.post(endpoint)
"""
        results = analyzer.analyze_diff_text(diff, "api/client.py")
        assert len(results) >= 1


# ─── Integration: scan_context ────────────────────────────────────────

class TestScanContext:
    def test_returns_review_findings_from_python_file(self, analyzer: EdgeCaseAnalyzer):
        from unittest.mock import MagicMock

        context = MagicMock()
        changed_file = MagicMock()
        changed_file.file_path = "service.py"
        changed_file.file_content = """
def process(user_id):
    user = db.get(user_id)
    return user.email
"""
        changed_file.diff_patch = None
        context.changed_files = [changed_file]
        context.repository = None

        findings = analyzer.scan_context(context)
        assert len(findings) >= 1
        f = findings[0]
        assert f.category == FindingCategory.EDGE_CASE
        assert f.source == "EDGE_CASE_ANALYZER"
        assert f.is_grounded is True

    def test_returns_empty_for_clean_code(self, analyzer: EdgeCaseAnalyzer):
        from unittest.mock import MagicMock

        context = MagicMock()
        changed_file = MagicMock()
        changed_file.file_path = "clean.py"
        changed_file.file_content = """
def greet(name):
    return f"Hello, {name}"
"""
        changed_file.diff_patch = None
        context.changed_files = [changed_file]
        context.repository = None

        findings = analyzer.scan_context(context)
        assert len(findings) == 0

    def test_empty_context_returns_empty(self, analyzer: EdgeCaseAnalyzer):
        from unittest.mock import MagicMock

        context = MagicMock()
        context.changed_files = []
        context.repository = None

        findings = analyzer.scan_context(context)
        assert len(findings) == 0
