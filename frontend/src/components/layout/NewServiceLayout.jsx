import React from 'react';
import NewServiceSidebar from './NewServiceSidebar';

const NewServiceLayout = ({ children }) => {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="h-14 border-b bg-card flex items-center justify-between px-4 flex-shrink-0">
        <h1 className="text-lg font-semibold">Finance Tool</h1>
        <span className="text-sm text-muted-foreground">신규 서비스 Preview</span>
      </header>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        <NewServiceSidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
};

export default NewServiceLayout;
