from typing import Protocol, AsyncIterator, Dict, Any

class MessageBroker(Protocol):
    """
    Dependency Inversion Principle (DIP):
    Abstract interface for message brokers. The engine should never depend
    on Redis directly, but on this interface.
    """
    
    async def consume(self, stream: str, group: str) -> AsyncIterator[Dict[str, Any]]:
        """
        Consume messages from a stream using a consumer group.
        Yields dictionaries representing the message payload.
        """
        ...
        
    async def publish(self, channel: str, data: Dict[str, Any]) -> None:
        """
        Publish a dictionary payload to a channel/key.
        """
        ...
        
    async def set_state(self, key: str, data: Dict[str, Any]) -> None:
        """
        Set a key-value state (e.g. latest confidence score).
        """
        ...
