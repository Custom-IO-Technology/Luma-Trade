import polars as pl
from .base_rule import AbstractRule

class RuleVolume(AbstractRule):
    """
    Rule 3: Volume Surge (+15 points)
    - Current volume > 1.5x of the 20-period moving average volume
    """
    
    def name(self) -> str:
        return "Volume Surge"
        
    def max_points(self) -> int:
        return 15
        
    def is_hard_rule(self) -> bool:
        return False
        
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        if len(df) < 20:
            return False
            
        # Add temporary column for volume SMA
        df_temp = df.with_columns([
            pl.col("volume").rolling_mean(window_size=20).alias("vol_sma")
        ])
        
        curr = df_temp.row(-1, named=True)
        
        if curr["vol_sma"] is None or curr["vol_sma"] == 0:
            return False
            
        return curr["volume"] > (curr["vol_sma"] * 1.5)
