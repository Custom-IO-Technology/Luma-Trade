import polars as pl
from .base_rule import AbstractRule

class RuleCandleConfirm(AbstractRule):
    """
    Rule 2: Candle Confirmation (+15 points) [HARD RULE]
    - LONG: Current candle must be green (close > open)
    - SHORT: Current candle must be red (close < open)
    """
    
    def name(self) -> str:
        return "Candle Confirmation"
        
    def max_points(self) -> int:
        return 15
        
    def is_hard_rule(self) -> bool:
        return True
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 1:
            return False
            
        curr = df.row(-1, named=True)
        
        if direction == "LONG":
            return curr["close"] > curr["open"]
        elif direction == "SHORT":
            return curr["close"] < curr["open"]
            
        return False
