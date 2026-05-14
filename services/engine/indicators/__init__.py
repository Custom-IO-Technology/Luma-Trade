import os
import importlib
import inspect
from typing import List, Type
from .base_indicator import AbstractIndicator

# Auto-discovery mechanism for indicators
_indicators: List[AbstractIndicator] = []

def get_all_indicators() -> List[AbstractIndicator]:
    """Returns instantiated instances of all discovered indicators."""
    return _indicators

# Automatically import all files in this directory and register indicators
for filename in os.listdir(os.path.dirname(__file__)):
    if filename.endswith(".py") and not filename.startswith("__") and filename != "base_indicator.py":
        module_name = filename[:-3]
        module = importlib.import_module(f".{module_name}", package=__name__)
        
        for name, obj in inspect.getmembers(module):
            if inspect.isclass(obj) and issubclass(obj, AbstractIndicator) and obj is not AbstractIndicator:
                _indicators.append(obj())
