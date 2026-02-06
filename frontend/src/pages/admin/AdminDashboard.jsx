import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, FolderKanban, Monitor, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import adminService from '@/services/adminService';

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [pendingUsers, setPendingUsers] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [statsRes, usersRes] = await Promise.all([
                adminService.getStats(),
                adminService.getUsers(),
            ]);
            setStats(statsRes.data);
            setPendingUsers(usersRes.data.filter(u => !u.isApproved && u.role !== 'ADMIN'));
        } catch (e) {
            console.error('대시보드 로딩 실패:', e);
        }
    };

    const handleQuickApprove = async (userId) => {
        try {
            await adminService.approveUser(userId);
            loadData();
        } catch (e) {
            console.error('승인 실패:', e);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">대시보드</h1>

            {/* 통계 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Users className="h-8 w-8 text-blue-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">전체 사용자</p>
                                <p className="text-2xl font-bold">{stats?.totalUsers ?? '-'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Clock className="h-8 w-8 text-yellow-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">승인 대기</p>
                                <p className="text-2xl font-bold">{stats?.pendingUsers ?? '-'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <FolderKanban className="h-8 w-8 text-green-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">프로젝트</p>
                                <p className="text-2xl font-bold">{stats?.totalProjects ?? '-'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <Monitor className="h-8 w-8 text-purple-500" />
                            <div>
                                <p className="text-sm text-muted-foreground">전체 세션</p>
                                <p className="text-2xl font-bold">{stats?.totalSessions ?? '-'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 승인 대기 사용자 */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        승인 대기 사용자
                        {pendingUsers.length > 0 && (
                            <Badge variant="destructive">{pendingUsers.length}</Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {pendingUsers.length === 0 ? (
                        <p className="text-muted-foreground text-sm">승인 대기 중인 사용자가 없습니다.</p>
                    ) : (
                        <div className="space-y-2">
                            {pendingUsers.slice(0, 10).map(user => (
                                <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div>
                                        <span className="font-medium">{user.name}</span>
                                        <span className="text-muted-foreground ml-2 text-sm">{user.email}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleQuickApprove(user.id)}>
                                            승인
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => navigate('/admin/users')}>
                                            상세
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
