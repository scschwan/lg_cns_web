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
import StartAnalysisPage from './pages/startAnalysis/StartAnalysisPage';
import PreprocessingPage from './pages/preprocessing/PreprocessingPage';
import DataTransformPage from './pages/transform/DataTransformPage';
import ClusteringPage from './pages/clustering/ClusteringPage';
import ExportPage from './pages/export/ExportPage';
import DetailClusteringPage from './pages/detailclustering/DetailClusteringPage';

// Test Page
import TestPage from './pages/TestPage';

// 신규 서비스 마크업 Pages
import NewServiceLayout from './components/layout/NewServiceLayout';
import LongListPage from './pages/longlist/LongListPage';
import ShortListPage from './pages/shortlist/ShortListPage';
import AbleTaskRegisterPage from './pages/abletask/AbleTaskRegisterPage';
import AbleTaskManagePage from './pages/abletaskmanage/AbleTaskManagePage';
import CompletedTaskManagePage from './pages/completedtask/CompletedTaskManagePage';

// Admin Pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import ProjectManagement from './pages/admin/ProjectManagement';
import S3Management from './pages/admin/S3Management';
import SessionMonitoring from './pages/admin/SessionMonitoring';
import AuditLogPage from './pages/admin/AuditLogPage';
import AdminProfile from './pages/admin/AdminProfile';

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

          {/* 신규 서비스 마크업 (인증 불필요, NewServiceLayout 사용) */}
          <Route path="/longlist" element={<NewServiceLayout><LongListPage /></NewServiceLayout>} />
          <Route path="/shortlist" element={<NewServiceLayout><ShortListPage /></NewServiceLayout>} />
          <Route path="/able-register" element={<NewServiceLayout><AbleTaskRegisterPage /></NewServiceLayout>} />
          <Route path="/able-manage" element={<NewServiceLayout><AbleTaskManagePage /></NewServiceLayout>} />
          <Route path="/completed-manage" element={<NewServiceLayout><CompletedTaskManagePage /></NewServiceLayout>} />

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

          {/* Step 2: Start Analysis */}
          <Route
            path="/projects/:projectId/sessions/:sessionId/startanalysis"
            element={
              <PrivateRoute>
                <LayoutWrapper>
                  <DashboardLayout>
                    <StartAnalysisPage />
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

          {/* 🔐 Admin Routes */}
          <Route
            path="/admin"
            element={
              <PrivateRoute requireAdmin>
                <LayoutWrapper>
                  <AdminLayout />
                </LayoutWrapper>
              </PrivateRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="projects" element={<ProjectManagement />} />
            <Route path="s3" element={<S3Management />} />
            <Route path="sessions" element={<SessionMonitoring />} />
            <Route path="logs" element={<AuditLogPage />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>

          {/* Default Redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;