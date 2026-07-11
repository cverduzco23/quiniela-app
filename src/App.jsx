import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Index from './pages/index'
import Predicciones from './pages/predicciones'
import Ranking from './pages/ranking'
import Admin from './pages/admin'
import Donar from './pages/donar'
import { DialogProvider } from './components/Dialogs'

function App() {
  return (
    <BrowserRouter>
      <DialogProvider>
      <Routes>
        {/* Ruta "limpia" del link de jugar: /quiniela/<id>. */}
        <Route path="/quiniela/:id" element={<Predicciones />} />
        {/* "/" sigue mostrando Home, o Predicciones si trae ?q=<id>
            (compatibilidad con los links viejos ya compartidos). */}
        <Route path="/" element={<Index />} />
        {/* Ranking "limpio": /ranking/<id>. La forma vieja /ranking?q=<id>
            se mantiene abajo para los links ya compartidos. */}
        <Route path="/ranking/:id" element={<Ranking />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/donar" element={<Donar />} />
      </Routes>
      </DialogProvider>
    </BrowserRouter>
  )
}

export default App