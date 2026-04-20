import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// 在 React 渲染前立即应用已保存的主题，防止闪烁
try {
  const saved = JSON.parse(localStorage.getItem('muze-ui') || '{}')
  if (saved?.state?.theme) {
    document.documentElement.setAttribute('data-theme', saved.state.theme)
  }
} catch {
  // 忽略解析错误，使用默认主题
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
