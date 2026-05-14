import os
import importlib
import inspect
from typing import List
from .base_rule import AbstractRule
from .confidence_scorer import ConfidenceScorer

# Auto-discovery mechanism for rules
_rules: List[AbstractRule] = []

def get_all_rules() -> List[AbstractRule]:
    """Returns instantiated instances of all discovered rules."""
    return _rules

def get_scorer() -> ConfidenceScorer:
    """Returns a pre-configured scorer with all discovered rules."""
    return ConfidenceScorer(_rules)

# Automatically import all files in this directory and register rules
for filename in os.listdir(os.path.dirname(__file__)):
    if filename.startswith("rule_") and filename.endswith(".py"):
        module_name = filename[:-3]
        module = importlib.import_module(f".{module_name}", package=__name__)
        
        for name, obj in inspect.getmembers(module):
            if inspect.isclass(obj) and issubclass(obj, AbstractRule) and obj is not AbstractRule:
                _rules.append(obj())
