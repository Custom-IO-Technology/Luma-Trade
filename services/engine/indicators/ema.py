import polars as pl
from .base_indicator import AbstractIndicator

class EMAIndicator(AbstractIndicator):
    """
    Computes EMA 55 and EMA 200.
    """
    def name(self) -> str:
        return "ema"
        
    def compute(self, df: pl.DataFrame) -> pl.DataFrame:
        # Polars has a built-in Exponential Moving Average
        return df.with_columns([
            pl.col("close").ewm_mean(span=55, min_periods=55, ignore_nulls=True).alias("ema_55"),
            pl.col("close").ewm_mean(span=200, min_periods=200, ignore_nulls=True).alias("ema_200")
        ])
