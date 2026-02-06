import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';
import adminService from '@/services/adminService';

const ACTION_LABELS = {
    APPROVE_USER: { label: '사용자 승인', color: 'bg-green-500' },
    REVOKE_USER: { label: '승인 취소', color: 'bg-yellow-500' },
    DELETE_USER: { label: '사용자 삭제', color: 'bg-red-500' },
    CHANGE_PASSWORD: { label: '비밀번호 변경', color: 'bg-blue-500' },
    CHANGE_ROLE: { label: '역할 변경', color: 'bg-purple-500' },
    ADD_MEMBER: { label: '멤버 추가', color: 'bg-green-500' },
    REMOVE_MEMBER: { label: '멤버 제거', color: 'bg-red-500' },
    RESET_SESSION: { label: '세션 초기화', color: 'bg-orange-500' },
    DELETE_S3: { label: 'S3 삭제', color: 'bg-red-500' },
};

export default function AuditLogPage() {
    const [logs, setLogs] = useState([]);
    const [targetType, setTargetType] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadLogs(); }, [targetType]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const params = {};
            if (targetType) params.targetType = targetType;
            const res = await adminService.getLogs(params);
            setLogs(res.data);
        } catch (e) {
            console.error('감사 로그 로딩 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const getActionBadge = (action) => {
        const info = ACTION_LABELS[action] || { label: action, color: 'bg-gray-500' };
        return <Badge className={info.color}>{info.label}</Badge>;
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">감사 로그</h1>
                <Button size="sm" variant="ghost" onClick={loadLogs} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <div className="flex gap-2">
                <Select value={targetType} onValueChange={(val) => setTargetType(val === 'ALL' ? '' : val)}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="전체 대상" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">전체</SelectItem>
                        <SelectItem value="USER">사용자</SelectItem>
                        <SelectItem value="PROJECT">프로젝트</SelectItem>
                        <SelectItem value="SESSION">세션</SelectItem>
                        <SelectItem value="S3_FILE">S3 파일</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>일시</TableHead>
                                    <TableHead>액션</TableHead>
                                    <TableHead>대상</TableHead>
                                    <TableHead>상세</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                            {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
                                        </TableCell>
                                        <TableCell>{getActionBadge(log.action)}</TableCell>
                                        <TableCell>
                                            <span className="text-xs font-mono">
                                                {log.targetType}/{log.targetId?.substring(0, 8)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm">{log.detail}</TableCell>
                                    </TableRow>
                                ))}
                                {logs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                            로그가 없습니다
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
