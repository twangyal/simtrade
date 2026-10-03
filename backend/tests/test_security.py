"""Authentication regressions using synthetic secrets and isolated config files."""

import base64
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import timedelta
from unittest.mock import patch

import jwt
from fastapi import HTTPException


SECURITY_SOURCE = Path(__file__).resolve().parents[1] / "security.py"
TEST_SECRET = "test-only-signing-key-9e373c4be674a2f508a7"
OTHER_SECRET = "another-test-only-signing-key-0d6a39bc567e"


class ConfigurationTests(unittest.TestCase):
    def run_import(self, *, secret=None, dotenv_secret=None, expected_secret=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            backend = root / "backend"
            backend.mkdir()
            shutil.copyfile(SECURITY_SOURCE, backend / "security.py")
            if dotenv_secret is not None:
                (backend / "api.env").write_text(
                    f"SECRET_KEY={dotenv_secret}\n", encoding="utf-8"
                )
            # An unrelated CWD ensures config resolution uses the module path.
            working_directory = root / "elsewhere"
            working_directory.mkdir()
            environment = {"PYTHONPATH": str(backend), "PYTHONDONTWRITEBYTECODE": "1"}
            if secret is not None:
                environment["SECRET_KEY"] = secret
            script = "import security"
            if expected_secret is not None:
                script += f"; assert security.SECRET_KEY == {expected_secret!r}"
            return subprocess.run(
                [sys.executable, "-c", script],
                cwd=working_directory,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
                timeout=15,
            )

    def test_missing_secret_fails_startup(self):
        result = self.run_import()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SECRET_KEY", result.stderr)

    def test_empty_short_and_placeholder_secrets_fail_startup(self):
        for secret in ("", "   ", "your-secret-key", "too-short", "x" * 31):
            with self.subTest(secret_length=len(secret)):
                result = self.run_import(secret=secret)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("SECRET_KEY", result.stderr)

    def test_loads_api_env_relative_to_security_module(self):
        result = self.run_import(dotenv_secret=TEST_SECRET, expected_secret=TEST_SECRET)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_process_environment_takes_precedence(self):
        result = self.run_import(
            secret=TEST_SECRET, dotenv_secret=OTHER_SECRET, expected_secret=TEST_SECRET
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_invalid_process_secret_is_not_replaced_by_dotenv(self):
        result = self.run_import(secret="", dotenv_secret=TEST_SECRET)
        self.assertNotEqual(result.returncode, 0)


class TokenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        isolated_source = Path(cls.directory.name) / "security.py"
        shutil.copyfile(SECURITY_SOURCE, isolated_source)
        # Never import the original module beside the user's real api.env.
        spec = importlib.util.spec_from_file_location("isolated_security", isolated_source)
        cls.security = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"SECRET_KEY": TEST_SECRET}):
            spec.loader.exec_module(cls.security)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def signed_token(self, claims=None, *, secret=TEST_SECRET, algorithm="HS256"):
        if claims is None:
            claims = {"sub": "alice", "exp": int(time.time()) + 300}
        return jwt.encode(claims, secret, algorithm=algorithm)

    def assert_unauthorized(self, header):
        with self.assertRaises(HTTPException) as raised:
            self.security.decode_access_token(header)
        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.headers, {"WWW-Authenticate": "Bearer"})
        self.assertEqual(raised.exception.detail, "Could not validate credentials")

    def test_accepts_case_insensitive_bearer_scheme(self):
        token = self.signed_token()
        for scheme in ("Bearer", "bearer", "BEARER", "bEaReR"):
            with self.subTest(scheme=scheme):
                result = self.security.decode_access_token(f"{scheme} {token}")
                self.assertEqual(result.username, "alice")

    def test_accepts_multiple_scheme_separator_spaces(self):
        result = self.security.decode_access_token(f"Bearer   {self.signed_token()}")
        self.assertEqual(result.username, "alice")

    def test_rejects_missing_and_malformed_bearer_headers(self):
        token = self.signed_token()
        headers = (
            None,
            "",
            "   ",
            token,
            "Bearer",
            "Bearer ",
            f"Basic {token}",
            f"BearerBearer {token}",
            f"Bearer {token} extra",
            f"Bearer {token} ",
            f" Bearer {token}",
            f"Bearer\t{token}",
            f"Bearer \n{token}",
            f"Bearer {token}, Bearer {token}",
        )
        for header in headers:
            with self.subTest(header_kind=repr(header)[:30]):
                self.assert_unauthorized(header)

    def test_rejects_invalid_expired_and_wrong_algorithm_tokens(self):
        tokens = (
            "not-a-token",
            "a.b.c",
            self.signed_token(secret=OTHER_SECRET),
            self.signed_token(algorithm="HS384"),
            self.signed_token({"sub": "alice", "exp": int(time.time()) - 1}),
            jwt.encode({"sub": "alice", "exp": int(time.time()) + 300}, None, algorithm="none"),
        )
        for token in tokens:
            with self.subTest(token_length=len(token)):
                self.assert_unauthorized(f"Bearer {token}")

    def test_expiration_claim_is_required(self):
        self.assert_unauthorized(f"Bearer {self.signed_token({'sub': 'alice'})}")

    def test_deeply_nested_jwt_header_is_unauthorized(self):
        header = '{"alg":"HS256","extra":' + '[' * 10000 + '0' + ']' * 10000 + '}'
        encoded_header = base64.urlsafe_b64encode(header.encode()).rstrip(b"=").decode()
        self.assert_unauthorized(f"Bearer {encoded_header}.e30.AAAA")

    def test_subject_must_be_a_nonempty_string(self):
        for subject in (None, "", "   ", 123, True, [], {}):
            with self.subTest(subject=subject):
                token = self.signed_token({"sub": subject, "exp": int(time.time()) + 300})
                self.assert_unauthorized(f"Bearer {token}")
        self.assert_unauthorized(f"Bearer {self.signed_token({'exp': int(time.time()) + 300})}")

    def test_malformed_expiration_claims_are_unauthorized(self):
        for expiration in (None, [], {}, True, "not-a-date", "9999999999", float("inf"), float("nan")):
            with self.subTest(expiration=expiration):
                token = self.signed_token({"sub": "alice", "exp": expiration})
                self.assert_unauthorized(f"Bearer {token}")

    def test_malformed_optional_date_claims_are_unauthorized(self):
        for claim in ("iat", "nbf"):
            for value in (None, [], {}, float("inf")):
                with self.subTest(claim=claim, value=value):
                    token = self.signed_token(
                        {"sub": "alice", "exp": int(time.time()) + 300, claim: value}
                    )
                    self.assert_unauthorized(f"Bearer {token}")

    def test_created_token_round_trips_without_mutating_input(self):
        claims = {"sub": "alice"}
        token = self.security.create_access_token(claims, timedelta(minutes=1))
        decoded = self.security.decode_access_token(f"Bearer {token}")
        self.assertEqual(decoded.username, "alice")
        self.assertEqual(claims, {"sub": "alice"})

    def test_zero_expiration_does_not_fall_back_to_default(self):
        token = self.security.create_access_token({"sub": "alice"}, timedelta(0))
        self.assert_unauthorized(f"Bearer {token}")

    def test_password_hashing_remains_bcrypt_compatible(self):
        # A synthetic bcrypt hash created by the application's existing hasher.
        password_hash = self.security.get_password_hash("test-only-password")
        self.assertTrue(password_hash.startswith("$2"))
        self.assertTrue(self.security.verify_password("test-only-password", password_hash))
        self.assertFalse(self.security.verify_password("incorrect-password", password_hash))


if __name__ == "__main__":
    unittest.main()
