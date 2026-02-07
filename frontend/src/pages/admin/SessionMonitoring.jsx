import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { RotateCcw, RefreshCw } from 'lucide-react';
import adminService from '@/services/adminService';

export default function SessionMonitoring() {
    const [sessions, setSessions] = useState([]);
    const [resetTarget, setResetTarget] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadSessions(); }, []);

    const loadSessions = async () => {
        setLoading(true);
        try {
            const res = await adminService.getSessions();
            setSessions(res.data);
        } catch (e) {
            console.error('세션 로딩 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (!resetTarget) return;
        try {
            await adminService.resetSession(resetTarget);
            setResetTarget(null);
            loadSessions();
        } catch (e) {
            console.error('세션 초기화 실패:', e);
        }
    };

    const getStepLabel = (step) => {
        if (!step) return '-';
        const map = {
            'UPLOAD': 'Step 1',
            'START_ANALYSIS': 'Step 2',
            'PREPROCESSING': 'Step 3',
            'DATA_TRANSFORM': 'Step 4',
            'CLUSTERING': 'Step 5',
            'EXPORT': 'Step 6',
            'DETAIL_CLUSTERING': 'Step 7',
        };
        return map[step] || step;
    };

    const getSessionStatus = (s) => {
        if (s.isCompleted) return '완료';
        if (s.progressPercentage > 0 || s.currentStep) return '진행중';
        return '시작전';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">세션 모니터링</h1>
                <Button size="sm" variant="ghost" onClick={loadSessions} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>세션명</TableHead>
                                    <TableHead>프로젝트 ID</TableHead>
                                    <TableHead className="text-center">현재 Step</TableHead>
                                    <TableHead className="text-center">진행률</TableHead>
                                    <TableHead className="text-center">완료</TableHead>
                                    <TableHead className="text-center">행수</TableHead>
                                    <TableHead>최종수정</TableHead>
                                    <TableHead className="text-center">액션</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sessions.map(s => {
                                    const status = getSessionStatus(s);
                                    return (
                                    <TableRow key={s.sessionId} className={
                                        status === '완료' ? 'bg-sky-50' : status === '진행중' ? 'bg-yellow-50' : ''
                                    }>
                                        <TableCell className="font-medium">{s.sessionName}</TableCell>
                                        <TableCell className="text-xs font-mono truncate max-w-[120px]">{s.projectId}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline">{getStepLabel(s.currentStep)}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">{s.progressPercentage || 0}%</TableCell>
                                        <TableCell className="text-center">
                                            {status === '완료' ? (
                                                <Badge className="bg-sky-500">완료</Badge>
                                            ) : status === '진행중' ? (
                                                <Badge variant="outline" className="border-yellow-500 text-yellow-700">진행중</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-muted-foreground">시작전</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {(s.totalRowCount || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setResetTarget(s.sessionId)}
                                            >
                                                <RotateCcw className="h-3 w-3 mr-1" />
                                                초기화
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                    );
                                })}
                                {sessions.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            세션이 없습니다
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>세션 초기화</DialogTitle>
                        <DialogDescription>
                            이 세션의 분석 데이터(session_data)를 모두 삭제하고 상태를 초기화합니다. 이 작업은 되돌릴 수 없습니다.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResetTarget(null)}>취소</Button>
                        <Button onClick={handleReset} className="bg-red-500 hover:bg-red-600 text-white">
                            초기화
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
