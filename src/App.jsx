import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Predicciones from './pages/predicciones'
import Ranking from './pages/ranking'
import Admin from './pages/admin'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Predicciones />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App