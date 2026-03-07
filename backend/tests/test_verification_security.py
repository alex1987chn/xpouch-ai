from datetime import UTC, datetime, timedelta

import pytest

from utils.verification import (
    VerificationCodeInvalidError,
    VerificationCodeRateLimitError,
    apply_failed_verification_attempt,
    enforce_send_rate_limit,
    generate_verification_code,
    mask_phone_number,
    register_code_send,
    utcnow,
    verify_code,
)


def test_generate_verification_code_is_numeric_and_expected_length():
    code = generate_verification_code(length=6)
    assert len(code) == 6
    assert code.isdigit()


def test_verify_code_rejects_locked_state():
    locked_until = utcnow() + timedelta(minutes=5)

    with pytest.raises(VerificationCodeRateLimitError):
        verify_code(
            stored_code="123456",
            provided_code="123456",
            expires_at=utcnow() + timedelta(minutes=5),
            locked_until=locked_until,
        )


def test_apply_failed_verification_attempt_locks_after_limit():
    attempts, locked_until = apply_failed_verification_attempt(
        current_attempts=4,
        max_attempts=5,
        lockout_minutes=10,
    )

    assert attempts == 5
    assert locked_until is not None


def test_enforce_send_rate_limit_blocks_fast_resend():
    with pytest.raises(VerificationCodeRateLimitError):
        enforce_send_rate_limit(
            last_sent_at=utcnow(),
            send_count=1,
            send_count_reset_at=utcnow() + timedelta(minutes=30),
            min_interval_seconds=60,
            max_send_per_window=5,
            window_minutes=30,
        )


def test_register_code_send_resets_expired_window():
    send_count, reset_at = register_code_send(
        send_count=5,
        send_count_reset_at=utcnow() - timedelta(seconds=1),
        window_minutes=30,
    )

    assert send_count == 1
    assert reset_at > datetime.now(UTC).replace(tzinfo=None)


def test_verify_code_uses_exact_match():
    with pytest.raises(VerificationCodeInvalidError):
        verify_code(
            stored_code="123456",
            provided_code="654321",
            expires_at=utcnow() + timedelta(minutes=5),
        )


def test_mask_phone_number_keeps_expected_length():
    assert mask_phone_number("13800138000") == "138****8000"
