import polars as pl
from typing import List
from .base_rule import AbstractRule

class HardRulesGate:
    """
    Enforces non-negotiable checks before aggregating the final score.
    If any hard rule fails, the trade is rejected immediately.
    """
    
    def __init__(self, rules: List[AbstractRule]):
        # Filter for only hard rules
        self.hard_rules = [r for r in rules if r.is_hard_rule()]
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        """
        Returns True if ALL hard rules pass, False otherwise.
        """
        for rule in self.hard_rules:
            if not rule.evaluate(df, direction):
                return False
        return True
