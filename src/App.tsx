import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { StockDetail } from './pages/StockDetail';
import { MarketOverview } from './pages/MarketOverview';

import { WatchlistProvider } from './context/WatchlistContext';

function App() {
  return (
    <BrowserRouter basename="/taiwan-stock-reviewer">
      <WatchlistProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/market" element={<MarketOverview />} />
          <Route path="/stock/:symbol" element={<StockDetail />} />
        </Routes>
      </WatchlistProvider>
    </BrowserRouter>
  );
}

export default App;
