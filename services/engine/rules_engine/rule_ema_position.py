import polars as pl
from .base_rule import AbstractRule

class RuleEMAPosition(AbstractRule):
    """
    Rule 6: EMA Position (+15 points) [HARD RULE]
    - LONG: Price > EMA 55 > EMA 200 (Uptrend)
    - SHORT: Price < EMA 55 < EMA 200 (Downtrend)
    """
    
    def name(self) -> str:
        return "EMA Position"
        
    def max_points(self) -> int:
        return 15
        
    def is_hard_rule(self) -> bool:
        return True
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 1:
            return False
            
        curr = df.row(-1, named=True)
        
        # Ensure EMA columns exist
        if "ema_55" not in curr or "ema_200" not in curr:
            return False
            
        # Handle nulls (not enough data yet)
        if curr["ema_55"] is None or curr["ema_200"] is None:
            return False
            
        if direction == "LONG":
            return (curr["close"] > curr["ema_55"]) and (curr["ema_55"] > curr["ema_200"])
        elif direction == "SHORT":
            return (curr["close"] < curr["ema_55"]) and (curr["ema_55"] < curr["ema_200"])
            
        return False
