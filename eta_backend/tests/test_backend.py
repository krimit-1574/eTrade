import os
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from eta_backend import database as db
from eta_backend import pdf_export
from eta_backend import quant_engine
from eta_backend import stock_screener


def intraday_candidate(symbol="TEST.NS", price=100.0):
    return {
        "symbol": symbol,
        "name": "Test Ltd",
        "currentPrice": price,
        "change": 1.0,
        "changePct": 1.0,
        "rsi": 55.0,
        "vwap": 99.0,
        "volumeRatio": 1.5,
        "score": 75,
    }


def longterm_candidate(symbol="TEST.NS", price=100.0):
    return {
        "symbol": symbol,
        "name": "Test Ltd",
        "currentPrice": price,
        "change": 1.0,
        "changePct": 1.0,
        "pe": 20,
        "roe": 18,
        "debtToEquity": 0.2,
        "revGrowth": 12,
        "profitMargin": 15,
        "dividendYield": 1.0,
        "sector": "IT",
        "score": 75,
    }


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_path = db.DB_PATH
        db.DB_PATH = os.path.join(self.temp_dir.name, "test.db")
        db.init_db()

    def tearDown(self):
        db.DB_PATH = self.original_path
        self.temp_dir.cleanup()

    def test_login_identifiers_cannot_shadow_username_or_email(self):
        first = db.create_user("alice", "password123", "shared@example.com")
        self.assertIsNotNone(first)
        self.assertIsNone(db.create_user("shared@example.com", "password123", "second@example.com"))
        self.assertIsNone(db.create_user("bob", "password123", "ALICE"))
        self.assertEqual(db.verify_user("shared@example.com", "password123"), first)

    def test_watchlist_add_is_idempotent_and_toggle_removes_membership(self):
        user_id = db.create_user("watcher", "password123")
        db.add_watchlist(user_id, "One", "aapl", 100, "above")
        db.add_watchlist(user_id, "Updated", "AAPL", 90, "below")
        rows = db.get_watchlist(user_id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Updated")
        self.assertFalse(db.toggle_watchlist(user_id, "Updated", "AAPL")["is_in_watchlist"])
        self.assertFalse(db.is_in_watchlist(user_id, "AAPL"))

    def test_paper_positions_are_isolated_from_manual_portfolio(self):
        user_id = db.create_user("trader", "password123")
        db.add_portfolio(user_id, "Manual", "TCS.NS", 2, 3000)
        result = db.execute_trade(user_id, "TCS.NS", "Paper", "BUY", 3, 3100)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(db.get_portfolio(user_id)[0]["quantity"], 2)
        self.assertEqual(db.get_paper_positions(user_id)[0]["quantity"], 3)

    def test_ai_session_owner_cannot_be_replaced(self):
        first = db.create_user("first", "password123")
        second = db.create_user("second", "password123")
        payload = {"id": "session-1", "symbol": "TCS", "start_time": "now"}
        db.save_ai_session(payload, first)
        with self.assertRaises(PermissionError):
            db.save_ai_session(payload, second)
        self.assertIsNotNone(db.get_ai_session("session-1", first))
        self.assertIsNone(db.get_ai_session("session-1", second))


class OutputValidationTests(unittest.TestCase):
    def test_intraday_ai_output_rejects_hallucinations_and_invalid_levels(self):
        candidates = [intraday_candidate("GOOD.NS"), intraday_candidate("BACKUP.NS", 200)]
        picks = [
            {"symbol": "NOT-A-CANDIDATE.NS", "target": 999999, "stopLoss": 0.01, "confidence": 999},
            {"symbol": "GOOD.NS", "target": 101.5, "stopLoss": 99, "confidence": 80, "riskLevel": "Low"},
            {"symbol": "GOOD.NS", "target": 102, "stopLoss": 98, "confidence": 70},
        ]
        result = stock_screener._validated_intraday_picks(picks, candidates)
        self.assertEqual([item["symbol"] for item in result], ["GOOD.NS", "BACKUP.NS"])
        self.assertTrue(all(item["currentPrice"] > 0 for item in result))
        self.assertLess(result[0]["stopLoss"], result[0]["currentPrice"])
        self.assertGreater(result[0]["target"], result[0]["currentPrice"])

    def test_longterm_ai_output_is_candidate_scoped_and_bounded(self):
        candidates = [longterm_candidate("GOOD.NS")]
        result = stock_screener._validated_longterm_picks(
            [{"symbol": "OTHER.NS", "target1Y": 1000, "confidence": 99}],
            candidates,
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["symbol"], "GOOD.NS")
        self.assertLessEqual(result[0]["target1Y"], 300)

    def test_flat_price_rsi_is_neutral(self):
        index = pd.date_range("2026-01-01", periods=100, freq="D")
        frame = pd.DataFrame({
            "Open": np.full(100, 100.0),
            "High": np.full(100, 100.0),
            "Low": np.full(100, 100.0),
            "Close": np.full(100, 100.0),
            "Volume": np.full(100, 1000.0),
        }, index=index)
        result = quant_engine.calculate_technical_indicators(frame)
        self.assertFalse(result.empty)
        self.assertTrue((result["RSI"] == 50).all())

    def test_pdf_export_handles_unicode_and_closes_temp_file(self):
        path = pdf_export.create_pdf_report({
            "companyName": "Test ✓ ₹",
            "symbol": "TEST",
            "description": "Unicode — analysis",
            "aiScore": 50,
            "advice": {"add": False, "reasoning": "Avoid ✗"},
        })
        try:
            output = Path(path)
            self.assertTrue(output.exists())
            self.assertGreater(output.stat().st_size, 100)
            with output.open("rb") as handle:
                self.assertEqual(handle.read(4), b"%PDF")
        finally:
            Path(path).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
