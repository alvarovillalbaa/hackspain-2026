"""Make `import pipeline` work when pytest is run from the repo root (`pytest company_optimization_pipeline`)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
