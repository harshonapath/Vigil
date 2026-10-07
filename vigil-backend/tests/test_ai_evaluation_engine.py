import json
import pytest

from app.services.ai.context.builder import ReviewContextBuilder
from app.services.ai.gateway import AIModelGateway
from app.services.ai.providers.mock_provider import MockProvider
from app.services.ai.review.schemas import (
    FindingCategory,
    FindingConfidence,
    FindingSeverity,
    ReviewFinding,
    ReviewResult,
)
from tests.ai_evaluation.dataset import (
    BenchmarkCase,
    GroundTruthFinding,
    build_benchmark_dataset,
)
from tests.ai_evaluation.metrics import (
    BenchmarkMetrics,
    calculate_benchmark_metrics,
    match_finding_to_ground_truth,
)
from tests.ai_evaluation.report import generate_benchmark_report
from tests.ai_evaluation.runner import BenchmarkRunner, get_comparison_table


# 1. ground-truth schema
def test_ground_truth_schema():
    gt = GroundTruthFinding(
        category=FindingCategory.SECURITY,
        severity=FindingSeverity.HIGH,
        file="app/main.py",
        line_start=10,
        line_end=15,
        title_keywords=["sql", "injection"],
    )
    assert gt.category == FindingCategory.SECURITY
    assert gt.file == "app/main.py"
    assert gt.line_start == 10


# 2. finding matching
def test_finding_matching():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ query = f'SELECT {id}'")
    context = builder.build(normalize=True)

    case = BenchmarkCase(
        case_id="C1",
        name="SQLi",
        description="SQL injection case",
        context=context,
        ground_truth_findings=[
            GroundTruthFinding(
                category=FindingCategory.SECURITY,
                severity=FindingSeverity.HIGH,
                file="app/main.py",
                line_start=1,
                line_end=5,
            )
        ],
    )

    finding = ReviewFinding(
        category=FindingCategory.SECURITY,
        severity=FindingSeverity.HIGH,
        title="SQL Injection",
        file="app/main.py",
        line=2,
        problem="Unsanitized query",
        why="Security risk",
        evidence="query = f'SELECT {id}'",
    )

    match_res = match_finding_to_ground_truth(finding, case, set())
    assert match_res.is_tp is True
    assert match_res.file_matched is True
    assert match_res.evidence_matched is True


# 3. precision calculation
def test_precision_calculation():
    # 2 TPs, 0 FPs -> Precision = 1.0
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(
        case_id="C1",
        name="Case 1",
        description="Test case",
        context=context,
        ground_truth_findings=[
            GroundTruthFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.MEDIUM, file="app/main.py")
        ],
    )

    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.MEDIUM, title="Bug", file="app/main.py", problem="P", why="W")
        ],
    )

    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert metrics.precision == 1.0


# 4. recall calculation
def test_recall_calculation():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(
        case_id="C1",
        name="Case 1",
        description="Test case",
        context=context,
        ground_truth_findings=[
            GroundTruthFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.MEDIUM, file="app/main.py"),
            GroundTruthFinding(category=FindingCategory.SECURITY, severity=FindingSeverity.HIGH, file="app/main.py"),
        ],
    )

    # Model only detects 1 out of 2 ground truths
    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.MEDIUM, title="Bug", file="app/main.py", problem="P", why="W")
        ],
    )

    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert metrics.recall == 0.5


# 5. F1 calculation
def test_f1_calculation():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(
        case_id="C1",
        name="Case 1",
        description="Test case",
        context=context,
        ground_truth_findings=[
            GroundTruthFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.MEDIUM, file="app/main.py"),
            GroundTruthFinding(category=FindingCategory.SECURITY, severity=FindingSeverity.HIGH, file="app/main.py"),
        ],
    )

    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.MEDIUM, title="Bug", file="app/main.py", problem="P", why="W")
        ],
    )

    # Precision = 1.0, Recall = 0.5 -> F1 = 2 * (1.0 * 0.5) / 1.5 = 0.6667
    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert round(metrics.f1_score, 2) == 0.67


# 6. false-positive rate
def test_false_positive_rate():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/clean.py", diff_patch="+ x = 1")
    context = builder.build(normalize=True)

    clean_case = BenchmarkCase(
        case_id="CLEAN-1",
        name="Clean Case",
        description="Clean code",
        context=context,
        ground_truth_findings=[],
        is_clean_code=True,
    )

    # Model produced a false positive finding on clean code
    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.SECURITY, severity=FindingSeverity.HIGH, title="FP", file="app/clean.py", problem="P", why="W")
        ],
    )

    metrics = calculate_benchmark_metrics([(clean_case, res, 0.5)])
    assert metrics.false_positive_rate == 1.0


# 7. file accuracy
def test_file_accuracy():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(
        case_id="C1",
        name="Case",
        description="Case",
        context=context,
        ground_truth_findings=[GroundTruthFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, file="app/main.py")],
    )

    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, title="B", file="app/main.py", problem="P", why="W")
        ],
    )

    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert metrics.file_accuracy == 100.0


# 8. line accuracy
def test_line_accuracy():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(
        case_id="C1",
        name="Case",
        description="Case",
        context=context,
        ground_truth_findings=[GroundTruthFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, file="app/main.py", line_start=10, line_end=15)],
    )

    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, title="B", file="app/main.py", line=12, problem="P", why="W")
        ],
    )

    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert metrics.line_accuracy == 100.0


# 9. evidence accuracy
def test_evidence_accuracy():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ exact_code_line = 42")
    context = builder.build(normalize=True)

    case = BenchmarkCase(
        case_id="C1",
        name="Case",
        description="Case",
        context=context,
        ground_truth_findings=[GroundTruthFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, file="app/main.py")],
    )

    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, title="B", file="app/main.py", evidence="exact_code_line = 42", problem="P", why="W")
        ],
    )

    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert metrics.evidence_accuracy == 100.0


# 10. duplicate detection
def test_duplicate_detection():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(case_id="C1", name="C", description="D", context=context, ground_truth_findings=[])

    res = ReviewResult(
        summary="Summary",
        findings=[
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, title="B", file="app/main.py", line=5, problem="P", why="W"),
            ReviewFinding(category=FindingCategory.LOGIC, severity=FindingSeverity.LOW, title="B", file="app/main.py", line=5, problem="P", why="W"),
        ],
    )

    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert metrics.duplicate_rate == 50.0


# 11. JSON validity
def test_json_validity():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(case_id="C1", name="C", description="D", context=context, ground_truth_findings=[])
    res = ReviewResult(summary="S", findings=[])

    metrics = calculate_benchmark_metrics([(case, res, 0.5)])
    assert metrics.valid_json_rate == 100.0


# 12. retry calculation
def test_retry_calculation():
    metrics = BenchmarkMetrics(retry_rate=0.0)
    assert metrics.retry_rate == 0.0


# 13. failure-rate calculation
def test_failure_rate_calculation():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case = BenchmarkCase(case_id="C1", name="C", description="D", context=context, ground_truth_findings=[])
    metrics = calculate_benchmark_metrics([(case, None, 0.5)])
    assert metrics.failure_rate == 100.0


# 14. latency aggregation
def test_latency_aggregation():
    builder = ReviewContextBuilder()
    builder.add_changed_file("app/main.py", diff_patch="+ pass")
    context = builder.build(normalize=True)

    case1 = BenchmarkCase(case_id="C1", name="C1", description="D", context=context, ground_truth_findings=[])
    case2 = BenchmarkCase(case_id="C2", name="C2", description="D", context=context, ground_truth_findings=[])

    res = ReviewResult(summary="S", findings=[])
    metrics = calculate_benchmark_metrics([(case1, res, 1.0), (case2, res, 3.0)])
    assert metrics.avg_latency_s == 2.0


# 15. coverage aggregation
def test_coverage_aggregation():
    metrics = BenchmarkMetrics()
    assert metrics.changed_file_coverage == "100.0%"
    assert "UNAVAILABLE" in metrics.scanner_coverage


# 16. clean-code false-positive gate
def test_clean_code_false_positive_gate():
    dataset = build_benchmark_dataset()
    clean_cases = [c for c in dataset if c.is_clean_code]
    assert len(clean_cases) >= 2
    for c in clean_cases:
        assert len(c.ground_truth_findings) == 0


# 17. ambiguous-code NEEDS_REVIEW gate
def test_ambiguous_code_needs_review_gate():
    dataset = build_benchmark_dataset()
    ambiguous_cases = [c for c in dataset if c.is_ambiguous_code]
    assert len(ambiguous_cases) >= 1
    assert ambiguous_cases[0].ground_truth_findings[0].severity == FindingSeverity.LOW


# 18. prompt-injection benchmark
def test_prompt_injection_benchmark():
    dataset = build_benchmark_dataset()
    inj_cases = [c for c in dataset if c.is_prompt_injection]
    assert len(inj_cases) >= 1
    assert inj_cases[0].ground_truth_findings[0].category == FindingCategory.SECURITY


# 19. multi-file benchmark
def test_multi_file_benchmark():
    dataset = build_benchmark_dataset()
    multi_cases = [c for c in dataset if c.is_multi_file]
    assert len(multi_cases) >= 1
    assert len(multi_cases[0].context.changed_files) == 2


# 20. unavailable-baseline handling
def test_unavailable_baseline_handling():
    metrics_a = BenchmarkMetrics(precision=0.85, recall=0.90, f1_score=0.87)
    metrics_vigil = BenchmarkMetrics(precision=0.95, recall=0.95, f1_score=0.95)

    table = get_comparison_table(metrics_a, metrics_vigil)
    assert table[1]["baseline"] == "Baseline B — Security Scanners Only"
    assert table[1]["precision"] == "UNAVAILABLE"
    assert table[2]["baseline"] == "Baseline C — Scanner + LLM"
    assert table[2]["precision"] == "UNAVAILABLE"


# 21. report generation
def test_report_generation():
    metrics_a = BenchmarkMetrics(precision=0.85, recall=0.90, f1_score=0.87)
    metrics_vigil = BenchmarkMetrics(precision=0.95, recall=0.95, f1_score=0.95)

    report = generate_benchmark_report(metrics_a, metrics_vigil)
    assert "# VIGIL AI Code Review Quality & Evaluation Report" in report
    assert "Baseline A — LLM + Diff" in report
    assert "VIGIL — Full Pipeline" in report


# 22. reproducibility metadata
def test_reproducibility_metadata():
    metrics_a = BenchmarkMetrics(precision=0.85, recall=0.90, f1_score=0.87)
    metrics_vigil = BenchmarkMetrics(precision=0.95, recall=0.95, f1_score=0.95)

    report = generate_benchmark_report(metrics_a, metrics_vigil, model_name="openai/gpt-oss-120b")
    assert "openai/gpt-oss-120b" in report
    assert "Ground Truth Version" in report
