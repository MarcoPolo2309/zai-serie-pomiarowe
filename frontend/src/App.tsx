import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { Dashboard } from './Dashboard';
import { Login } from './Login';
import { AdminSeries } from './AdminSeries';
import { AdminSensors } from './AdminSensors';
import { Rejections } from './Rejections';
import { Account } from './Account';

function Protected({ children }: { children: ReactNode }) {
  const { loggedIn } = useAuth();
  return loggedIn ? <>{children}</> : <Navigate to="/login" replace />;
}

function Layout() {
  const { loggedIn, logout } = useAuth();
  const loc = useLocation();
  const heading = useRef<HTMLElement>(null);

  // Po zmianie widoku przenosimy fokus na treść (wygodne dla czytników ekranu i klawiatury)
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <>
      <a className="skip-link" href="#main">Przejdź do treści</a>
      <header className="site-header no-print">
        <span className="brand">Serie pomiarowe</span>
        <nav aria-label="Główna nawigacja">
          <NavLink to="/" end>Dane</NavLink>
          {loggedIn ? (
            <>
              <NavLink to="/admin/serie">Serie</NavLink>
              <NavLink to="/admin/czujniki">Czujniki</NavLink>
              <NavLink to="/admin/odrzucenia">Odrzucenia</NavLink>
              <NavLink to="/konto">Konto</NavLink>
              <button type="button" className="link-button" onClick={() => void logout()}>Wyloguj</button>
            </>
          ) : (
            <NavLink to="/login">Logowanie</NavLink>
          )}
        </nav>
      </header>
      <main id="main" tabIndex={-1} ref={heading}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/serie" element={<Protected><AdminSeries /></Protected>} />
          <Route path="/admin/czujniki" element={<Protected><AdminSensors /></Protected>} />
          <Route path="/admin/odrzucenia" element={<Protected><Rejections /></Protected>} />
          <Route path="/konto" element={<Protected><Account /></Protected>} />
          <Route path="*" element={<><h1>Nie znaleziono strony</h1><p><NavLink to="/">Wróć do danych</NavLink></p></>} />
        </Routes>
      </main>
    </>
  );
}

export function App() {
  return <AuthProvider><Layout /></AuthProvider>;
}
