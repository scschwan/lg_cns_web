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
    UPDATE_USER_INFO: { label: '정보 수정', color: 'bg-blue-500' },
    RESET_USER_PASSWORD: { label: '비밀번호 초기화', color: 'bg-purple-500' },
    CHANGE_PASSWORD: { label: '비밀번호 변경', color: 'bg-blue-500' },
    CHANGE_ROLE: { label: '역할 변경', color: 'bg-purple-500' },
    ADD_MEMBER: { label: '멤버 추가', color: 'bg-green-500' },
    REMOVE_MEMBER: { label: '멤버 제거', color: 'bg-red-500' },
    RESET_SESSION: { label: '세션 초기화', color: 'bg-orange-500' },
    DELETE_S3: { label: 'S3 삭제', color: 'bg-red-500' },
    PAGE_VIEW: { label: '페이지 조회', color: 'bg-gray-400' },
    BUTTON_CLICK: { label: '버튼 클릭', color: 'bg-indigo-400' },
    SESSION_CREATE: { label: '세션 생성', color: 'bg-green-400' },
    SESSION_DELETE: { label: '세션 삭제', color: 'bg-red-400' },
    SESSION_MERGE: { label: '세션 병합', color: 'bg-teal-500' },
    FILE_UPLOAD: { label: '파일 업로드', color: 'bg-cyan-500' },
    FILE_DELETE: { label: '파일 삭제', color: 'bg-red-400' },
    ANALYSIS_START: { label: '분석 시작', color: 'bg-blue-600' },
    EXPORT: { label: '내보내기', color: 'bg-emerald-500' },
};

function toKSTString(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

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
            setLogs(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error('감사 로그 로딩 실패:', e);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    const getActionBadge = (action) => {
        const info = ACTION_LABELS[action] || { label: action, color: 'bg-gray-500' };
        return <Badge className={`${info.color} text-white`}>{info.label}</Badge>;
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
                        <SelectItem value="PAGE">페이지</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead className="w-44">일시 (KST)</TableHead>
                                    <TableHead className="w-28">사용자</TableHead>
                                    <TableHead className="w-32">액션</TableHead>
                                    <TableHead>대상</TableHead>
                                    <TableHead>상세</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map(log => (
                                    <TableRow key={log.id} className={log.userId && !log.adminId ? 'bg-blue-50/50' : ''}>
                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                            {toKSTString(log.createdAt)}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {log.userName || (log.adminId ? 'Admin' : '-')}
                                        </TableCell>
                                        <TableCell>{getActionBadge(log.action)}</TableCell>
                                        <TableCell>
                                            <span className="text-xs font-mono">
                                                {log.targetType}{log.targetId ? `/${log.targetId.substring(0, 8)}` : ''}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm">{log.detail}</TableCell>
                                    </TableRow>
                                ))}
                                {logs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
