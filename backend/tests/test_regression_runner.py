from evals.regression_runner import run_all_regression_checks


def test_regression_assets_runner_passes_local_assets():
    result = run_all_regression_checks()

    assert result["summary"]["total_checks"] == 3
    assert result["summary"]["total_cases"] >= 3
    assert result["summary"]["total_failed"] == 0
