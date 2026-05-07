import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Predicciones from './pages/Predicciones'
import Ranking from './pages/Ranking'
import Admin from './pages/Admin'

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