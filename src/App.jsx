import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Index from './pages/index'
import Ranking from './pages/ranking'
import Admin from './pages/admin'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App