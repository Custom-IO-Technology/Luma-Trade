const API_BASE_URL = '/api';

export const fetchHistory = async (symbol, interval = '60') => {
  const response = await fetch(`${API_BASE_URL}/history/${symbol}?interval=${interval}`);
  if (!response.ok) {
    throw new Error('Failed to fetch history');
  }
  return response.json();
};

export const fetchScore = async (symbol, interval = '60') => {
  const response = await fetch(`${API_BASE_URL}/widgets/score/${symbol}?interval=${interval}`);
  if (!response.ok) {
    throw new Error('Failed to fetch score');
  }
  return response.json();
};
