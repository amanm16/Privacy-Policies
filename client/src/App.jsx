import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './auth';
import Shell from './components/Shell';
import LoginPage from './pages/LoginPage';
import PolicyListPage from './pages/PolicyListPage';
import PolicyEditorPage from './pages/PolicyEditorPage';

function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <p className="loading">Loading…</p>;
  if (status !== 'signed-in') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function EditPolicy() {
  const { id } = useParams();
  return <PolicyEditorPage key={id} id={id} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<PolicyListPage />} />
        <Route path="new" element={<PolicyEditorPage key="new" />} />
        <Route path="policies/:id" element={<EditPolicy />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
