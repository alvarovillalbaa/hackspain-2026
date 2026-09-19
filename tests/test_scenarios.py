import numpy as np
import pandas as pd

from xray.forecast import PRIMITIVES
from xray.scenarios import ResidualBlockSimulator


def test_block_simulation_preserves_shape_and_nonnegative_states():
    blocks = np.zeros((3, 4, len(PRIMITIVES)))
    blocks[1, :, 0] = [1, 2, 3, 4]
    central = pd.DataFrame({name: [10.0] * 4 for name in PRIMITIVES})
    simulated = ResidualBlockSimulator(blocks).simulate_ledgers(central, n_scenarios=100)
    assert simulated.shape == (100, 4, len(PRIMITIVES))
    assert (simulated >= 0).all()
