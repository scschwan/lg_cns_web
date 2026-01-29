// frontend/src/App.js (수정 버전)

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';

import DashboardLayout from './components/layout/DashboardLayout'; // ⭐ 추가
import PrivateRoute from './components/PrivateRoute';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ProjectsPage from './pages/project/ProjectsPage';

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

                <Navbar />
                <Routes>
                    <Route path="/test" element={<TestPage />} />



                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/projects" element={<ProjectsPage />} />


                    {/* Private Routes */}


                    <Route
                        path="/projects/:projectId/settings"
                        element={
                            <PrivateRoute>
                                <ProjectSettingsPage />
                            </PrivateRoute>
                        }
                    />

                    {/* ⭐⭐⭐ Step 1-7: DashboardLayout으로 감싸기 */}

                   {/* Step 1: Multi File Upload */}
                   <Route
                       path="/projects/:projectId/upload"
                       element={
                           <PrivateRoute>
                               <DashboardLayout>
                                   <MultiFileUploadPage />
                               </DashboardLayout>
                           </PrivateRoute>
                       }
                   />

                   {/* Step 2: File Load */}
                   <Route
                       path="/projects/:projectId/sessions/:sessionId/fileload"
                       element={
                           <PrivateRoute>
                               <DashboardLayout>
                                   <FileLoadPage />
                               </DashboardLayout>
                           </PrivateRoute>
                       }
                   />

                   {/* Step 3: Preprocessing */}
                   <Route
                       path="/projects/:projectId/sessions/:sessionId/preprocessing"
                       element={
                           <PrivateRoute>
                               <DashboardLayout>
                                   <PreprocessingPage />
                               </DashboardLayout>
                           </PrivateRoute>
                       }
                   />

                   {/* Step 4: Data Transform */}
                   <Route
                       path="/projects/:projectId/sessions/:sessionId/transform"
                       element={
                           <PrivateRoute>
                               <DashboardLayout>
                                   <DataTransformPage />
                               </DashboardLayout>
                           </PrivateRoute>
                       }
                   />

                   {/* Step 5: Clustering */}
                   <Route
                       path="/projects/:projectId/sessions/:sessionId/clustering"
                       element={
                           <PrivateRoute>
                               <DashboardLayout>
                                   <ClusteringPage />
                               </DashboardLayout>
                           </PrivateRoute>
                       }
                   />

                   {/* Step 6: Export (Classification) */}
                   <Route
                       path="/projects/:projectId/sessions/:sessionId/export"
                       element={
                           <PrivateRoute>
                               <DashboardLayout>
                                   <ExportPage />
                               </DashboardLayout>
                           </PrivateRoute>
                       }
                   />

                    {/* Step 7: DetailClustering */}
                   <Route
                       path="/projects/:projectId/sessions/:sessionId/detailclustering"
                       element={
                           <PrivateRoute>
                               <DashboardLayout>
                                   <DetailClusteringPage />
                               </DashboardLayout>
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
