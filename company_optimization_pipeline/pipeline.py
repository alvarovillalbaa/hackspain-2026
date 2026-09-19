#!/usr/bin/env python3
"""Streaming, dependency-free, currency-scoped company optimization screening."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from statistics import median

REQUIRED = {
    "groups": {"group_id", "n_companies_in_sample"},
    "companies": {"company_id", "group_id", "currency"},
    "banking_products": {"product_id", "company_id", "currency"},
    "balances": {"product_id", "company_id", "date", "balance"},
    "transactions": {"transaction_id", "company_id", "product_id", "date", "amount", "status", "accounting_status", "category", "counterparty_id"},
    "invoices": {"operation_id", "company_id", "issuance_date", "due_date", "payment_date", "amount", "pending_amount", "currency", "status"},
    "debt_products": {"product_id", "company_id", "currency", "granted", "outstanding"},
    "debt_schedule_config": {"product_id", "company_id", "currency", "outstanding_balance", "annual_interest_rate_or_spread", "next_payment_date"},
}

MONEY_FIELDS = [
    "booked_inflow", "booked_outflow", "booked_net_cash_proxy", "interest_charge_outflow",
    "interest_charge_inflow_or_reversal", "collection_refund_outflow", "collection_refund_inflow",
    "payment_refund_outflow", "payment_refund_inflow", "reconciliation_pending_abs_amount",
    "reconciliation_discarded_abs_amount", "duplicate_candidate_abs_amount",
    "overdue_invoice_abs_exposure", "overdue_pending_positive", "overdue_pending_negative",
    "debt_outstanding_abs_proxy", "refinancing_outstanding",
    "annual_interest_cost_proxy", "fee_outflow", "debt_repayment_outflow", "cash_balance",
    "idle_cash_vs_debt", "implied_debt_rate_raw", "implied_debt_rate", "idle_cash_savings_proxy", "loc_granted", "loc_drawn", "loc_undrawn",
]
# interest_charge includes fees/expenses and debt outstanding is 0 on repaid facilities, so raw implied rates explode
# on a tail of companies; the rate actually used for savings is capped here and the raw value is kept alongside.
IMPLIED_RATE_CAP = Decimal("0.25")
COUNT_FIELDS = [
    "booked_transaction_count", "reconciliation_pending_count", "reconciliation_discarded_count",
    "duplicate_candidate_count", "overdue_invoice_count", "invoice_lifecycle_anomaly_count",
    "debt_product_count", "refinancing_candidate_count", "fee_transaction_count", "history_months",
]
METRIC_FIELDS = ["company_id", "group_id", "company_currency", "metric_currency"] + COUNT_FIELDS + MONEY_FIELDS + ["debt_sign_warning"]
GROUP_FIELDS = ["group_id", "currency", "company_count", "group_cash_positive", "group_debt", "company_level_offset",
                "group_netting_incremental", "pooled_implied_rate", "group_netting_savings_proxy"]
WC_FIELDS = ["company_id", "currency", "month", "inflow", "outflow", "net", "collection_inflow", "debt_service_outflow",
             "cash_end_proxy", "receivables_open", "receivables_overdue", "receivables_overdue_90d", "payables_open",
             "receivables_late_days_p50"]
CASH_TYPES = ("checking", "saving", "wallet")
COLLECTION_CATEGORIES = ("collection", "bulk_collection", "pos_settlement")
WC_DOC_TYPES = ("invoice", "invoicegroup")


def number(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def decimal_text(value):
    if not isinstance(value, Decimal):
        return value
    return format(value, "f")


def day(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def month_of(value):
    return value[:7] if value and len(value) >= 7 else None


def month_range(start, end):
    y, m = int(start[:4]), int(start[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def q(value, places="0.01"):
    return value.quantize(Decimal(places)) if isinstance(value, Decimal) else value


def rows(path, required, quality):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path.name}: missing required columns: {sorted(missing)}")
        for row in reader:
            quality["rows_read"][path.stem] += 1
            yield row


def blank_metrics(company_id, group_id, company_currency, metric_currency):
    result = {field: 0 for field in COUNT_FIELDS}
    result.update({field: Decimal(0) for field in MONEY_FIELDS})
    result.update({"company_id": company_id, "group_id": group_id, "company_currency": company_currency,
                   "metric_currency": metric_currency, "debt_sign_warning": "no debt source observed"})
    return result


def run_pipeline(data_dir: Path, output_dir: Path, extraction_date: str = "2026-09-01"):
    output_dir.mkdir(parents=True, exist_ok=True)
    as_of = date.fromisoformat(extraction_date)
    generated = datetime.now(timezone.utc).isoformat()
    quality = {"generated_at_utc": generated, "dataset_as_of_date": extraction_date,
               "rows_read": Counter(), "invalid_numeric": Counter(), "invalid_dates": Counter(),
               "unknown_company_rows": Counter(), "stale_refinancing_schedules": [], "notes": [
                   "Every monetary aggregate is scoped by company and source currency; no FX conversion or cross-currency ranking is performed.",
                   "Transaction currency is joined from banking_products, then debt_products (lines of credit, confirming, etc. also carry transactions).",
                   "Invoice direction comes from the amount sign (amount > 0 issued/receivable, < 0 received/payable, per AGENTS.md); overdue exposure is absolute, with positive/negative pending_amount sums reported separately.",
                   "Overdue invoices exclude status paid/cancel even when a residual pending_amount remains. In status=overdue rows payment_date is not a payment date and is ignored.",
                   "Debt signs and source reconciliation are not reliable; absolute debt is a screening proxy.",
                   "Refinancing uses debt_products.outstanding as the current balance (schedule outstanding_balance is a fallback); repaid products are excluded, stale schedules are flagged not dropped.",
                   "For variable-rate products annual_interest_rate_or_spread is a spread over an unknown reference index, so the annual cost proxy is a lower bound.",
                   "Duplicate candidates preserve the exact Decimal value represented by the source amount."
               ]}

    companies, company_group = {}, {}
    for row in rows(data_dir / "companies.csv", REQUIRED["companies"], quality):
        companies[row["company_id"]] = row.get("currency", "")
        company_group[row["company_id"]] = row.get("group_id", "")
    for _ in rows(data_dir / "groups.csv", REQUIRED["groups"], quality):
        pass
    product_currency, product_type = {}, {}
    for row in rows(data_dir / "banking_products.csv", REQUIRED["banking_products"], quality):
        product_currency[row["product_id"]] = row.get("currency") or "UNKNOWN"
        product_type[row["product_id"]] = row.get("type", "").lower()
    metrics = {}

    def metric(cid, currency):
        currency = currency or "UNKNOWN"
        key = (cid, currency)
        if key not in metrics:
            metrics[key] = blank_metrics(cid, company_group.get(cid, ""), companies[cid], currency)
        return metrics[key]

    debt_signs = defaultdict(set)
    debt_currency, debt_outstanding = {}, {}
    for row in rows(data_dir / "debt_products.csv", REQUIRED["debt_products"], quality):
        cid = row["company_id"]
        if cid not in companies:
            quality["unknown_company_rows"]["debt_products"] += 1
            continue
        currency = row.get("currency") or "UNKNOWN"
        debt_currency[row["product_id"]] = currency
        product_currency.setdefault(row["product_id"], currency)
        m = metric(cid, currency)
        value = number(row.get("outstanding"))
        m["debt_product_count"] += 1
        if value is not None:
            debt_outstanding[row["product_id"]] = abs(value)
            m["debt_outstanding_abs_proxy"] += abs(value)
            if value:
                debt_signs[(cid, currency)].add("positive" if value > 0 else "negative")
        if row.get("type", "").lower() == "lineofcredit":
            # Source signs are inconsistent (granted negative, outstanding either sign); undrawn is an abs-based proxy.
            granted = number(row.get("granted"))
            drawn = abs(value) if value is not None else Decimal(0)
            m["loc_drawn"] += drawn
            if granted is not None:
                m["loc_granted"] += abs(granted)
                m["loc_undrawn"] += max(abs(granted) - drawn, Decimal(0))

    # Cash as of extraction: ledger balance of cash-like banking products (overdrafts are negative and offset idle cash).
    for row in rows(data_dir / "balances.csv", REQUIRED["balances"], quality):
        cid, pid = row["company_id"], row["product_id"]
        if cid not in companies:
            quality["unknown_company_rows"]["balances"] += 1
            continue
        balance = number(row.get("balance"))
        if balance is None:
            quality["invalid_numeric"]["balances.balance"] += 1
        elif product_type.get(pid) in CASH_TYPES:
            metric(cid, product_currency.get(pid))["cash_balance"] += balance

    monthly = defaultdict(lambda: defaultdict(lambda: defaultdict(Decimal)))  # [(cid, currency)][month][field]
    late_days = defaultdict(list)  # [(cid, currency, month)] -> days paid after due (receivables)
    first_month = {}
    duplicate_hashes = set()
    for row in rows(data_dir / "transactions.csv", REQUIRED["transactions"], quality):
        cid = row["company_id"]
        if cid not in companies:
            quality["unknown_company_rows"]["transactions"] += 1
            continue
        amount = number(row.get("amount"))
        if amount is None:
            quality["invalid_numeric"]["transactions.amount"] += 1
            continue
        if row.get("status", "").lower() != "booked":
            continue
        currency = product_currency.get(row.get("product_id", ""), "UNKNOWN")
        m = metric(cid, currency)
        m["booked_transaction_count"] += 1
        bucket = monthly[(cid, currency)][month_of(row.get("date", "")) or "0000-00"]
        if amount >= 0:
            m["booked_inflow"] += amount
            bucket["inflow"] += amount
        else:
            m["booked_outflow"] += -amount
            bucket["outflow"] += -amount
        m["booked_net_cash_proxy"] += amount
        if product_type.get(row.get("product_id", "")) in CASH_TYPES:
            bucket["cash_net"] += amount  # only cash-account flows move the reconstructed cash balance
        first_month[(cid, currency)] = min(first_month.get((cid, currency), "9999-99"), row.get("date", "")[:7] or "9999-99")
        category = row.get("category", "").lower()
        if category == "interest_charge":
            m["interest_charge_outflow" if amount < 0 else "interest_charge_inflow_or_reversal"] += abs(amount)
        if category in ("collection_refund", "payment_refund"):
            m[f"{category}_{'outflow' if amount < 0 else 'inflow'}"] += abs(amount)
        if category == "fee" and amount < 0:
            m["fee_outflow"] += -amount
            m["fee_transaction_count"] += 1
        if category == "debt_repayment" and amount < 0:
            m["debt_repayment_outflow"] += -amount
        if category in ("interest_charge", "debt_repayment") and amount < 0:
            bucket["debt_service_outflow"] += -amount
        if category in COLLECTION_CATEGORIES and amount > 0:
            bucket["collection_inflow"] += amount
        accounting = row.get("accounting_status", "").upper()
        if "PENDING" in accounting:
            m["reconciliation_pending_count"] += 1
            m["reconciliation_pending_abs_amount"] += abs(amount)
        if "DISCARDED" in accounting:
            m["reconciliation_discarded_count"] += 1
            m["reconciliation_discarded_abs_amount"] += abs(amount)
        # Decimal canonical form preserves distinctions beyond six places without float rounding.
        amount_key = str(amount.normalize()) if amount else "0"
        key = "\x1f".join((cid, row.get("product_id", ""), row.get("date", "")[:10],
                            amount_key, row.get("counterparty_id", ""), category))
        digest = hashlib.blake2b(key.encode(), digest_size=16).digest()
        if digest in duplicate_hashes:
            m["duplicate_candidate_count"] += 1
            m["duplicate_candidate_abs_amount"] += abs(amount)
        else:
            duplicate_hashes.add(digest)

    for row in rows(data_dir / "invoices.csv", REQUIRED["invoices"], quality):
        cid = row["company_id"]
        if cid not in companies:
            quality["unknown_company_rows"]["invoices"] += 1
            continue
        m = metric(cid, row.get("currency") or "UNKNOWN")
        issuance, due, payment = day(row.get("issuance_date")), day(row.get("due_date")), day(row.get("payment_date"))
        if row.get("due_date") and due is None:
            quality["invalid_dates"]["invoices.due_date"] += 1
        pending = number(row.get("pending_amount"))
        if pending is None:
            quality["invalid_numeric"]["invoices.pending_amount"] += 1
            pending = Decimal(0)
        if due and due < as_of and pending and row.get("status", "").lower() not in ("paid", "cancel"):
            m["overdue_invoice_count"] += 1
            m["overdue_invoice_abs_exposure"] += abs(pending)
            m["overdue_pending_positive" if pending > 0 else "overdue_pending_negative"] += abs(pending)
        if (issuance and due and due < issuance) or (issuance and payment and payment < issuance):
            m["invoice_lifecycle_anomaly_count"] += 1
        # Working-capital series: sign of amount is the only direction signal (positive = receivable, negative = payable).
        amount = number(row.get("amount"))
        status = row.get("status", "").lower()
        if row.get("document_type", "").lower() not in WC_DOC_TYPES or status == "cancel" or not amount or not issuance:
            continue
        side = "receivables" if amount > 0 else "payables"
        events = monthly[(cid, row.get("currency") or "UNKNOWN")]
        # In status=overdue rows payment_date is not a payment (it equals due_date in 96% of them): the invoice is still open.
        if status == "overdue":
            payment = None
        close = payment if payment and payment >= issuance else (issuance if payment else None)
        open_m, close_m = issuance.strftime("%Y-%m"), close.strftime("%Y-%m") if close else None
        events[open_m][f"{side}_open_delta"] += abs(amount)
        if close_m:
            events[close_m][f"{side}_open_delta"] -= abs(amount)
        if side == "receivables" and due:
            for label, start in (("overdue", due), ("overdue_90d", due + timedelta(days=90))):
                if close is None or close > start:
                    events[start.strftime("%Y-%m")][f"receivables_{label}_delta"] += abs(amount)
                    if close_m:
                        events[close_m][f"receivables_{label}_delta"] -= abs(amount)
            if close:
                late_days[(cid, row.get("currency") or "UNKNOWN", close_m)].append((close - due).days)

    refinance_groups = defaultdict(list)
    for row in rows(data_dir / "debt_schedule_config.csv", REQUIRED["debt_schedule_config"], quality):
        cid = row["company_id"]
        if cid not in companies:
            quality["unknown_company_rows"]["debt_schedule_config"] += 1
            continue
        # Prefer the joined debt-product currency; the schedule value is only a fallback.
        pid = row["product_id"]
        currency = debt_currency.get(pid) or row.get("currency") or "UNKNOWN"
        # debt_products.outstanding is the balance as of extraction; the schedule snapshot is only a fallback.
        outstanding = debt_outstanding.get(pid)
        source = "debt_products"
        if outstanding is None:
            outstanding, source = number(row.get("outstanding_balance")), "debt_schedule_config"
        rate = number(row.get("annual_interest_rate_or_spread"))
        next_payment = day(row.get("next_payment_date"))
        if row.get("next_payment_date") and next_payment is None:
            quality["invalid_dates"]["debt_schedule_config.next_payment_date"] += 1
        stale = bool(next_payment and next_payment < as_of)
        if stale:
            quality["stale_refinancing_schedules"].append({"company_id": cid, "product_id": pid,
                "currency": currency, "next_payment_date": row.get("next_payment_date"),
                "reason": "next_payment_date precedes dataset as-of date; schedule snapshot is stale, flagged in evidence"})
        if outstanding is not None and outstanding > 0 and rate is not None and 0 < rate < 1:
            annual = outstanding * rate
            evidence = {"product_id": pid, "outstanding": decimal_text(outstanding), "outstanding_source": source,
                        "rate": decimal_text(rate), "interest_type": row.get("interest_type", ""),
                        "annual_interest_cost_proxy": decimal_text(annual),
                        "next_payment_date": row.get("next_payment_date", ""), "stale_schedule": stale}
            refinance_groups[(cid, currency)].append((outstanding, annual, evidence))

    for key, m in metrics.items():
        signs = debt_signs[key]
        if signs:
            m["debt_sign_warning"] = (f"Source signs observed: {','.join(sorted(signs))}; absolute proxy used. "
                                      "Outstanding is not reconciled to schedules or accounting records; source confidence is low.")
    for (cid, currency), products in refinance_groups.items():
        m = metric(cid, currency)
        m["refinancing_candidate_count"] = len(products)
        m["refinancing_outstanding"] = sum((x[0] for x in products), Decimal(0))
        m["annual_interest_cost_proxy"] = sum((x[1] for x in products), Decimal(0))

    # Direct saving: idle cash that could amortise debt, priced at the company's own implied rate (no peer sample).
    end_month = extraction_date[:7]
    tx_months = [v for v in first_month.values() if v != "9999-99"]
    start_month = min(tx_months) if tx_months else end_month
    months = month_range(start_month, end_month)
    groups = defaultdict(lambda: {"company_count": 0, "group_cash_positive": Decimal(0), "group_debt": Decimal(0),
                                  "company_level_offset": Decimal(0), "annual_interest": Decimal(0)})
    for (cid, currency), m in metrics.items():
        first = first_month.get((cid, currency))
        m["history_months"] = len(month_range(first, end_month)) if first and first <= end_month else 0
        cash, debt = max(m["cash_balance"], Decimal(0)), m["debt_outstanding_abs_proxy"]
        m["idle_cash_vs_debt"] = min(cash, debt)
        annual_interest = m["interest_charge_outflow"] * 12 / m["history_months"] if m["history_months"] else Decimal(0)
        m["implied_debt_rate_raw"] = q(annual_interest / debt, "0.000001") if debt else Decimal(0)
        m["implied_debt_rate"] = min(m["implied_debt_rate_raw"], IMPLIED_RATE_CAP)
        m["idle_cash_savings_proxy"] = q(m["idle_cash_vs_debt"] * m["implied_debt_rate"])
        g = groups[(company_group.get(cid, ""), currency)]
        g["company_count"] += 1
        g["group_cash_positive"] += cash
        g["group_debt"] += debt
        g["company_level_offset"] += m["idle_cash_vs_debt"]
        g["annual_interest"] += annual_interest
    group_rows = []
    for (gid, currency), g in groups.items():
        incremental = max(min(g["group_cash_positive"], g["group_debt"]) - g["company_level_offset"], Decimal(0))
        rate = min(q(g["annual_interest"] / g["group_debt"], "0.000001"), IMPLIED_RATE_CAP) if g["group_debt"] else Decimal(0)
        group_rows.append({"group_id": gid, "currency": currency, "company_count": g["company_count"],
                           "group_cash_positive": q(g["group_cash_positive"]), "group_debt": q(g["group_debt"]),
                           "company_level_offset": q(g["company_level_offset"]), "group_netting_incremental": q(incremental),
                           "pooled_implied_rate": rate, "group_netting_savings_proxy": q(incremental * rate)})
    group_rows.sort(key=lambda r: (r["currency"], -r["group_netting_savings_proxy"], r["group_id"]))
    with (output_dir / "group_metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=GROUP_FIELDS)
        writer.writeheader()
        for r in group_rows:
            writer.writerow({k: decimal_text(v) for k, v in r.items()})

    wc_rows = working_capital_series(metrics, monthly, late_days, months)
    with (output_dir / "working_capital_monthly.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=WC_FIELDS)
        writer.writeheader()
        for r in wc_rows:
            writer.writerow({k: decimal_text(v) for k, v in r.items()})

    if not metrics:
        for cid, currency in companies.items():
            metric(cid, currency or "UNKNOWN")
    with (output_dir / "company_metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=METRIC_FIELDS)
        writer.writeheader()
        for key in sorted(metrics):
            writer.writerow({k: decimal_text(v) for k, v in metrics[key].items()})

    opportunities = []
    definitions = [
        ("overdue_invoice_review", "overdue_invoice_abs_exposure", "Direction-neutral overdue exposure; establish receivable/payable direction before action."),
        ("duplicate_transaction_review", "duplicate_candidate_abs_amount", "Exact Decimal-key duplicate proxy; inspect records before reversal or recovery."),
        ("reconciliation_backlog", "reconciliation_pending_abs_amount", "Pending reconciliation workload proxy; amount does not imply loss."),
        ("discarded_reconciliation_review", "reconciliation_discarded_abs_amount", "Discarded reconciliation proxy; investigate process quality."),
        ("refund_leakage_review", "collection_refund_outflow", "Booked collection-refund outflows; validate legitimacy and recoverability."),
        ("interest_cost_review", "interest_charge_outflow", "Booked interest-charge outflows; cash-cost proxy, not accounting interest expense."),
        ("idle_cash_review", "idle_cash_savings_proxy", "min(positive cash, debt) × company's own implied annual rate (interest_charge outflows / debt). Amortising or offsetting debt with idle cash; verify prepayment fees and minimum operating cash first."),
        ("bank_fee_review", "fee_outflow", "Booked bank fee outflows over the observed history; negotiation lever, no benchmark applied here."),
    ]
    for (cid, currency), m in metrics.items():
        for kind, field, caveat in definitions:
            if m[field] > 0:
                opportunities.append({"company_id": cid, "currency": currency, "opportunity_type": kind,
                    "screening_value": m[field], "evidence_metric": field, "caveat": caveat})
    for (cid, currency), products in refinance_groups.items():
        total_outstanding = sum((x[0] for x in products), Decimal(0))
        total_annual = sum((x[1] for x in products), Decimal(0))
        opportunities.append({"company_id": cid, "currency": currency, "opportunity_type": "refinancing_screen",
            "screening_value": total_annual, "annual_interest_cost_proxy": total_annual,
            "refinancing_outstanding": total_outstanding, "product_count": len(products),
            "product_evidence": [x[2] for x in products], "evidence_metric": "sum(product outstanding × annual rate)",
            "caveat": "Company/currency screening candidate only; variable-rate products carry a spread, not a full rate, so the proxy is a lower bound. Feasibility, fees, maturity, covenants, credit eligibility, and source reconciliation require review."})

    # Rank within (currency, screen type): a reconciliation workload proxy is not comparable to an interest cost proxy.
    by_scope = defaultdict(list)
    for item in opportunities:
        by_scope[(item["currency"], item["opportunity_type"])].append(item)
    for (currency, _), items in by_scope.items():
        items.sort(key=lambda x: (-x["screening_value"], x["company_id"]))
        for rank, item in enumerate(items, 1):
            item["rank_scope"] = "currency_and_type" if currency != "UNKNOWN" else "non_comparable_unknown_currency"
            item["currency_rank"] = rank if currency != "UNKNOWN" else None
    opportunities.sort(key=lambda x: (x["currency"], x["opportunity_type"], x["currency_rank"] or 0, x["company_id"]))
    serializable = [{k: decimal_text(v) for k, v in item.items()} for item in opportunities]
    (output_dir / "opportunities.json").write_text(json.dumps(serializable, indent=2), encoding="utf-8")
    opportunity_fields = sorted({key for item in serializable for key in item})
    with (output_dir / "opportunities.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=opportunity_fields, extrasaction="ignore")
        writer.writeheader()
        for item in serializable:
            row = dict(item)
            if isinstance(row.get("product_evidence"), list):
                row["product_evidence"] = json.dumps(row["product_evidence"], separators=(",", ":"))
            writer.writerow(row)

    for key in ("rows_read", "invalid_numeric", "invalid_dates", "unknown_company_rows"):
        quality[key] = dict(quality[key])
    quality["company_count"] = len(companies)
    quality["company_currency_metric_count"] = len(metrics)
    quality["opportunity_count"] = len(opportunities)
    quality["stale_refinancing_schedule_count"] = len(quality["stale_refinancing_schedules"])
    quality["group_currency_rows"] = len(group_rows)
    quality["working_capital_months"] = {"start": start_month, "end": end_month, "rows": len(wc_rows)}
    (output_dir / "data_quality.json").write_text(json.dumps(quality, indent=2), encoding="utf-8")
    write_report(output_dir / "report.md", serializable, quality, extraction_date, generated)
    return metrics, opportunities


def working_capital_series(metrics, monthly, late_days, months):
    """Per company/currency/month: flows, reconstructed cash, open/overdue receivables and payables. Facts only; no scoring."""
    rows_out = []
    for key in sorted(metrics):
        m, buckets = metrics[key], monthly.get(key, {})
        if not buckets:
            continue
        # Events before the first observed month are folded into it; events after the as-of month are ignored.
        folded = defaultdict(lambda: defaultdict(Decimal))
        for month, fields in buckets.items():
            target = max(month, months[0])
            if target <= months[-1]:
                for field, value in fields.items():
                    folded[target][field] += value
        # Only one balance snapshot exists (as-of), so cash is walked backwards from it using cash-account net flows.
        cash_end, cash = {}, m["cash_balance"]
        for month in reversed(months):
            cash_end[month] = cash
            cash -= folded[month]["cash_net"]
        cum = defaultdict(Decimal)
        for month in months:
            f = folded[month]
            for field in ("receivables_open", "receivables_overdue", "receivables_overdue_90d", "payables_open"):
                cum[field] = max(cum[field] + f[f"{field}_delta"], Decimal(0))
            days = late_days.get((key[0], key[1], month))
            rows_out.append({"company_id": key[0], "currency": key[1], "month": month, "inflow": q(f["inflow"]),
                             "outflow": q(f["outflow"]), "net": q(f["inflow"] - f["outflow"]),
                             "collection_inflow": q(f["collection_inflow"]), "debt_service_outflow": q(f["debt_service_outflow"]),
                             "cash_end_proxy": q(cash_end[month]), "receivables_open": q(cum["receivables_open"]),
                             "receivables_overdue": q(cum["receivables_overdue"]), "receivables_overdue_90d": q(cum["receivables_overdue_90d"]),
                             "payables_open": q(cum["payables_open"]),
                             "receivables_late_days_p50": Decimal(str(median(days))) if days else None})
    return rows_out


def write_report(path, opportunities, quality, as_of, generated):
    lines = ["# Company Optimization Screening Report", "", f"Generated (UTC): `{generated}`  ",
             f"Dataset as-of date: `{as_of}`", "", "## Important scope", "",
             "This is a **screening analysis, not an accounting profitability analysis**. All monetary metrics are company-and-currency scoped and each screen type is ranked separately within its currency (rank 1 in `reconciliation_backlog` says nothing about `interest_cost_review`). No nominal values are compared or added across currencies. Unknown-currency records are non-comparable and unranked. Invoice direction is not documented; debt values use unreconciled source data and low-confidence sign assumptions.", ""]
    known = sorted({x["currency"] for x in opportunities if x["currency"] != "UNKNOWN"})
    for currency in known:
        lines += [f"## {currency} company-level opportunities (top 5 per screen)", "", "| Screen | Rank | Company | Value proxy | Evidence / caveat |", "|---|---:|---|---:|---|"]
        for item in [x for x in opportunities if x["currency"] == currency and x["currency_rank"] <= 5]:
            caveat = item["caveat"].replace("|", "/")
            lines.append(f"| {item['opportunity_type']} | {item['currency_rank']} | {item['company_id']} | {item['screening_value']} | `{item['evidence_metric']}` — {caveat} |")
        lines.append("")
    unknown = [x for x in opportunities if x["currency"] == "UNKNOWN"]
    if unknown:
        lines += ["## Unknown-currency records (non-comparable, not ranked)", "", "These records require currency resolution before comparison or prioritization.", "", "| Company | Screen | Value proxy |", "|---|---|---:|"]
        for item in unknown[:25]:
            lines.append(f"| {item['company_id']} | {item['opportunity_type']} | {item['screening_value']} |")
        lines.append("")
    lines += ["## Formulas and controls", "",
              "- Transaction, invoice, debt, and refinancing sums are partitioned by source currency.",
              "- Duplicate keys use the exact parsed Decimal amount, not float rounding or six-decimal formatting.",
              "- Overdue exposure is absolute pending amount where due date precedes as-of and status is not paid/cancel; positive and negative pending sums are reported separately because direction is not documented.",
              "- Debt outstanding is an absolute, unreconciled source proxy. Its sign convention and source confidence are explicitly reported.",
              "- Refinance is aggregated once per company/currency with product evidence retained. Current balance comes from debt_products.outstanding (schedule balance as fallback); repaid products are excluded; stale schedules are flagged, not dropped; variable-rate proxies use the spread only and are lower bounds.",
              f"- Idle cash saving = min(positive cash-like balances, debt outstanding) × implied rate, where implied rate = annualised interest_charge outflows / debt outstanding for that company/currency, capped at {IMPLIED_RATE_CAP} (raw value kept in `implied_debt_rate_raw`). No peer benchmark is used.",
              "- Group netting (`group_metrics.csv`) = min(group cash, group debt) minus what each company can already offset alone, priced at the group's pooled implied rate.",
              "- Working capital (`working_capital_monthly.csv`): facts only, no scoring. Cash is walked backwards from the single as-of balance snapshot using cash-account flows; receivable/payable direction is inferred from the invoice amount sign.", "",
              "## Data-quality checks", "",
              f"- Companies: {quality['company_count']:,}; company/currency metric rows: {quality['company_currency_metric_count']:,}; currency-scoped screens: {quality['opportunity_count']:,}; group/currency rows: {quality['group_currency_rows']:,}; working-capital rows: {quality['working_capital_months']['rows']:,} ({quality['working_capital_months']['start']} to {quality['working_capital_months']['end']}).",
              f"- Stale refinancing schedules flagged: {quality['stale_refinancing_schedule_count']:,}.",
              f"- Rows read: `{json.dumps(quality['rows_read'], sort_keys=True)}`.",
              f"- Invalid numeric fields: `{json.dumps(quality['invalid_numeric'], sort_keys=True)}`.",
              f"- Invalid dates: `{json.dumps(quality['invalid_dates'], sort_keys=True)}`.",
              f"- Unknown-company rows: `{json.dumps(quality['unknown_company_rows'], sort_keys=True)}`.", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path(os.environ.get("XRAY_DATA_DIR", "../dataset")))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--as-of", default="2026-09-01")
    args = parser.parse_args()
    run_pipeline(args.data_dir, args.output_dir, args.as_of)


if __name__ == "__main__":
    main()
