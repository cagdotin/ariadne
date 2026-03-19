import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/dashboard";
import { Projects } from "./pages/projects";
import { ProjectDetail } from "./pages/project-detail";

export function App() {
  const location = useLocation();

  const is_active = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div style={{ 
          padding: '1rem', 
          borderBottom: '1px solid var(--bg-highlight)',
          marginBottom: '1rem'
        }}>
          <h2 style={{ 
            color: 'var(--text)', 
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            Ariadne
          </h2>
          <p style={{ 
            color: 'var(--comment)', 
            fontSize: '0.75rem',
            marginTop: '0.25rem'
          }}>
            AI Agent Analytics
          </p>
        </div>
        
        <nav>
          <Link 
            to="/" 
            className={is_active('/') ? 'active' : ''}
          >
            Dashboard
          </Link>
          <Link 
            to="/projects" 
            className={is_active('/projects') ? 'active' : ''}
          >
            Projects
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:name" element={<ProjectDetail />} />
        </Routes>
      </main>
    </div>
  );
}