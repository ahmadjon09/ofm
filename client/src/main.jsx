import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './global.css'
import { ContextProvider } from './contextData/Context.jsx'


createRoot(document.getElementById('root')).render(
  <ContextProvider>
    <App />
  </ContextProvider>
)
