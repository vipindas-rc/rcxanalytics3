import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, suiLight } from '@ringcentral/spring-theme'
import './standalone.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={suiLight} scope="flint-chart-lab" className="analytics-standalone-theme">
      <div className="analytics-portal analytics-standalone-root">
        <App />
      </div>
    </ThemeProvider>
  </StrictMode>,
)
