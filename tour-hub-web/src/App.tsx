import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { PublishEditorPage } from './pages/PublishEditorPage'
import { PublishListPage } from './pages/PublishListPage'
import { TourPage } from './pages/TourPage'
import { ExperiencePage } from './pages/ExperiencePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tour/:id" element={<TourPage />} />
        <Route path="/experience/:id" element={<ExperiencePage />} />
        <Route path="/publish" element={<PublishListPage />} />
        <Route path="/publish/:id" element={<PublishEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
