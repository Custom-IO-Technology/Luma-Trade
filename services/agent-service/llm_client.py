import os
import json
import base64
import requests
from abc import ABC, abstractmethod
import google.generativeai as genai

# Setup LLM configuration from environment
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# Initialize Gemini if key is provided
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

class BaseLLMClient(ABC):
    """
    SOLID Interface for all AI Model Providers (Gemini, Ollama, OpenAI etc.).
    Open for extension by subclassing, closed for modification.
    """
    
    @abstractmethod
    async def analyze_chart(self, image_bytes: bytes, user_idea: str, indicator_data: dict) -> dict:
        """
        Multimodal analysis of a chart screenshot plus user annotation.
        Returns a dict containing:
        - trend_analysis (str)
        - support_resistance (str)
        - strategy_rating (int, 1-100)
        - strategy_feedback (str)
        """
        pass
        
    @abstractmethod
    async def generate_morning_report(self, coins_data: list) -> str:
        """
        Generates a unified daily morning overview report for the tracked coins.
        """
        pass
        
    @abstractmethod
    async def chat(self, prompt: str, system_instruction: str) -> str:
        """
        General conversational chat for Telegram command dispatch or dashboard user conversations.
        """
        pass

class GeminiLLMClient(BaseLLMClient):
    """
    Gemini API implementation of the BaseLLMClient.
    """
    def __init__(self):
        # We default to gemini-2.5-flash as the standard stable model
        self.model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")

    def _get_model(self):
        return genai.GenerativeModel(
            self.model_name
        )
        
    async def analyze_chart(self, image_bytes: bytes, user_idea: str, indicator_data: dict) -> dict:
        if not GEMINI_API_KEY:
            return self._get_fallback_analysis("Gemini API key is not configured.")
            
        try:
            model = self._get_model()
            
            image_part = {
                "mime_type": "image/png",
                "data": image_bytes
            }
            
            prompt = f"""
            You are a professional expert trading analyst.
            Analyze the attached chart screenshot. 
            
            Here are the current calculated indicator metrics for this symbol:
            {json.dumps(indicator_data, indent=2)}
            
            The user has the following idea/hypothesis:
            "{user_idea}"
            
            Please provide a structured professional evaluation and identify key chart drawings:
            1. Trend Analysis: What is the current trend (bullish/bearish/neutral) based on the moving averages and price action?
            2. Support & Resistance: Identify the immediate support and resistance levels visible on the chart.
            3. Strategy Score: Give a confidence score (from 0 to 100) on how viable the user's idea is.
            4. Strategy Feedback: Detailed points explaining why the score was given, potential entries, exits, risk factors, or targets.
            5. Chart Drawings: Identify key horizontal support/resistance levels and trendlines that should be drawn on the chart:
               - Horizontal lines (type: "horizontal") at specific key support or resistance prices.
               - Trendlines (type: "trendline") starting at a historical swing high/low and ending at a recent high/low. Specify start_price, end_price, and their time offsets in bars from the right edge of the chart (e.g. -50 means 50 bars ago, -5 means 5 bars ago. Must be negative integers).
            
            Reply ONLY with a JSON object in this format:
            {{
                "trend_analysis": "short description of trend",
                "support_resistance": "immediate support at X, resistance at Y",
                "strategy_rating": 75,
                "strategy_feedback": "detailed review bullet points",
                "drawings": [
                    {{"type": "horizontal", "price": 64200.0}},
                    {{"type": "horizontal", "price": 67500.0}},
                    {{"type": "trendline", "start_price": 62000.0, "start_time_offset": -45, "end_price": 65500.0, "end_time_offset": -5}}
                ]
            }}
            """
            
            response = model.generate_content([image_part, prompt])
            # Remove markdown backticks if returned
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            
            return json.loads(text.strip())
        except Exception as e:
            print(f"[GeminiLLMClient Error]: {e}")
            return self._get_fallback_analysis(f"Failed to run Gemini analysis: {str(e)}")

    async def generate_morning_report(self, coins_data: list) -> str:
        if not GEMINI_API_KEY:
            return "Gemini API key is not configured for morning reports."
            
        try:
            model = self._get_model()
            prompt = f"""
            You are a chief market analyst at an algorithmic trading fund.
            Generate a detailed morning market analysis report for the following tracked coins based on their current metrics:
            
            {json.dumps(coins_data, indent=2)}
            
            Please structure the morning report as follows:
            1. Market Overview: General market sentiment and conditions (Bullish, Bearish, Sideways).
            2. Top Setup of the Day: Which coin has the absolute best condition/setup today and why (refer to technical parameters like EMA, MACD, RSI)?
            3. Coin-by-coin Quick Analysis: Explain the status, trend, and recommended action range (entry/exit trigger) for each coin.
            
            Format the report beautifully in Markdown with emojis. Keep it professional, concise, and focused on risk management.
            """
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"⚠️ Error generating morning report from Gemini: {e}"

    async def chat(self, prompt: str, system_instruction: str) -> str:
        if not GEMINI_API_KEY:
            return "Gemini API key is not configured."
        try:
            model = self._get_model()
            full_prompt = f"System Instruction: {system_instruction}\n\nUser Prompt: {prompt}"
            response = model.generate_content(full_prompt)
            return response.text
        except Exception as e:
            return f"Gemini Error: {e}"

    def _get_fallback_analysis(self, message: str) -> dict:
        return {
            "trend_analysis": "Error loading AI analysis.",
            "support_resistance": "N/A",
            "strategy_rating": 0,
            "strategy_feedback": f"Fallback: {message}",
            "drawings": []
        }

class OllamaLLMClient(BaseLLMClient):
    """
    Ollama implementation for running local LLMs (e.g. Llama3, Mistral, LLaVA for vision).
    Uses the Ollama REST API.
    """
    def __init__(self):
        self.host = OLLAMA_HOST
        self.model = OLLAMA_MODEL
        
    async def analyze_chart(self, image_bytes: bytes, user_idea: str, indicator_data: dict) -> dict:
        # If the local model is a vision model (e.g. llava, bakllava), we can send the image.
        # Otherwise, we feed the technical indicators JSON directly.
        is_vision = "llava" in self.model or "vision" in self.model
        
        try:
            url = f"{self.host}/api/chat"
            
            # Format message
            system_prompt = "You are a professional trading analyst. Respond only in strict JSON format."
            user_prompt = f"""
            Analyze the trading idea for this chart.
            
            Technical Indicators Data:
            {json.dumps(indicator_data, indent=2)}
            
            User's trading idea:
            "{user_idea}"
            
            Provide a structured evaluation in JSON:
            {{
                "trend_analysis": "short trend summary",
                "support_resistance": "immediate support at X, resistance at Y",
                "strategy_rating": 50, // 0-100 score
                "strategy_feedback": "detailed recommendations",
                "drawings": []
            }}
            """
            
            messages = []
            if is_vision:
                # Encode image to base64 for Ollama
                img_b64 = base64.b64encode(image_bytes).decode('utf-8')
                messages.append({
                    "role": "user",
                    "content": user_prompt,
                    "images": [img_b64]
                })
            else:
                messages.append({
                    "role": "system",
                    "content": system_prompt
                })
                messages.append({
                    "role": "user",
                    "content": f"[Vision not enabled on local model {self.model}. Relying on indicator metrics data only]\n\n{user_prompt}"
                })
                
            payload = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "format": "json"
            }
            
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            
            result_content = response.json()["message"]["content"]
            return json.loads(result_content.strip())
            
        except Exception as e:
            print(f"[OllamaLLMClient Error]: {e}")
            return {
                "trend_analysis": "Local LLM analysis failed.",
                "support_resistance": "N/A",
                "strategy_rating": 0,
                "strategy_feedback": f"Ollama connection error: {str(e)}. Make sure Ollama is running at {self.host} with model '{self.model}'."
            }

    async def generate_morning_report(self, coins_data: list) -> str:
        try:
            url = f"{self.host}/api/generate"
            prompt = f"""
            Generate a detailed morning market analysis report for the following tracked coins based on their current metrics:
            
            {json.dumps(coins_data, indent=2)}
            
            Structure the report in markdown format:
            1. Market Overview
            2. Top Setup of the Day
            3. Coin-by-coin analysis with recommended action range.
            
            Keep it focused and professional.
            """
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False
            }
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            return response.json()["response"]
        except Exception as e:
            return f"⚠️ Local LLM (Ollama) morning report error: {e}"

    async def chat(self, prompt: str, system_instruction: str) -> str:
        try:
            url = f"{self.host}/api/chat"
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ],
                "stream": False
            }
            response = requests.post(url, json=payload, timeout=15)
            response.raise_for_status()
            return response.json()["message"]["content"]
        except Exception as e:
            return f"Ollama Chat Error: {e}"

class LLMClientFactory:
    """
    Factory to retrieve active LLM Provider client.
    Open for extension by returning different classes.
    """
    @staticmethod
    def get_client() -> BaseLLMClient:
        if LLM_PROVIDER == "ollama":
            return OllamaLLMClient()
        # Default fallback to Gemini
        return GeminiLLMClient()
