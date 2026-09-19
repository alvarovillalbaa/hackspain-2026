"""Score drivers, concrete evidence, and observable counterfactual actions."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from .features import FeaturePanel
from .ledger import LedgerSnapshot
from .scorecard import Scorecard, ScoreResult


@dataclass(frozen=True)
class Action:
    feature: str
    action: str
    current_value: float
    target_value: float
    estimated_point_gain: float
    evidence: list[dict[str, object]]


def _evidence(feature: str, snapshot: LedgerSnapshot) -> list[dict[str, object]]:
    if feature in {"overdue_receivables_ratio", "customer_collection_delay_days"}:
        rows = snapshot.invoices.loc[
            snapshot.invoices["direction"].eq("receivable")
            & snapshot.invoices["open_as_of"]
            & snapshot.invoices["days_overdue_as_of"].gt(0)
        ].nlargest(3, "open_amount_as_of")
        return [
            {
                "invoice_id": row.operation_id,
                "counterparty_id": row.counterparty_id,
                "amount": round(float(row.open_amount_as_of), 2),
                "days_overdue": int(row.days_overdue_as_of),
            }
            for row in rows.itertuples(index=False)
        ]
    if feature in {"overdue_payables_ratio", "supplier_payment_delay_change_days"}:
        rows = snapshot.invoices.loc[
            snapshot.invoices["direction"].eq("payable")
            & snapshot.invoices["open_as_of"]
            & snapshot.invoices["days_overdue_as_of"].gt(0)
        ].nlargest(3, "open_amount_as_of")
        return [
            {
                "invoice_id": row.operation_id,
                "counterparty_id": row.counterparty_id,
                "amount": round(float(row.open_amount_as_of), 2),
                "days_overdue": int(row.days_overdue_as_of),
            }
            for row in rows.itertuples(index=False)
        ]
    if feature == "top3_collection_concentration":
        rows = snapshot.transactions.loc[
            snapshot.transactions["amount_accounting"].gt(0)
            & snapshot.transactions["counterparty_id"].notna()
        ]
        totals = rows.groupby("counterparty_id")["amount_accounting"].sum().nlargest(3)
        return [
            {"counterparty_id": key, "collections": round(float(value), 2)}
            for key, value in totals.items()
        ]
    rows = snapshot.transactions.loc[snapshot.transactions["amount_accounting"].lt(0)].copy()
    totals = (-rows.groupby("category")["amount_accounting"].sum()).nlargest(3)
    return [
        {"payment_category": key, "amount": round(float(value), 2)} for key, value in totals.items()
    ]


def recommended_actions(
    result: ScoreResult,
    panel: FeaturePanel,
    snapshot: LedgerSnapshot,
    scorecard: Scorecard,
    *,
    limit: int = 5,
) -> list[Action]:
    target_score = scorecard.next_band_target(result)
    if target_score is None:
        return []
    actions: list[Action] = []
    verbs = {
        "cash_runway_days": "Build cash runway",
        "worst_deficit_cash_coverage": "Raise the liquid downside buffer",
        "operating_cash_margin": "Improve operating cash margin",
        "positive_cashflow_month_fraction": "Sustain positive monthly cash flow",
        "recurring_obligation_coverage": "Cover recurring obligations with stable inflows",
        "overdue_receivables_ratio": "Collect overdue customer invoices",
        "customer_collection_delay_days": "Shorten customer collection delay",
        "overdue_payables_ratio": "Regularize overdue supplier invoices",
        "supplier_payment_delay_change_days": "Stop the increase in supplier payment delay",
        "debt_service_coverage": "Increase cash available for debt service",
        "interest_burden": "Reduce interest burden",
        "top3_collection_concentration": "Diversify customer collections",
        "downside_cashflow_volatility": "Reduce downside cash-flow volatility",
    }
    for component in scorecard.config.components:
        denominator = sum(rule.weight for rule in component.features)
        for rule in component.features:
            feature = panel.features.get(rule.feature)
            if feature is None or feature.value is None or feature.reliability <= 0:
                continue
            current_points = rule.points(feature.value)
            candidates = [(x, y) for x, y in rule.breakpoints if y > current_points + 1e-9]
            if not candidates:
                continue
            target_value, target_points = min(candidates, key=lambda item: item[1] - current_points)
            gain = (
                component.weight
                * rule.weight
                / denominator
                * feature.reliability
                * (target_points - current_points)
            )
            actions.append(
                Action(
                    feature=rule.feature,
                    action=verbs.get(rule.feature, f"Improve {rule.feature}"),
                    current_value=round(float(feature.value), 4),
                    target_value=round(float(target_value), 4),
                    estimated_point_gain=round(float(gain), 2),
                    evidence=_evidence(rule.feature, snapshot),
                )
            )
    actions.sort(
        key=lambda action: (
            -action.estimated_point_gain,
            abs(action.target_value - action.current_value),
        )
    )
    return actions[:limit]


def explain(
    result: ScoreResult,
    panel: FeaturePanel,
    snapshot: LedgerSnapshot,
    scorecard: Scorecard,
) -> dict[str, object]:
    return {
        "entity_id": result.entity_id,
        "as_of": result.as_of,
        "score": result.score,
        "band": result.band,
        "confidence": result.confidence,
        "drivers": {
            "positive": result.top_positive_drivers,
            "negative": result.top_negative_drivers,
        },
        "point_ledger": [asdict(entry) for entry in result.point_ledger],
        "shock_cap": result.shock_cap,
        "actions": [
            asdict(action) for action in recommended_actions(result, panel, snapshot, scorecard)
        ],
        "audit": snapshot.audit,
        "max_source_timestamp": result.max_source_timestamp,
    }
