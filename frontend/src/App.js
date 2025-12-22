import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProjectDashboard from './pages/ProjectDashboard';
import ProjectDetail from './pages/ProjectDetail';  // ⭐ 신규 추가

function App() {
    return (
        <AuthProvider>
            <Router>
                <Navbar />
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />

                    {/* Private Routes */}
                    <Route
                        path="/projects"
                        element={
                            <PrivateRoute>
                                <ProjectDashboard />
                            </PrivateRoute>
                        }
                    />
                    {/* ⭐ 신규 라우트 */}
                    <Route
                        path="/projects/:projectId"
                        element={
                            <PrivateRoute>
                                <ProjectDetail />
                            </PrivateRoute>
                        }
                    />

                    {/* Default Redirect */}
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;