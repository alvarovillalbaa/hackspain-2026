import pandas as pd

from xray.ledger import Ledger


def test_as_of_filters_future_transactions_and_payments(mini_cache):
    snapshot = Ledger(mini_cache).snapshot("C1", "2024-07-31")
    assert set(snapshot.transactions.transaction_id) == {"T1", "T2"}
    invoice = snapshot.invoices.set_index("operation_id").loc["I1"]
    assert not invoice.paid_as_of
    assert invoice.open_as_of
    assert snapshot.max_source_timestamp <= snapshot.as_of


def test_group_is_consolidated_not_averaged(mini_cache):
    snapshot = Ledger(mini_cache).snapshot("G1", "2024-07-31")
    assert snapshot.entity_type == "group"
    assert snapshot.liquid_balance == 1600.0


def test_future_transaction_change_does_not_change_earlier_snapshot(mini_cache):
    before = Ledger(mini_cache).snapshot("C1", "2024-07-31").liquid_balance
    tx = pd.read_parquet(mini_cache / "transactions.parquet")
    tx.loc[tx.transaction_id.eq("T3"), "amount_accounting"] = 999999.0
    tx.to_parquet(mini_cache / "transactions.parquet", index=False)
    after = Ledger(mini_cache).snapshot("C1", "2024-07-31").liquid_balance
    assert before == after


def test_single_anchor_backward_reconstruction_is_explicit(mini_cache):
    balances = pd.read_parquet(mini_cache / "balances.parquet")
    balances.loc[balances.product_id.eq("B1"), ["date", "balance"]] = [
        pd.Timestamp("2024-08-31"),
        2100.0,
    ]
    balances.to_parquet(mini_cache / "balances.parquet", index=False)
    strict = Ledger(mini_cache).snapshot("C1", "2024-07-31")
    reconstructed = Ledger(mini_cache, reconstruct_balances=True).snapshot("C1", "2024-07-31")
    assert strict.liquid_balance is None
    assert reconstructed.liquid_balance == 1200.0
    assert reconstructed.coverage.balance_reliability == 0.75
    assert reconstructed.audit["backward_reconstructed_products"] == 1
    assert reconstructed.audit["balance_lineage_max_timestamp"].startswith("2024-08-31")
