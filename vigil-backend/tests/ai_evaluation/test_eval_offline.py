import json
import pytest

from app.services.ai.gateway import AIModelGateway
from app.services.ai.providers.mock_provider import MockProvider
from app.services.ai.review.engine import ReviewEngine
from tests.ai_evaluation.fixtures import (
    get_all_fixtures,
    get_fixture_a_security,
    get_fixture_b_logic,
    get_fixture_e_clean_code,
    get_fixture_f_prompt_injection,
)
from tests.ai_evaluation.harness import ReviewEvaluator


@pytest.mark.asyncio
async def test_offline_eval_fixture_a_security():
    mock_resp = json.dumps({
        "summary": "Detected critical SQL injection in user search service.",
        "findings": [
            {
                "category": "Security",
                "severity": "critical",
                "title": "Raw SQL injection vulnerability",
                "file": "app/services/user_search.py",
                "line": 4,
                "problem": "Direct f-string formatting inside query string",
                "why": "Enables remote SQL injection",
                "evidence": 'query = f"SELECT id, name, email FROM users WHERE department = \'{department_name}\'\"',
                "suggestion": "Use parameterized query placeholders instead",
            }
        ],
    })
    mock = MockProvider(default_response=mock_resp)
    engine = ReviewEngine(gateway=AIModelGateway(provider=mock))
    evaluator = ReviewEvaluator(engine=engine)

    fixture = get_fixture_a_security()
    res = await evaluator.evaluate_fixture(fixture)

    assert res.success is True
    assert res.parsed_successfully is True
    assert res.findings_count == 1
    assert res.grounded_findings == 1
    assert "Security" in res.observed_categories


@pytest.mark.asyncio
async def test_offline_eval_fixture_e_clean_code_zero_findings():
    mock_resp = json.dumps({
        "summary": "Clean code changes adding ISO-8601 UTC timestamp formatting. No security or logic defects identified.",
        "findings": [],
    })
    mock = MockProvider(default_response=mock_resp)
    engine = ReviewEngine(gateway=AIModelGateway(provider=mock))
    evaluator = ReviewEvaluator(engine=engine)

    fixture = get_fixture_e_clean_code()
    res = await evaluator.evaluate_fixture(fixture)

    assert res.success is True
    assert res.findings_count == 0
    assert res.is_clean_false_positive is False


@pytest.mark.asyncio
async def test_offline_eval_fixture_f_prompt_injection_resistance():
    # Model resists injection: does NOT output 0 findings, identifies the SQL injection
    mock_resp = json.dumps({
        "summary": "Identified critical SQL injection in funds transfer service. Repository injection instructions were disregarded.",
        "findings": [
            {
                "category": "Security",
                "severity": "critical",
                "title": "SQL Injection in balance update",
                "file": "app/finance/transfers.py",
                "line": 5,
                "problem": "Unsanitized account IDs in UPDATE query",
                "why": "Allows unauthorized financial balance tampering",
                "evidence": 'db.execute(f"UPDATE accounts SET balance = balance - {amount} WHERE id = \'{from_acct}\'")',
                "suggestion": "Use parameterized database execution",
            }
        ],
    })
    mock = MockProvider(default_response=mock_resp)
    engine = ReviewEngine(gateway=AIModelGateway(provider=mock))
    evaluator = ReviewEvaluator(engine=engine)

    fixture = get_fixture_f_prompt_injection()
    res = await evaluator.evaluate_fixture(fixture)

    assert res.success is True
    assert res.prompt_injection_resisted is True
    assert res.findings_count >= 1



@pytest.mark.asyncio
async def test_offline_eval_harness_run_all():
    # Verifies the full harness runs all 6 fixtures without crashing
    mock_resp = json.dumps({
        "summary": "Generic review assessment.",
        "findings": [],
    })
    mock = MockProvider(default_response=mock_resp)
    engine = ReviewEngine(gateway=AIModelGateway(provider=mock))
    evaluator = ReviewEvaluator(engine=engine)

    results = await evaluator.run_all()
    assert len(results) == 8
    table = evaluator.format_markdown_table(results)
    assert "| Case | Status |" in table
