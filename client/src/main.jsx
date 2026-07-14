import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './global.css'
import { ContextProvider } from './contextData/Context.jsx'
import { SWRConfig } from 'swr'

// SWR global config
const swrConfig = {
  fetcher: (resource, init) => fetch(resource, init).then(res => res.json()),
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: true,
  dedupingInterval: 2000,
  focusThrottleInterval: 5000,
  loadingTimeout: 3000,
  errorRetryInterval: 5000,
  errorRetryCount: 3,
  compare: (a, b) => JSON.stringify(a) === JSON.stringify(b)
}

createRoot(document.getElementById('root')).render(
  <ContextProvider>
    <SWRConfig value={swrConfig}>
      <App />
    </SWRConfig>
  </ContextProvider>
)
