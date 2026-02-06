import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, Shield } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getUserInitial = () => {
    if (user?.username) return user.username.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return 'U';
  };

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4">
      <h1 className="text-lg font-semibold">Finance Tool</h1>

      {user && (
        <div className="flex items-center gap-3">
          {user.role === 'ADMIN' && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="gap-1">
              <Shield className="h-4 w-4" />
              관리자
            </Button>
          )}
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getUserInitial()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">
            {user.username || user.name || user.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            로그아웃
          </Button>
        </div>
      )}
    </header>
  );
};

export default Navbar;
