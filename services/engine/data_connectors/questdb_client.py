import aiohttp
import polars as pl
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class QuestDBClient:
    """
    Client for querying historical data from QuestDB via HTTP.
    """
    
    def __init__(self, http_url: str):
        self.http_url = http_url
        self.exec_endpoint = f"{http_url}/exec"
        
    async def get_recent_klines(self, symbol: str, limit: int = 500) -> Optional[pl.DataFrame]:
        """
        Fetch recent closed candles from QuestDB and return as Polars DataFrame.
        """
        query = f"SELECT * FROM klines WHERE symbol = '{symbol}' ORDER BY timestamp DESC LIMIT {limit}"
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(self.exec_endpoint, params={"query": query}) as response:
                    if response.status != 200:
                        text = await response.text()
                        logger.error(f"QuestDB error: {text}")
                        return None
                        
                    data = await response.json()
                    
                    if "dataset" not in data or not data["dataset"]:
                        return None
                        
                    # Columns match the schema: symbol, open, high, low, close, volume, timestamp
                    columns = [col["name"] for col in data["columns"]]
                    dataset = data["dataset"]
                    
                    # Reverse dataset to get chronological order (oldest to newest)
                    dataset.reverse()
                    
                    df = pl.DataFrame(dataset, schema=columns, orient="row")
                    
                    # Convert timestamp from string/micros to datetime if needed
                    # but usually QuestDB REST returns string like '2023-10-01T12:00:00.000000Z'
                    # For our Polars engine, we'll keep the numerical precision if we parse it
                    
                    return df
            except Exception as e:
                logger.error(f"Failed to fetch from QuestDB: {e}")
                return None
