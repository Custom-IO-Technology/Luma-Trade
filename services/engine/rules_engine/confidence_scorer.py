import polars as pl
from typing import List, Dict, Any
from .base_rule import AbstractRule
from .hard_rules_gate import HardRulesGate
from core.config import settings

class ConfidenceScorer:
    """
    Dynamically loops through all rules, aggregates the score, and determines the execution tier.
    """
    
    def __init__(self, rules: List[AbstractRule]):
        self.rules = rules
        self.gate = HardRulesGate(rules)
        
    def score(self, df: pl.DataFrame, direction: str) -> Dict[str, Any]:
        """
        Evaluate all rules and return the payload for the UI/Alerting.
        """
        payload = {
            "direction": direction,
            "status": "EVALUATING",
            "score": 0,
            "decision": "NO TRADE",
            "rules_payload": []
        }
        
        # 1. Check Hard Rules First
        hard_rules_pass = self.gate.evaluate(df, direction)
        
        # We always evaluate all rules to build the checklist for the UI
        total_score = 0
        for rule in self.rules:
            details = rule.get_details(df, direction)
            total_score += details["points"]
            payload["rules_payload"].append(details)
            
        if not hard_rules_pass:
            payload["status"] = "REJECTED"
            payload["score"] = total_score # Show score anyway for UI
            return payload
            
        # 2. Determine Execution Tier
        payload["score"] = total_score
        payload["status"] = "PASS"
        
        if total_score >= settings.score_full_size_threshold:
            payload["decision"] = "ENTER FULL SIZE"
        elif total_score >= settings.score_scaled_size_threshold:
            payload["decision"] = "ENTER SCALED SIZE"
        else:
            payload["status"] = "REJECTED"
            payload["decision"] = "SCORE TOO LOW"
            
        return payload
