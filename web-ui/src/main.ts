import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App.tsx'
import React from 'react'

const rootEl = document.getElementById('app')
if (rootEl) {
  createRoot(rootEl).render(
    React.createElement(StrictMode, null, React.createElement(App))
  )
}
