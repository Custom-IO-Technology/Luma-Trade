import polars as pl
from .base_rule import AbstractRule

class RuleStochRSI(AbstractRule):
    """
    Rule 5: Stoch RSI Momentum (+10 points)
    - LONG: Stoch RSI K > D (Fast crosses above Slow)
    - SHORT: Stoch RSI K < D (Fast crosses below Slow)
    """
    
    def name(self) -> str:
        return "Stoch RSI Momentum"
        
    def max_points(self) -> int:
        return 10
        
    def is_hard_rule(self) -> bool:
        return False
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 1:
            return False
            
        curr = df.row(-1, named=True)
        
        if "stoch_rsi_k" not in curr or "stoch_rsi_d" not in curr:
            return False
            
        if curr["stoch_rsi_k"] is None or curr["stoch_rsi_d"] is None:
            return False
            
        if direction == "LONG":
            return curr["stoch_rsi_k"] > curr["stoch_rsi_d"]
        elif direction == "SHORT":
            return curr["stoch_rsi_k"] < curr["stoch_rsi_d"]
            
        return False
