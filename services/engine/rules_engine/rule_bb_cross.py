import polars as pl
from .base_rule import AbstractRule

class RuleBBCross(AbstractRule):
    """
    Rule 1: Bollinger Bands Cross (+20 points) [HARD RULE]
    - LONG: Current close > lower band AND previous close <= previous lower band
    - SHORT: Current close < upper band AND previous close >= previous upper band
    """
    
    def name(self) -> str:
        return "Bollinger Bands Cross"
        
    def max_points(self) -> int:
        return 20
        
    def is_hard_rule(self) -> bool:
        return True
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 2:
            return False
            
        # Get the last two rows
        curr = df.row(-1, named=True)
        prev = df.row(-2, named=True)
        
        # Ensure BB columns exist
        if "bb_lower" not in curr or "bb_upper" not in curr:
            return False
            
        if direction == "LONG":
            return (curr["close"] > curr["bb_lower"]) and (prev["close"] <= prev["bb_lower"])
        elif direction == "SHORT":
            return (curr["close"] < curr["bb_upper"]) and (prev["close"] >= prev["bb_upper"])
            
        return False
