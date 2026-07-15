import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Index from './pages/index'
import Predicciones from './pages/predicciones'
import Ranking from './pages/ranking'
import Temporada from './pages/temporada'
import Admin from './pages/admin'
import Donar from './pages/donar'
import { Privacidad, Terminos } from './pages/legal'
import { DialogProvider } from './components/Dialogs'

function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname, search])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <DialogProvider>
        <ScrollToTop />
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
          {/* Tabla general de una temporada (grupo de quinielas). */}
          <Route path="/temporada/:id" element={<Temporada />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/donar" element={<Donar />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="/terminos" element={<Terminos />} />
        </Routes>
      </DialogProvider>
    </BrowserRouter>
  )
}

export default App
