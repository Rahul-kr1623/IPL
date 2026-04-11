import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import IntelHub from './components/IntelHub';
import PulseEngagement from './components/PulseEngagement';
import Home from './pages/Home';
import Fixtures from './pages/Fixtures';
import Teams from './pages/Teams';
import Squad from './pages/Squad';
import Stats from './pages/Stats';
import Players from './pages/Players';
import PlayerDetail from './pages/PlayerDetail';
import PointsTable from './pages/PointsTable';
import NotFound from './pages/NotFound';

function App() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-ipl-neon/30">
      <Navbar />
      <IntelHub />
      <PulseEngagement />
      <main className="flex-1 pt-24 overflow-x-hidden relative w-full">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/fixtures" element={<Fixtures />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:id" element={<Squad />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/points" element={<PointsTable />} />
          <Route path="/players" element={<Players />} />
          <Route path="/player/:id" element={<PlayerDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default App;