import React from 'react'
import ReactDOM from 'react-dom/client'
// Font nhúng offline (design system Anthropic warm): serif hiển thị + sans thân + mono.
// @fontsource gói sẵn woff2 (kèm subset vietnamese) -> app chạy offline không phụ thuộc mạng.
import '@fontsource/cormorant-garamond/500.css' // display serif (tiêu đề)
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/inter/400.css' // body / UI sans
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css' // code / timestamp / editor
import App from './App'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
