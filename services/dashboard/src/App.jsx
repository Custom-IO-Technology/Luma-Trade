import React, { useState } from 'react';
import AppShell from './components/layout/AppShell';

function App() {
  const [activeSymbol, setActiveSymbol] = useState('BTCUSDT');

  return (
    <AppShell activeSymbol={activeSymbol} setActiveSymbol={setActiveSymbol} />
  );
}

export default App;
