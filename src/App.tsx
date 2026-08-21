import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { StockDetail } from './pages/StockDetail';

import { WatchlistProvider } from './context/WatchlistContext';

function App() {
  return (
    <BrowserRouter basename="/taiwan-stock-reviewer">
      <WatchlistProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stock/:symbol" element={<StockDetail />} />
        </Routes>
      </WatchlistProvider>
    </BrowserRouter>
  );
}

export default App;
