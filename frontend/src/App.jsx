// frontend/src/App.js (수정 버전)

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import PrivateRoute from './components/PrivateRoute';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ProjectsPage from './pages/project/ProjectsPage';

import ProjectDashboard from './pages/project/ProjectDashboard';
import ProjectDetail from './pages/project/ProjectDetail';
import MultiFileUploadPage from './pages/upload/MultiFileUploadPage';
import ProjectSettingsPage from './pages/project/ProjectSettingsPage';

// ⭐ 신규 화면 Import (5개)
import FileLoadPage from './pages/fileload/FileLoadPage';
import PreprocessingPage from './pages/preprocessing/PreprocessingPage';
import DataTransformPage from './pages/transform/DataTransformPage';
import ClusteringPage from './pages/clustering/ClusteringPage';
import DetailClusteringPage from './pages/detailclustering/DetailClusteringPage';
import ExportPage from './pages/export/ExportPage';

import TestPage from './pages/TestPage';

function App() {
    return (
        <AuthProvider>
            <Router>
                {/* ⭐ Tailwind 테스트용 임시 추가 */}
                                <div className="p-4 bg-blue-500 text-white text-center">
                                    ✅ Tailwind CSS 작동 중!
                                </div>

                <Navbar />
                <Routes>
                    <Route path="/test" element={<TestPage />} />



                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/projects" element={<ProjectsPage />} />


                    {/* Private Routes */}

                    <Route
                        path="/projects/:projectId"
                        element={
                            <PrivateRoute>
                                <ProjectDetail />
                            </PrivateRoute>
                        }
                    />

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

                    {/* ⭐⭐⭐ 신규 라우트: 세션 기반 5개 화면 */}
                    
                    {/* Step 2: File Load */}
                    <Route
                        path="/projects/:projectId/sessions/:sessionId/fileload"
                        element={
                            <PrivateRoute>
                                <FileLoadPage />
                            </PrivateRoute>
                        }
                    />

                    {/* Step 3: Preprocessing */}
                    <Route
                        path="/projects/:projectId/sessions/:sessionId/preprocessing"
                        element={
                            <PrivateRoute>
                                <PreprocessingPage />
                            </PrivateRoute>
                        }
                    />

                    {/* Step 4: Data Transform */}
                    <Route
                        path="/projects/:projectId/sessions/:sessionId/transform"
                        element={
                            <PrivateRoute>
                                <DataTransformPage />
                            </PrivateRoute>
                        }
                    />

                    {/* Step 5: Clustering */}
                    <Route
                        path="/projects/:projectId/sessions/:sessionId/clustering"
                        element={
                            <PrivateRoute>
                                <ClusteringPage />
                            </PrivateRoute>
                        }
                    />

                    {/* Step 6: Export (Classification) */}
                    <Route
                        path="/projects/:projectId/sessions/:sessionId/export"
                        element={
                            <PrivateRoute>
                                <ExportPage />
                            </PrivateRoute>
                        }
                    />

                     {/* Step 7: DetailClustering */}
                    <Route
                        path="/projects/:projectId/sessions/:sessionId/detailclustering"
                        element={
                            <PrivateRoute>
                                <DetailClusteringPage />
                            </PrivateRoute>
                        }
                    />

                    {/* Default Redirect */}
                    <Route path="/" element={<Navigate to="/login" />} />


                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
