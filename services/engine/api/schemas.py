from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class RulePayload(BaseModel):
    name: str
    passed: bool
    points: int
    max_points: int
    is_hard_rule: bool

class ScoreResponse(BaseModel):
    symbol: str
    direction: str
    status: str
    score: int
    decision: str
    rules_payload: List[RulePayload]
    
class HistoryResponse(BaseModel):
    symbol: str
    # Lightweight charts needs: {time: int, open: float, high: float, low: float, close: float}
    data: List[Dict[str, Any]]
