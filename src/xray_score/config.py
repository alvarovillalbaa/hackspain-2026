from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FeatureDefinition:
    name: str
    label: str
    pillar: str
    weight: float
    higher_is_better: bool


FEATURES: tuple[FeatureDefinition, ...] = (
    FeatureDefinition(
        "cash_buffer_months",
        "cash buffer",
        "liquidity",
        0.25,
        True,
    ),
    FeatureDefinition(
        "operating_coverage_3m",
        "operating cash coverage",
        "cash_adequacy",
        0.18,
        True,
    ),
    FeatureDefinition(
        "cash_margin_3m",
        "operating cash margin",
        "cash_adequacy",
        0.12,
        True,
    ),
    FeatureDefinition(
        "fixed_obligation_coverage_3m",
        "fixed-obligation coverage",
        "obligations",
        0.10,
        True,
    ),
    FeatureDefinition(
        "debt_service_burden_3m",
        "debt-service burden",
        "obligations",
        0.08,
        False,
    ),
    FeatureDefinition(
        "interest_fee_burden_3m",
        "interest and fee burden",
        "obligations",
        0.05,
        False,
    ),
    FeatureDefinition(
        "downside_volatility_6m",
        "downside cash-flow volatility",
        "resilience",
        0.08,
        False,
    ),
    FeatureDefinition(
        "inflow_concentration_3m",
        "customer concentration",
        "resilience",
        0.06,
        False,
    ),
    FeatureDefinition(
        "refund_rate_3m",
        "collection-refund rate",
        "resilience",
        0.03,
        False,
    ),
    FeatureDefinition(
        "invoice_overdue_backlog_months",
        "overdue invoice backlog",
        "invoice_discipline",
        0.05,
        False,
    ),
)

PILLAR_LABELS = {
    "liquidity": "Liquidity cushion",
    "cash_adequacy": "Operating cash adequacy",
    "obligations": "Obligation pressure",
    "resilience": "Predictability and resilience",
    "invoice_discipline": "Invoice discipline",
}

OPERATING_INFLOW_EXCLUSIONS = {
    "transfer",
    "investment_return",
    "payment_refund",
    "tax_refund",
}

OPERATING_OUTFLOW_EXCLUSIONS = {
    "transfer",
    "investment_deployment",
    "debt_repayment",
    "collection_refund",
}

MANDATORY_OUTFLOW_CATEGORIES = {
    "salary",
    "tax",
    "social_security",
    "debt_repayment",
    "utility",
    "interest_charge",
    "fee",
}

LIQUID_BANKING_PRODUCT_TYPES = {
    "checking",
    "saving",
    "tpv",
    "expensesPlatform",
}

EWMA_ALPHA = 0.35
MOMENTUM_MULTIPLIER = 0.40
MAX_MOMENTUM_ADJUSTMENT = 10.0
NEUTRAL_PERCENTILE = 50.0
QUANTILE_COUNT = 101
SUDDEN_CHANGE_THRESHOLD = 15.0
PERSISTENT_MOMENTUM_THRESHOLD = 9.0
PERSISTENT_PRIOR_MOMENTUM_THRESHOLD = 7.0
