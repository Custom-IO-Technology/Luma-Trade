import polars as pl
from .base_indicator import AbstractIndicator

class MACDIndicator(AbstractIndicator):
    """
    Computes MACD (12, 26, 9)
    """
    def name(self) -> str:
        return "macd"
        
    def compute(self, df: pl.DataFrame) -> pl.DataFrame:
        return df.with_columns([
            (
                pl.col("close").ewm_mean(span=12, ignore_nulls=True) - 
                pl.col("close").ewm_mean(span=26, ignore_nulls=True)
            ).alias("macd_line")
        ]).with_columns([
            pl.col("macd_line").ewm_mean(span=9, ignore_nulls=True).alias("macd_signal")
        ]).with_columns([
            (pl.col("macd_line") - pl.col("macd_signal")).alias("macd_histogram")
        ])
