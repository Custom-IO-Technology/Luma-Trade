import json
import logging
from typing import AsyncIterator, Dict, Any
import redis.asyncio as redis
from core.message_broker import MessageBroker

logger = logging.getLogger(__name__)

class RedisClient(MessageBroker):
    """
    Concrete implementation of MessageBroker for Redis.
    """
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.client = redis.from_url(redis_url, decode_responses=True)
        self.consumer_name = "engine-consumer-1"
        
    async def _ensure_group(self, stream: str, group: str):
        try:
            await self.client.xgroup_create(stream, group, id="0", mkstream=True)
            logger.info(f"Created consumer group {group} for stream {stream}")
        except redis.exceptions.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                logger.error(f"Error creating consumer group: {e}")
                raise
                
    async def consume(self, stream: str, group: str) -> AsyncIterator[Dict[str, Any]]:
        await self._ensure_group(stream, group)
        
        while True:
            try:
                # Block for up to 5 seconds waiting for new messages
                messages = await self.client.xreadgroup(
                    groupname=group,
                    consumername=self.consumer_name,
                    streams={stream: ">"},
                    count=10,
                    block=5000
                )
                
                if not messages:
                    continue
                    
                for stream_name, stream_messages in messages:
                    for message_id, message_data in stream_messages:
                        try:
                            # The rust ingestor writes {"symbol": "...", "data": "json_string"}
                            raw_data = message_data.get("data")
                            if raw_data:
                                parsed = json.loads(raw_data)
                                yield parsed
                                
                            # Acknowledge message processing
                            await self.client.xack(stream, group, message_id)
                        except json.JSONDecodeError:
                            logger.error(f"Failed to decode message {message_id}: {message_data}")
                            await self.client.xack(stream, group, message_id) # Ack to skip poison pill
                            
            except Exception as e:
                logger.error(f"Redis consumer error: {e}")
                import asyncio
                await asyncio.sleep(1) # Backoff on error
                
    async def publish(self, channel: str, data: Dict[str, Any]) -> None:
        payload = json.dumps(data)
        await self.client.publish(channel, payload)
        
    async def set_state(self, key: str, data: Dict[str, Any]) -> None:
        payload = json.dumps(data)
        await self.client.set(key, payload)
