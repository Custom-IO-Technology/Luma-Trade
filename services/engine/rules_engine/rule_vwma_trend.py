import polars as pl
from .base_rule import AbstractRule

class RuleVWMATrend(AbstractRule):
    """
    Rule 7: VWMA Trend (+10 points)
    - LONG: Close > VWMA 20
    - SHORT: Close < VWMA 20
    """
    
    def name(self) -> str:
        return "VWMA Trend"
        
    def max_points(self) -> int:
        return 10
        
    def is_hard_rule(self) -> bool:
        return False
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 1:
            return False
            
        curr = df.row(-1, named=True)
        
        if "vwma_20" not in curr or curr["vwma_20"] is None:
            return False
            
        if direction == "LONG":
            return curr["close"] > curr["vwma_20"]
        elif direction == "SHORT":
            return curr["close"] < curr["vwma_20"]
            
        return False
