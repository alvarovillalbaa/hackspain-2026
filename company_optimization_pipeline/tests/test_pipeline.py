import csv
import json
import tempfile
import unittest
from pathlib import Path

from pipeline import run_pipeline


class PipelineTests(unittest.TestCase):
    def write_csv(self, root, name, fields, rows):
        with (root / f"{name}.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

    def fixture(self, root):
        self.write_csv(root, "companies", ["company_id", "group_id", "country", "currency", "erp", "created_at"], [
            {"company_id": "C1", "group_id": "G1", "country": "ES", "currency": "EUR", "erp": "", "created_at": "2024-01-01"}
        ])
        self.write_csv(root, "banking_products", ["product_id", "company_id", "label", "type", "bank_name", "service", "currency", "created_at"], [
            {"product_id": "P1", "company_id": "C1", "label": "A", "type": "checking", "bank_name": "B", "service": "s", "currency": "EUR", "created_at": "2024-01-01"}
        ])
        self.write_csv(root, "transactions", ["transaction_id", "company_id", "product_id", "date", "value_date", "amount", "exchange_rate", "status", "accounting_status", "category", "description", "counterparty_id"], [
            {"transaction_id": "T1", "company_id": "C1", "product_id": "P1", "date": "2026-01-01", "value_date": "2026-01-01", "amount": "100", "exchange_rate": "1", "status": "booked", "accounting_status": "RECONCILIATION_PENDING", "category": "collection", "description": "sale", "counterparty_id": "X"},
            {"transaction_id": "T2", "company_id": "C1", "product_id": "P1", "date": "2026-01-02", "value_date": "2026-01-02", "amount": "-20", "exchange_rate": "1", "status": "booked", "accounting_status": "RECONCILIATION_DISCARDED", "category": "interest_charge", "description": "interest", "counterparty_id": ""},
            {"transaction_id": "T3", "company_id": "C1", "product_id": "P1", "date": "2026-01-03", "value_date": "2026-01-03", "amount": "-30", "exchange_rate": "1", "status": "booked", "accounting_status": "", "category": "collection_refund", "description": "refund", "counterparty_id": "X"},
            {"transaction_id": "T4", "company_id": "C1", "product_id": "P1", "date": "2026-01-03", "value_date": "2026-01-03", "amount": "-30", "exchange_rate": "1", "status": "booked", "accounting_status": "", "category": "collection_refund", "description": "refund", "counterparty_id": "X"}
        ])
        self.write_csv(root, "invoices", ["operation_id", "company_id", "document_type", "issuance_date", "due_date", "payment_date", "amount", "pending_amount", "currency", "accounting_currency", "exchange_rate", "status", "concept", "counterparty_id"], [
            {"operation_id": "I1", "company_id": "C1", "document_type": "invoice", "issuance_date": "2025-01-01", "due_date": "2025-02-01", "payment_date": "", "amount": "-70", "pending_amount": "-50", "currency": "EUR", "accounting_currency": "EUR", "exchange_rate": "1", "status": "pending", "concept": "x", "counterparty_id": "Y"},
            {"operation_id": "I2", "company_id": "C1", "document_type": "invoice", "issuance_date": "2026-05-02", "due_date": "2026-05-01", "payment_date": "2026-04-01", "amount": "10", "pending_amount": "0", "currency": "EUR", "accounting_currency": "EUR", "exchange_rate": "1", "status": "paid", "concept": "x", "counterparty_id": "Y"},
            # status=overdue rows carry payment_date == due_date in the dataset although nothing was paid; it must be ignored.
            {"operation_id": "I3", "company_id": "C1", "document_type": "invoice", "issuance_date": "2025-01-01", "due_date": "2025-02-01", "payment_date": "2025-02-01", "amount": "30", "pending_amount": "30", "currency": "EUR", "accounting_currency": "EUR", "exchange_rate": "1", "status": "overdue", "concept": "x", "counterparty_id": "Y"},
            {"operation_id": "I4", "company_id": "C1", "document_type": "invoice", "issuance_date": "2025-01-01", "due_date": "2025-02-01", "payment_date": "", "amount": "999", "pending_amount": "999", "currency": "EUR", "accounting_currency": "EUR", "exchange_rate": "1", "status": "cancel", "concept": "x", "counterparty_id": "Y"},
            {"operation_id": "I5", "company_id": "C1", "document_type": "invoice", "issuance_date": "2025-01-01", "due_date": "2025-02-01", "payment_date": "2025-02-01", "amount": "999", "pending_amount": "1", "currency": "EUR", "accounting_currency": "EUR", "exchange_rate": "1", "status": "paid", "concept": "x", "counterparty_id": "Y"}
        ])
        self.write_csv(root, "debt_products", ["product_id", "company_id", "label", "type", "bank_name", "service", "currency", "created_at", "granted", "outstanding", "liquidity"], [
            {"product_id": "D1", "company_id": "C1", "label": "L", "type": "loan", "bank_name": "B", "service": "s", "currency": "EUR", "created_at": "2024-01-01", "granted": "-1000", "outstanding": "-800", "liquidity": ""},
            {"product_id": "LOC", "company_id": "C1", "label": "L", "type": "lineofcredit", "bank_name": "B", "service": "s", "currency": "EUR", "created_at": "2024-01-01", "granted": "-1000", "outstanding": "200", "liquidity": ""}
        ])
        self.write_csv(root, "debt_schedule_config", ["product_id", "company_id", "settlement_product_id", "currency", "amortization_type", "interest_calc_method", "amortising_frequency", "granted_balance", "outstanding_balance", "total_periods", "next_payment_date", "last_payment_date", "annual_interest_rate_or_spread", "interest_type"], [
            {"product_id": "D1", "company_id": "C1", "settlement_product_id": "P1", "currency": "EUR", "amortization_type": "constant quote", "interest_calc_method": "30/360", "amortising_frequency": "monthly", "granted_balance": "1000", "outstanding_balance": "800", "total_periods": "12", "next_payment_date": "2026-10-01", "last_payment_date": "2026-08-01", "annual_interest_rate_or_spread": "0.08", "interest_type": "fixed"}
        ])
        self.write_csv(root, "balances", ["product_id", "company_id", "date", "balance", "available", "granted", "liquidity", "countable"], [
            {"product_id": "P1", "company_id": "C1", "date": "2026-09-01", "balance": "500", "available": "", "granted": "", "liquidity": "", "countable": ""},
            {"product_id": "D1", "company_id": "C1", "date": "2026-09-01", "balance": "-800", "available": "", "granted": "", "liquidity": "", "countable": ""}
        ])
        self.write_csv(root, "groups", ["group_id", "erp", "n_companies_in_sample"], [{"group_id": "G1", "erp": "", "n_companies_in_sample": "1"}])

    def test_direction_sensitive_metrics_and_anomalies(self):
        with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as output:
            self.fixture(Path(data))
            run_pipeline(Path(data), Path(output), extraction_date="2026-09-01")
            with (Path(output) / "company_metrics.csv").open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            row = rows[0]
            self.assertEqual(float(row["booked_inflow"]), 100.0)
            self.assertEqual(float(row["booked_outflow"]), 80.0)
            self.assertEqual(float(row["collection_refund_outflow"]), 60.0)
            self.assertEqual(int(row["duplicate_candidate_count"]), 1)
            # I1 (-50) + I3 (+30); I4 cancelled and I5 paid are excluded despite residual pending_amount.
            self.assertEqual(float(row["overdue_invoice_abs_exposure"]), 80.0)
            self.assertEqual(int(row["overdue_invoice_count"]), 2)
            self.assertEqual(float(row["overdue_pending_positive"]), 30.0)
            self.assertEqual(float(row["overdue_pending_negative"]), 50.0)
            self.assertEqual(int(row["invoice_lifecycle_anomaly_count"]), 1)
            self.assertIn("sign", row["debt_sign_warning"].lower())

    def test_refinancing_requires_usable_positive_schedule_values(self):
        with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as output:
            self.fixture(Path(data))
            run_pipeline(Path(data), Path(output), extraction_date="2026-09-01")
            opportunities = json.loads((Path(output) / "opportunities.json").read_text())
            refinance = [x for x in opportunities if x["opportunity_type"] == "refinancing_screen"]
            self.assertEqual(len(refinance), 1)
            # outstanding comes from debt_products (|-800|), not the schedule snapshot.
            self.assertAlmostEqual(float(refinance[0]["annual_interest_cost_proxy"]), 64.0)
            self.assertEqual(refinance[0]["product_evidence"][0]["outstanding_source"], "debt_products")
            self.assertIn("screen", refinance[0]["caveat"].lower())

    def test_mixed_currencies_are_separate_and_ranked_within_currency_and_type(self):
        with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as output:
            root = Path(data)
            self.fixture(root)
            with (root / "banking_products.csv").open("a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerow(["P2", "C1", "USD account", "checking", "B", "s", "USD", "2024-01-01"])
            with (root / "transactions.csv").open("a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerow(["T5", "C1", "P2", "2026-01-04", "2026-01-04", "-900", "1", "booked", "PENDING", "interest_charge", "", "Z"])
                # Transaction on a debt product (line of credit): currency must come from debt_products, not UNKNOWN.
                csv.writer(handle).writerow(["T6", "C1", "D1", "2026-01-05", "2026-01-05", "-5", "1", "booked", "", "interest_charge", "", ""])
            run_pipeline(root, Path(output), extraction_date="2026-09-01")
            with (Path(output) / "company_metrics.csv").open(newline="", encoding="utf-8") as handle:
                metrics = {row["metric_currency"]: row for row in csv.DictReader(handle)}
            self.assertEqual(set(metrics), {"EUR", "USD"})
            self.assertEqual(float(metrics["EUR"]["interest_charge_outflow"]), 25.0)
            opportunities = json.loads((Path(output) / "opportunities.json").read_text())
            self.assertTrue(all("global_rank" not in row and row["rank_scope"] == "currency_and_type" for row in opportunities))
            self.assertEqual({row["currency"] for row in opportunities}, {"EUR", "USD"})
            # Each (currency, type) has exactly one company here, so every rank must be 1: types are not ranked against each other.
            self.assertTrue(all(row["currency_rank"] == 1 for row in opportunities))

    def test_refinance_uses_debt_products_balance_excludes_repaid_and_flags_stale(self):
        with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as output:
            root = Path(data)
            self.fixture(root)
            with (root / "debt_products.csv").open("a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerow(["REPAID", "C1", "L", "loan", "B", "s", "EUR", "2024-01-01", "-1000", "0", ""])
            fields = ["product_id", "company_id", "settlement_product_id", "currency", "amortization_type", "interest_calc_method", "amortising_frequency", "granted_balance", "outstanding_balance", "total_periods", "next_payment_date", "last_payment_date", "annual_interest_rate_or_spread", "interest_type"]
            base = {field: "" for field in fields}
            base.update({"company_id": "C1", "currency": "EUR", "outstanding_balance": "100", "annual_interest_rate_or_spread": "0.1", "interest_type": "fixed"})
            schedule = []
            for product, next_date in (("D1", "2026-10-01"), ("REPAID", "2026-11-01"), ("OLD", "2026-08-01")):
                schedule.append({**base, "product_id": product, "next_payment_date": next_date})
            self.write_csv(root, "debt_schedule_config", fields, schedule)
            run_pipeline(root, Path(output), extraction_date="2026-09-01")
            opportunities = json.loads((Path(output) / "opportunities.json").read_text())
            refinance = [x for x in opportunities if x["opportunity_type"] == "refinancing_screen"]
            self.assertEqual(len(refinance), 1)
            evidence = {x["product_id"]: x for x in refinance[0]["product_evidence"]}
            # REPAID (debt_products outstanding 0) is dropped; OLD (stale schedule, no debt_products row) stays, flagged.
            self.assertEqual(set(evidence), {"D1", "OLD"})
            self.assertEqual(evidence["D1"]["outstanding"], "800")
            self.assertFalse(evidence["D1"]["stale_schedule"])
            self.assertEqual(evidence["OLD"]["outstanding_source"], "debt_schedule_config")
            self.assertTrue(evidence["OLD"]["stale_schedule"])
            self.assertAlmostEqual(float(refinance[0]["annual_interest_cost_proxy"]), 90.0)
            quality = json.loads((Path(output) / "data_quality.json").read_text())
            self.assertEqual(quality["stale_refinancing_schedule_count"], 1)
            self.assertEqual(quality["stale_refinancing_schedules"][0]["product_id"], "OLD")

    def test_direct_saving_levers_and_group_netting(self):
        with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as output:
            root = Path(data)
            self.fixture(root)
            # Sister company in the same group: cash-rich, debt-free -> only visible as a group netting opportunity.
            with (root / "companies.csv").open("a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerow(["C2", "G1", "ES", "EUR", "", "2024-01-01"])
            with (root / "banking_products.csv").open("a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerow(["P9", "C2", "A", "checking", "B", "s", "EUR", "2024-01-01"])
            with (root / "balances.csv").open("a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerow(["P9", "C2", "2026-09-01", "2000", "", "", "", ""])
            run_pipeline(root, Path(output), extraction_date="2026-09-01")
            with (Path(output) / "company_metrics.csv").open(newline="", encoding="utf-8") as handle:
                row = {r["company_id"]: r for r in csv.DictReader(handle)}["C1"]
            self.assertEqual(float(row["cash_balance"]), 500.0)  # debt-product balance is not cash
            self.assertEqual(float(row["debt_outstanding_abs_proxy"]), 1000.0)
            self.assertEqual(float(row["idle_cash_vs_debt"]), 500.0)
            self.assertEqual((float(row["loc_granted"]), float(row["loc_drawn"]), float(row["loc_undrawn"])), (1000.0, 200.0, 800.0))
            self.assertEqual(int(row["history_months"]), 9)  # 2026-01 .. 2026-09
            self.assertAlmostEqual(float(row["implied_debt_rate"]), 20 * 12 / 9 / 1000, places=6)
            self.assertAlmostEqual(float(row["idle_cash_savings_proxy"]), 13.33)
            opportunities = json.loads((Path(output) / "opportunities.json").read_text())
            self.assertEqual([x["company_id"] for x in opportunities if x["opportunity_type"] == "idle_cash_review"], ["C1"])
            with (Path(output) / "group_metrics.csv").open(newline="", encoding="utf-8") as handle:
                group = list(csv.DictReader(handle))[0]
            self.assertEqual((group["group_id"], int(group["company_count"])), ("G1", 2))
            self.assertEqual(float(group["group_cash_positive"]), 2500.0)
            self.assertEqual(float(group["group_debt"]), 1000.0)
            self.assertEqual(float(group["group_netting_incremental"]), 500.0)  # min(2500,1000) - 500 already offset by C1
            self.assertAlmostEqual(float(group["group_netting_savings_proxy"]), 13.33)

    def test_working_capital_series(self):
        with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as output:
            self.fixture(Path(data))
            run_pipeline(Path(data), Path(output), extraction_date="2026-09-01")
            with (Path(output) / "working_capital_monthly.csv").open(newline="", encoding="utf-8") as handle:
                series = {r["month"]: r for r in csv.DictReader(handle)}
            self.assertEqual(sorted(series), [f"2026-0{i}" for i in range(1, 10)])
            jan = series["2026-01"]
            # I3 (+30, unpaid, due 2025-02) folds into the first month as open+overdue+90d; I5 opened and paid before start nets to 0;
            # I1 (-70) is a payable; I4 is cancelled.
            self.assertEqual((float(jan["receivables_open"]), float(jan["receivables_overdue"]), float(jan["receivables_overdue_90d"])), (30.0, 30.0, 30.0))
            self.assertEqual(float(jan["payables_open"]), 70.0)
            self.assertEqual(float(jan["cash_end_proxy"]), 500.0)  # no cash-account flows after January, so cash equals the as-of balance
            self.assertEqual((float(jan["inflow"]), float(jan["outflow"]), float(jan["debt_service_outflow"])), (100.0, 80.0, 20.0))
            self.assertEqual(jan["receivables_late_days_p50"], "")  # nothing paid that month
            self.assertEqual(series["2026-05"]["receivables_late_days_p50"], "1")  # I2 paid one day after due
            self.assertNotIn("score", jan)  # scoring/policy belongs to the agent layer, not the pipeline

    def test_duplicate_key_preserves_decimal_source_precision(self):
        with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as output:
            root = Path(data)
            self.fixture(root)
            fields = ["transaction_id", "company_id", "product_id", "date", "value_date", "amount", "exchange_rate", "status", "accounting_status", "category", "description", "counterparty_id"]
            common = {"company_id": "C1", "product_id": "P1", "date": "2026-01-01", "value_date": "2026-01-01", "exchange_rate": "1", "status": "booked", "accounting_status": "", "category": "collection", "description": "", "counterparty_id": "X"}
            self.write_csv(root, "transactions", fields, [
                {**common, "transaction_id": "T1", "amount": "1.0000001"},
                {**common, "transaction_id": "T2", "amount": "1.0000002"},
            ])
            run_pipeline(root, Path(output), extraction_date="2026-09-01")
            with (Path(output) / "company_metrics.csv").open(newline="", encoding="utf-8") as handle:
                metrics = list(csv.DictReader(handle))
            self.assertEqual(int(metrics[0]["duplicate_candidate_count"]), 0)


if __name__ == "__main__":
    unittest.main()
