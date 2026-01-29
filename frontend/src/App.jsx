// frontend/src/App.jsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import DashboardLayout from './components/layout/DashboardLayout';
import PrivateRoute from './components/PrivateRoute';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Project Pages
import ProjectsPage from './pages/project/ProjectsPage';
import ProjectSettingsPage from './pages/project/ProjectSettingsPage';

// Step 1-7 Pages
import MultiFileUploadPage from './pages/upload/MultiFileUploadPage';
import FileLoadPage from './pages/fileload/FileLoadPage';
import PreprocessingPage from './pages/preprocessing/PreprocessingPage';
import DataTransformPage from './pages/transform/DataTransformPage';
import ClusteringPage from './pages/clustering/ClusteringPage';
import ExportPage from './pages/export/ExportPage';
import DetailClusteringPage from './pages/detailclustering/DetailClusteringPage';

// Test Page
import TestPage from './pages/TestPage';

// ⭐ Layout Wrapper Component
function LayoutWrapper({ children, showNavbar = true }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {showNavbar && <Navbar />}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* 🔓 Public Routes (No Navbar) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/test" element={<TestPage />} />

          {/* 🔒 Private Routes with Navbar */}
          <Route
            path="/projects"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <div className="h-full overflow-y-auto">
                    <ProjectsPage />
                  </div>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          <Route
            path="/projects/:projectId/settings"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <div className="h-full overflow-y-auto">
                    <ProjectSettingsPage />
                  </div>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* 🎯 Step 1-7: DashboardLayout (Navbar + Sidebar) */}

          {/* Step 1: Multi File Upload */}
          <Route
            path="/projects/:projectId/upload"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <MultiFileUploadPage />
                  </DashboardLayout>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* Step 2: File Load */}
          <Route
            path="/projects/:projectId/sessions/:sessionId/fileload"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <FileLoadPage />
                  </DashboardLayout>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* Step 3: Preprocessing */}
          <Route
            path="/projects/:projectId/sessions/:sessionId/preprocessing"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <PreprocessingPage />
                  </DashboardLayout>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* Step 4: Data Transform */}
          <Route
            path="/projects/:projectId/sessions/:sessionId/transform"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <DataTransformPage />
                  </DashboardLayout>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* Step 5: Clustering */}
          <Route
            path="/projects/:projectId/sessions/:sessionId/clustering"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <ClusteringPage />
                  </DashboardLayout>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* Step 6: Export */}
          <Route
            path="/projects/:projectId/sessions/:sessionId/export"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <ExportPage />
                  </DashboardLayout>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* Step 7: Detail Clustering */}
          <Route
            path="/projects/:projectId/sessions/:sessionId/detailclustering"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <DetailClusteringPage />
                  </DashboardLayout>
                </LayoutWrapper>
              </PrivateRoute>
            }
          />

          {/* Default Redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;