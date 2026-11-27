import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { StockDetail } from './pages/StockDetail';
import { MarketOverview } from './pages/MarketOverview';
import { Industries } from './pages/Industries';
import { IndustryStocks } from './pages/IndustryStocks';

import { WatchlistProvider } from './context/WatchlistContext';

function App() {
  return (
    <BrowserRouter basename="/taiwan-stock-reviewer">
      <WatchlistProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/market" element={<MarketOverview />} />
          <Route path="/industries" element={<Industries />} />
          <Route path="/industries/:industry" element={<IndustryStocks />} />
          <Route path="/concepts/:conceptId" element={<IndustryStocks />} />
          <Route path="/stock/:symbol" element={<StockDetail />} />
        </Routes>
      </WatchlistProvider>
    </BrowserRouter>
  );
}

export default App;
