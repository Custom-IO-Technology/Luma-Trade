import polars as pl
from .base_rule import AbstractRule

class RuleATR(AbstractRule):
    """
    Rule 8: ATR Volatility (+5 points)
    - Current ATR > previous ATR (Volatility is expanding)
    """
    
    def name(self) -> str:
        return "ATR Volatility Expansion"
        
    def max_points(self) -> int:
        return 5
        
    def is_hard_rule(self) -> bool:
        return False
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 2:
            return False
            
        curr = df.row(-1, named=True)
        prev = df.row(-2, named=True)
        
        if "atr_14" not in curr or "atr_14" not in prev:
            return False
            
        if curr["atr_14"] is None or prev["atr_14"] is None:
            return False
            
        # Direction doesn't matter, we just want expanding volatility
        return curr["atr_14"] > prev["atr_14"]
