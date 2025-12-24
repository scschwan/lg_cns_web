import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ProjectDashboard from './pages/project/ProjectDashboard';
import ProjectDetail from './pages/project/ProjectDetail';  // ⭐ 신규 추가
import MultiFileUploadPage from './pages/upload/MultiFileUploadPage';  // ⭐ 추가
import ProjectSettingsPage from './pages/project/ProjectSettingsPage';  // ⭐ 추가

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
                    {/* ⭐ 신규 라우트 추가 */}
                    <Route
                        path="/projects/:projectId/upload"
                        element={
                            <PrivateRoute>
                                <MultiFileUploadPage />
                            </PrivateRoute>
                        }
                    />

                    <Route
                        path="/projects/:projectId/settings"
                        element={
                            <PrivateRoute>
                                <ProjectSettingsPage />
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