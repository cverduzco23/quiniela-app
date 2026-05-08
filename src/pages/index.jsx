import { useSearchParams } from 'react-router-dom'
import Home from './home'
import Predicciones from './predicciones'

export default function Index() {
  const [params] = useSearchParams()
  return params.get('q') ? <Predicciones /> : <Home />
}
