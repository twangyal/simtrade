"""Invalid request values stay client errors without echoing sensitive input."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from databases import Database
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

with patch.dict(os.environ, {
    "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    "SECRET_KEY": "validation-tests-only-synthetic-signing-key-over-32-bytes",
    "MARKET_DATA_MODE": "disabled",
    "MARKET_DATA_ENABLED": "false",
}), patch("dotenv.load_dotenv"):
    import main
    from database import Base
    from market import QuoteBook
    from models import OrderReceipt, Portfolio, Trade, User
    from security import create_access_token


class RequestValidationTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.url = f"sqlite:///{Path(directory.name) / 'validation.sqlite'}"
        self.engine = create_engine(self.url)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.db = Database(self.url)
        with self.engine.begin() as connection:
            connection.execute(User.__table__.insert().values(
                username="trader", hashed_password="unused", balance=100000,
                short_liability=0, networth=100000,
            ))

        async def isolated_db():
            async with self.db:
                async with self.db.transaction():
                    yield self.db

        main.app.dependency_overrides[main.get_db] = isolated_db
        self.addCleanup(main.app.dependency_overrides.pop, main.get_db, None)
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        book = QuoteBook()
        book.update({"symbol": "AAPL", "price": 100})
        quotes = patch.object(main, "quote_book", book)
        quotes.start()
        self.addCleanup(quotes.stop)
        self.headers = {
            "Authorization": f"Bearer {create_access_token({'sub': 'trader'})}",
            "Content-Type": "application/json",
        }
        # Keep existing holdings, history and a receipt to detect any mutations.
        filled = self.client.post("/BUY", headers=self.headers, json={
            "symbol": "AAPL", "quantity": 2, "client_order_id": str(uuid4()),
        })
        self.assertEqual(filled.status_code, 200, filled.text)
        self.before = self.snapshot()

    def snapshot(self):
        with self.engine.connect() as connection:
            return {
                model.__tablename__: [dict(row) for row in connection.execute(
                    select(model.__table__).order_by(model.id)
                ).mappings()]
                for model in (User, Portfolio, Trade, OrderReceipt)
            }

    def assert_safe_rejection(self, path, body, *, private_text=None):
        response = self.client.post(path, headers=self.headers, content=body)
        self.assertEqual(response.status_code, 422, response.text)
        self.assertTrue(response.headers["content-type"].startswith("application/json"))

        def reject_constant(value):
            raise AssertionError(f"Response contains a non-JSON numeric constant: {value}")

        payload = json.loads(response.text, parse_constant=reject_constant)
        self.assertEqual(set(payload), {"detail"})
        self.assertIsInstance(payload["detail"], list)
        self.assertTrue(payload["detail"])
        for error in payload["detail"]:
            self.assertTrue({"loc", "msg", "type"}.issubset(error))
            self.assertNotIn("input", error)
        if private_text is not None:
            self.assertNotIn(private_text, response.text)
        self.assertEqual(self.snapshot(), self.before)
        return payload["detail"]

    def test_raw_nonfinite_order_quantities_return_422_without_writes(self):
        for side in ("BUY", "SELL"):
            for quantity in ("NaN", "Infinity", "-Infinity", "1e309", "-1e309"):
                with self.subTest(side=side, quantity=quantity):
                    errors = self.assert_safe_rejection(
                        f"/{side}",
                        '{"symbol":"AAPL","quantity":' + quantity
                        + ',"client_order_id":"' + str(uuid4()) + '"}',
                    )
                    self.assertEqual(errors[0]["loc"], ["body", "quantity"])
                    self.assertEqual(errors[0]["type"], "finite_number")

    def test_nested_invalid_order_values_are_not_echoed(self):
        private = "synthetic-private-nested-value"
        bodies = (
            '{"symbol":"AAPL","quantity":{"password":"' + private
            + '","nested":[NaN,{"value":Infinity}]}}',
            '{"symbol":{"private":"' + private + '","value":-Infinity},"quantity":1}',
            '[{"private":"' + private + '","value":NaN}]',
        )
        for side in ("BUY", "SELL"):
            for body in bodies:
                with self.subTest(side=side, body=body):
                    self.assert_safe_rejection(f"/{side}", body, private_text=private)

    def test_nonfinite_passwords_are_safe_validation_errors(self):
        for path in ("/register", "/login"):
            for password in ("NaN", "Infinity", "-Infinity", "1e309"):
                with self.subTest(path=path, password=password):
                    errors = self.assert_safe_rejection(
                        path, '{"username":"new-user","password":' + password + '}',
                    )
                    self.assertEqual(errors[0]["loc"], ["body", "password"])
                    self.assertEqual(errors[0]["type"], "string_type")

    def test_invalid_credentials_do_not_echo_passwords(self):
        private = "synthetic-password-that-must-not-appear"
        for path in ("/register", "/login"):
            for body in (
                json.dumps({"username": "new-user", "password": private * 3}),
                json.dumps({"username": "new-user", "password": "\u00e9" * 37}),
                json.dumps({"password": private}),
                '{"username":"new-user","password":{"secret":"' + private
                + '","value":Infinity}}',
            ):
                with self.subTest(path=path, body=body):
                    self.assert_safe_rejection(path, body, private_text=private)

    def test_surrogate_usernames_are_rejected_before_lookup_or_hashing(self):
        for path in ("/register", "/login"):
            for username in ("\ud800", "name-\udfff", "\ud800\ud800"):
                with self.subTest(path=path, username=repr(username)), \
                        patch.object(main.crud, "get_user") as lookup, \
                        patch.object(main, "get_password_hash") as hashing:
                    errors = self.assert_safe_rejection(path, json.dumps({
                        "username": username, "password": "synthetic-valid-password",
                    }))
                    self.assertEqual(errors[0]["loc"], ["body", "username"])
                    self.assertEqual(errors[0]["type"], "string_unicode")
                    lookup.assert_not_called()
                    hashing.assert_not_called()

    def test_surrogate_passwords_return_422_without_echoing_input(self):
        for path in ("/register", "/login"):
            for password in ("\ud800", "synthetic-private-password-\udfff"):
                with self.subTest(path=path, password=repr(password)):
                    errors = self.assert_safe_rejection(path, json.dumps({
                        "username": "new-user", "password": password,
                    }), private_text="synthetic-private-password")
                    self.assertEqual(errors[0]["loc"], ["body", "password"])
                    self.assertEqual(errors[0]["type"], "string_unicode")

    def test_valid_unicode_usernames_keep_surrounding_whitespace(self):
        username = " \u00e9l\u00e8ve-\U0001f600 "
        credentials = {"username": username, "password": "synthetic-valid-password"}
        registered = self.client.post("/register", json=credentials)
        self.assertEqual(registered.status_code, 200, registered.text)
        with self.engine.connect() as connection:
            usernames = connection.execute(select(User.username)).scalars().all()
        self.assertIn(username, usernames)
        logged_in = self.client.post("/login", json=credentials)
        self.assertEqual(logged_in.status_code, 200, logged_in.text)

    def test_numeric_constraints_and_standard_error_fields_are_preserved(self):
        for quantity, error_type, context in (
            (0, "greater_than", {"gt": 0.0}),
            (1000001, "less_than_equal", {"le": 1000000.0}),
        ):
            with self.subTest(quantity=quantity):
                errors = self.assert_safe_rejection(
                    "/BUY", json.dumps({"symbol": "AAPL", "quantity": quantity}),
                )
                self.assertEqual(errors[0]["loc"], ["body", "quantity"])
                self.assertEqual(errors[0]["type"], error_type)
                self.assertEqual(errors[0]["ctx"], context)
                self.assertIsInstance(errors[0]["msg"], str)

        errors = self.assert_safe_rejection(
            "/register", json.dumps({"username": "new-user", "password": "x" * 73}),
        )
        self.assertEqual(errors[0]["loc"], ["body", "password"])
        self.assertEqual(errors[0]["type"], "string_too_long")
        self.assertEqual(errors[0]["ctx"], {"max_length": 72})

    def test_custom_validator_errors_remain_json_safe(self):
        errors = self.assert_safe_rejection(
            "/BUY", '{"symbol":"AAPL","quantity":0.000000001}',
        )
        self.assertEqual(errors[0]["loc"], ["body", "quantity"])
        self.assertEqual(errors[0]["type"], "value_error")
        self.assertIn("Quantity supports at most 8 decimal places", errors[0]["msg"])

    def test_missing_field_does_not_echo_the_rest_of_the_body(self):
        private = "synthetic-private-extra-field"
        errors = self.assert_safe_rejection(
            "/BUY", json.dumps({"symbol": "AAPL", "private": private}), private_text=private,
        )
        self.assertEqual(errors[0]["loc"], ["body", "quantity"])
        self.assertEqual(errors[0]["type"], "missing")

    def test_malformed_json_retains_standard_decode_error(self):
        private = "synthetic-password-in-malformed-json"
        errors = self.assert_safe_rejection(
            "/register", '{"password":"' + private + '" "username":"new-user"}',
            private_text=private,
        )
        self.assertEqual(errors[0]["type"], "json_invalid")
        self.assertEqual(errors[0]["msg"], "JSON decode error")
        self.assertEqual(errors[0]["loc"][0], "body")
        self.assertIsInstance(errors[0]["loc"][1], int)
        self.assertIn("error", errors[0]["ctx"])

    def test_unrelated_application_errors_remain_server_errors(self):
        with patch.object(main.crud, "get_user", side_effect=RuntimeError("synthetic failure")):
            response = self.client.post("/BUY", headers=self.headers, json={
                "symbol": "AAPL", "quantity": 1, "client_order_id": str(uuid4()),
            })
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.text, "Internal Server Error")
        self.assertEqual(self.snapshot(), self.before)


if __name__ == "__main__":
    unittest.main()
