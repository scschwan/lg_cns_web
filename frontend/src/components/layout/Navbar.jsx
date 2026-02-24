import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { LogOut, Shield, User, KeyRound, ChevronDown, CheckCircle2 } from 'lucide-react';
import authService from '@/services/authService';

const AVATAR_COLORS = [
  'bg-primary', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600',
  'bg-rose-600', 'bg-amber-600', 'bg-cyan-600', 'bg-pink-600',
];

const FinanceLogo = ({ className }) => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary" />
    <path d="M8 22V14h4v8H8Z" fill="white" opacity="0.7" />
    <path d="M14 22V10h4v12h-4Z" fill="white" opacity="0.85" />
    <path d="M20 22V7h4v15h-4Z" fill="white" />
    <path d="M7 8l5 4 5-3 6-2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
  </svg>
);

const Navbar = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'password'
  const dropdownRef = useRef(null);

  // Profile form state
  const [nameInput, setNameInput] = useState('');
  const [avatarColor, setAvatarColor] = useState('bg-primary');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  // Load avatar color from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('avatarColor');
    if (saved) setAvatarColor(saved);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getUserInitial = () => {
    if (user?.name) return user.name.charAt(0).toUpperCase();
    if (user?.username) return user.username.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return 'U';
  };

  const openProfileDialog = () => {
    setDropdownOpen(false);
    setNameInput(user?.name || user?.username || '');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setProfileError('');
    setProfileSuccess('');
    setActiveTab('info');
    const saved = localStorage.getItem('avatarColor');
    setAvatarColor(saved || 'bg-primary');
    setProfileDialogOpen(true);
  };

  const handleSaveProfile = async () => {
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);

    try {
      if (activeTab === 'info') {
        if (!nameInput.trim()) {
          setProfileError('이름을 입력해주세요.');
          setProfileLoading(false);
          return;
        }
        const updated = await authService.updateProfile(nameInput.trim());
        updateUser({ name: updated.name });
        // Save avatar color
        localStorage.setItem('avatarColor', avatarColor);
        setProfileSuccess('프로필이 저장되었습니다.');
      } else {
        if (passwordForm.newPassword.length < 4) {
          setProfileError('새 비밀번호는 최소 4자 이상이어야 합니다.');
          setProfileLoading(false);
          return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          setProfileError('새 비밀번호가 일치하지 않습니다.');
          setProfileLoading(false);
          return;
        }
        await authService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setProfileSuccess('비밀번호가 변경되었습니다.');
      }
    } catch (e) {
      setProfileError(e.response?.data?.message || e.message || '저장에 실패했습니다.');
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <>
      <header className="h-14 border-b bg-card flex items-center justify-between px-4">
        {/* Logo + Title - Clickable to navigate to projects */}
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <FinanceLogo className="h-7 w-7" />
          <h1 className="text-lg font-semibold">Finance Tool</h1>
        </button>

        {user && (
          <div className="flex items-center gap-3">
            {user.role === 'ADMIN' && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="gap-1">
                <Shield className="h-4 w-4" />
                관리자
              </Button>
            )}

            {/* User dropdown trigger */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={`${avatarColor} text-white`}>
                    {getUserInitial()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {user.name || user.username || user.email}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown menu */}
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-card border rounded-lg shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b">
                    <p className="text-sm font-medium">{user.name || user.username}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <button
                    onClick={openProfileDialog}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <User className="h-4 w-4" />
                    프로필 설정
                  </button>
                  <div className="border-t my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Profile Edit Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>프로필 설정</DialogTitle>
            <DialogDescription>사용자 정보를 수정할 수 있습니다.</DialogDescription>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex border-b">
            <button
              onClick={() => { setActiveTab('info'); setProfileError(''); setProfileSuccess(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'info'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="h-4 w-4" />
              기본 정보
            </button>
            <button
              onClick={() => { setActiveTab('password'); setProfileError(''); setProfileSuccess(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'password'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <KeyRound className="h-4 w-4" />
              비밀번호 변경
            </button>
          </div>

          {/* Error/Success messages */}
          {profileError && (
            <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
              {profileError}
            </div>
          )}
          {profileSuccess && (
            <div className="rounded-md bg-green-50 text-green-700 text-sm px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {profileSuccess}
            </div>
          )}

          {/* Tab content */}
          {activeTab === 'info' ? (
            <div className="space-y-4">
              {/* Avatar color picker */}
              <div className="space-y-2">
                <Label>아바타 색상</Label>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className={`${avatarColor} text-white text-lg`}>
                      {nameInput ? nameInput.charAt(0).toUpperCase() : getUserInitial()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex gap-1.5 flex-wrap">
                    {AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setAvatarColor(color)}
                        className={`w-7 h-7 rounded-full ${color} transition-all ${
                          avatarColor === color
                            ? 'ring-2 ring-offset-2 ring-primary scale-110'
                            : 'hover:scale-105'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label>이름</Label>
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="이름을 입력하세요"
                />
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label>이메일</Label>
                <Input value={user?.email || ''} disabled className="bg-muted" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>현재 비밀번호</Label>
                <Input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="현재 비밀번호"
                />
              </div>
              <div className="space-y-2">
                <Label>새 비밀번호</Label>
                <Input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="새 비밀번호 (4자 이상)"
                />
              </div>
              <div className="space-y-2">
                <Label>새 비밀번호 확인</Label>
                <Input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="새 비밀번호 확인"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveProfile} disabled={profileLoading}>
              {profileLoading ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Navbar;
