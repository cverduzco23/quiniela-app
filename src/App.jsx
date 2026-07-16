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
import { esIndexable, urlCanonica } from './utils/seo'

function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname, search])

  return null
}

// index.html sale indexable por defecto (lo que necesita la portada). Aquí se
// marca noindex ruta por ruta en las páginas privadas y se fija la canónica.
function Seo() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    const indexable = esIndexable(pathname, search)
    const contenido = indexable ? 'index, follow' : 'noindex, nofollow'
    for (const nombre of ['robots', 'googlebot']) {
      let tag = document.querySelector(`meta[name="${nombre}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', nombre)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', contenido)
    }

    // Canónica solo en lo indexable: apuntar a una URL canónica desde una
    // página noindex manda señales cruzadas a Google.
    let link = document.querySelector('link[rel="canonical"]')
    if (indexable) {
      if (!link) {
        link = document.createElement('link')
        link.setAttribute('rel', 'canonical')
        document.head.appendChild(link)
      }
      link.setAttribute('href', urlCanonica(pathname))
    } else if (link) {
      link.remove()
    }
  }, [pathname, search])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <DialogProvider>
        <ScrollToTop />
        <Seo />
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
