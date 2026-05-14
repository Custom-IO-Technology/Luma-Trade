import polars as pl
from .base_rule import AbstractRule

class RuleMACD(AbstractRule):
    """
    Rule 4: MACD Alignment (+10 points)
    - LONG: MACD Histogram is positive (MACD > Signal)
    - SHORT: MACD Histogram is negative (MACD < Signal)
    """
    
    def name(self) -> str:
        return "MACD Alignment"
        
    def max_points(self) -> int:
        return 10
        
    def is_hard_rule(self) -> bool:
        return False
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 1:
            return False
            
        curr = df.row(-1, named=True)
        
        if "macd_histogram" not in curr or curr["macd_histogram"] is None:
            return False
            
        if direction == "LONG":
            return curr["macd_histogram"] > 0
        elif direction == "SHORT":
            return curr["macd_histogram"] < 0
            
        return False
