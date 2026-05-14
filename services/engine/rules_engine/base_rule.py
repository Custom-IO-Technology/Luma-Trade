from abc import ABC, abstractmethod
import polars as pl
from typing import Dict, Any

class AbstractRule(ABC):
    """
    Open/Closed Principle + Strategy Pattern:
    Base class for all trading rules. Each rule encapsulates its own evaluation logic
    and point allocation. New rules can be added seamlessly by inheriting from this.
    """
    
    @abstractmethod
    def name(self) -> str:
        """The name of the rule, e.g., 'BB Cross'"""
        pass
        
    @abstractmethod
    def max_points(self) -> int:
        """The maximum points this rule can contribute to the final score."""
        pass
        
    @abstractmethod
    def is_hard_rule(self) -> bool:
        """If True, failure of this rule results in an immediate REJECTED state."""
        pass
        
    @abstractmethod
    def evaluate(self, df: pl.DataFrame, direction: str) -> bool:
        """
        Evaluate the rule against the latest candle in the DataFrame.
        Returns True if the rule passes, False otherwise.
        direction is either 'LONG' or 'SHORT'
        """
        pass
        
    def get_points(self, df: pl.DataFrame, direction: str) -> int:
        """
        Return the points awarded by this rule. 
        Default implementation returns max_points() if evaluate() passes, else 0.
        Can be overridden for partial points.
        """
        if self.evaluate(df, direction):
            return self.max_points()
        return 0

    def get_details(self, df: pl.DataFrame, direction: str) -> Dict[str, Any]:
        """
        Return a standardized dictionary for the frontend to render the checklist.
        """
        passed = self.evaluate(df, direction)
        return {
            "name": self.name(),
            "passed": passed,
            "points": self.max_points() if passed else 0,
            "max_points": self.max_points(),
            "is_hard_rule": self.is_hard_rule()
        }
