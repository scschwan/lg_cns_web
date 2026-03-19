/**
 * 관리자 레이아웃 컴포넌트
 *
 * 관리자 페이지의 공통 레이아웃으로, 좌측 사이드바 네비게이션과
 * 메인 콘텐츠 영역(Outlet)으로 구성된다.
 * 대시보드, 사용자 관리, 프로젝트 관리 등 관리 메뉴를 제공한다.
 *
 * @component
 */
import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    LayoutDashboard, Users, FolderKanban, HardDrive,
    Monitor, FileText, UserCog
} from 'lucide-react';

/** 관리자 사이드바 메뉴 탭 설정 */
const tabs = [
    { path: '/admin', label: '대시보드', icon: LayoutDashboard, exact: true },
    { path: '/admin/users', label: '사용자 관리', icon: Users },
    { path: '/admin/projects', label: '프로젝트 관리', icon: FolderKanban },
    { path: '/admin/s3', label: 'S3 파일 관리', icon: HardDrive },
    { path: '/admin/sessions', label: '세션 모니터링', icon: Monitor },
    { path: '/admin/logs', label: '감사 로그', icon: FileText },
    { path: '/admin/profile', label: '프로필', icon: UserCog },
];

export default function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (tab) => {
        if (tab.exact) return location.pathname === tab.path;
        return location.pathname.startsWith(tab.path);
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* 좌측 사이드바 */}
            <div className="w-56 border-r bg-muted/30 flex flex-col">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-lg">관리자</h2>
                </div>
                <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <Button
                                key={tab.path}
                                variant={isActive(tab) ? 'secondary' : 'ghost'}
                                className="w-full justify-start gap-2"
                                size="sm"
                                onClick={() => navigate(tab.path)}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </Button>
                        );
                    })}
                </nav>
            </div>

            {/* 메인 콘텐츠 */}
            <div className="flex-1 overflow-y-auto p-6">
                <Outlet />
            </div>
        </div>
    );
}
