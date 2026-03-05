import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, FolderKanban, Monitor, Clock, ShieldAlert, ShieldCheck, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import adminService from '@/services/adminService';
import systemService from '@/services/systemService';

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [pendingUsers, setPendingUsers] = useState([]);
    const navigate = useNavigate();

    // 서비스 차단 상태
    const [maintenanceStatus, setMaintenanceStatus] = useState(null);
    const [maintenanceLoading, setMaintenanceLoading] = useState(false);
    const [maintenanceReason, setMaintenanceReason] = useState('');
    const [statusLoading, setStatusLoading] = useState(true);
    const [resetLambdaLoading, setResetLambdaLoading] = useState(false);

    useEffect(() => {
        loadData();
        loadMaintenanceStatus();
    }, []);

    const loadData = async () => {
        try {
            const [statsRes, usersRes] = await Promise.all([
                adminService.getStats(),
                adminService.getUsers(),
            ]);
            setStats(statsRes.data);
            const usersData = Array.isArray(usersRes.data) ? usersRes.data : [];
            setPendingUsers(usersData.filter(u => !u.isApproved && u.role !== 'ADMIN'));
        } catch (e) {
            console.error('대시보드 로딩 실패:', e);
            setPendingUsers([]);
        }
    };

    const loadMaintenanceStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const data = await systemService.getMaintenanceStatus();
            setMaintenanceStatus(data);
        } catch (e) {
            console.error('유지보수 상태 조회 실패:', e);
        } finally {
            setStatusLoading(false);
        }
    }, []);

    const handleQuickApprove = async (userId) => {
        try {
            await adminService.approveUser(userId);
            loadData();
        } catch (e) {
            console.error('승인 실패:', e);
        }
    };

    const handleToggleMaintenance = async () => {
        const currentEnabled = maintenanceStatus?.isMaintenance ?? false;
        const newEnabled = !currentEnabled;

        setMaintenanceLoading(true);
        try {
            const reason = newEnabled ? (maintenanceReason.trim() || '관리자 점검') : '';
            await adminService.setMaintenanceMode(newEnabled, reason);
            await loadMaintenanceStatus();
            if (!newEnabled) setMaintenanceReason('');
        } catch (e) {
            console.error('유지보수 모드 설정 실패:', e);
            alert('서비스 차단 설정에 실패했습니다: ' + (e?.response?.data?.message || e.message));
        } finally {
            setMaintenanceLoading(false);
        }
    };

    const isMaintenance = maintenanceStatus?.isMaintenance ?? false;
    const isLambdaRunning = maintenanceStatus?.isLambdaRunning ?? false;
    const lambdaProgress = maintenanceStatus?.lambdaProgress ?? 0;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">대시보드</h1>

            {/* 서비스 차단 제어 카드 */}
            <Card className={`border-2 ${isMaintenance ? 'border-red-400 bg-red-50' : isLambdaRunning ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50'}`}>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            {isMaintenance ? (
                                <ShieldAlert className="h-5 w-5 text-red-500" />
                            ) : (
                                <ShieldCheck className="h-5 w-5 text-green-500" />
                            )}
                            서비스 차단 제어
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMaintenanceStatus}
                            disabled={statusLoading}
                        >
                            {statusLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4" />
                            )}
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* 현재 상태 표시 */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground">현재 상태:</span>
                        {statusLoading ? (
                            <Badge variant="outline">조회 중...</Badge>
                        ) : isMaintenance ? (
                            <Badge variant="destructive">서비스 차단 중</Badge>
                        ) : isLambdaRunning ? (
                            <Badge className="bg-amber-500 text-white">Lambda 처리 중 (자동 차단)</Badge>
                        ) : (
                            <Badge className="bg-green-500 text-white">서비스 정상</Badge>
                        )}
                    </div>

                    {/* Lambda 진행률 */}
                    {isLambdaRunning && (
                        <div>
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>Lambda 파일 처리 중...</span>
                                <span>{lambdaProgress}%</span>
                            </div>
                            <div className="w-full h-2 bg-amber-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-amber-500 rounded-full transition-all"
                                    style={{ width: `${lambdaProgress}%` }}
                                />
                            </div>
                            <p className="text-xs text-amber-600 mt-1">
                                Lambda 작업이 완료되면 자동으로 서비스가 재개됩니다.
                            </p>
                        </div>
                    )}

                    {/* 차단 이유 */}
                    {isMaintenance && maintenanceStatus?.reason && (
                        <div className="text-sm text-red-700">
                            <span className="font-medium">차단 이유:</span> {maintenanceStatus.reason}
                        </div>
                    )}

                    {/* 수동 차단 제어 */}
                    <div className="border-t pt-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            수동으로 서비스 차단을 제어합니다. Lambda 작업 중에는 자동으로 차단됩니다.
                        </p>
                        {!isMaintenance && (
                            <Input
                                placeholder="차단 이유 입력 (선택사항)"
                                value={maintenanceReason}
                                onChange={(e) => setMaintenanceReason(e.target.value)}
                                className="text-sm"
                                disabled={isLambdaRunning}
                            />
                        )}
                        <Button
                            onClick={handleToggleMaintenance}
                            disabled={maintenanceLoading || isLambdaRunning}
                            variant={isMaintenance ? 'outline' : 'destructive'}
                            className={isMaintenance ? 'border-green-500 text-green-700 hover:bg-green-50' : ''}
                        >
                            {maintenanceLoading ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : isMaintenance ? (
                                <ShieldCheck className="h-4 w-4 mr-2" />
                            ) : (
                                <ShieldAlert className="h-4 w-4 mr-2" />
                            )}
                            {isMaintenance ? '서비스 차단 해제' : '서비스 차단 활성화'}
                        </Button>
                        {isLambdaRunning && (
                            <>
                                <p className="text-xs text-amber-600">Lambda 처리 중에는 수동 제어가 불가합니다.</p>
                                <Button
                                    onClick={async () => {
                                        if (!confirm('Lambda 상태를 강제 초기화하시겠습니까?\n\n실제 Lambda 작업이 진행 중인 경우 데이터 정합성 문제가 발생할 수 있습니다.')) return;
                                        setResetLambdaLoading(true);
                                        try {
                                            await adminService.resetLambdaStatus();
                                            await loadMaintenanceStatus();
                                            alert('Lambda 상태가 초기화되었습니다.');
                                        } catch (e) {
                                            alert('Lambda 상태 초기화 실패: ' + (e?.response?.data?.message || e.message));
                                        } finally {
                                            setResetLambdaLoading(false);
                                        }
                                    }}
                                    disabled={resetLambdaLoading}
                                    variant="outline"
                                    className="border-red-400 text-red-600 hover:bg-red-50"
                                >
                                    {resetLambdaLoading ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                    )}
                                    Lambda 상태 강제 초기화
                                </Button>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>

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
