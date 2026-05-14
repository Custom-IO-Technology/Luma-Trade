from abc import ABC, abstractmethod
import polars as pl

class AbstractIndicator(ABC):
    """
    Open/Closed Principle (OCP):
    Base class for all technical indicators. New indicators can be added by
    creating a new file that inherits from this class, without modifying existing code.
    """
    
    @abstractmethod
    def name(self) -> str:
        """Return the unique name of the indicator (e.g., 'ema_55')"""
        pass
        
    @abstractmethod
    def compute(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Compute the indicator using Polars vectorized operations.
        The dataframe will contain 'open', 'high', 'low', 'close', 'volume'.
        Should return the dataframe with the new indicator columns appended.
        """
        pass
