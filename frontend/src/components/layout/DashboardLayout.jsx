import React from 'react';
import Sidebar from './Sidebar';

const DashboardLayout = ({ children }) => {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
       <main className="flex-1 overflow-y-auto">
            {/* ⭐ 수정: container 제거, padding만 최소화 */}
            <div className="w-full px-4 py-6">
              {children}
            </div>
      </main>
    </div>
  );
};

export default DashboardLayout;