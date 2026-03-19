/**
 * S3 파일 관리 페이지 컴포넌트 (관리자 전용)
 *
 * AWS S3에 저장된 파일 목록을 조회하고, 세션에 연결되지 않은
 * 미사용(orphaned) 파일을 식별하여 선택 삭제 또는 일괄 정리할 수 있다.
 *
 * @component
 */
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Trash2, RefreshCw } from 'lucide-react';
import adminService from '@/services/adminService';

/** 바이트 단위의 파일 크기를 사람이 읽기 쉬운 형태(KB, MB, GB)로 변환 */
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function S3Management() {
    const [files, setFiles] = useState([]);
    const [orphanedFiles, setOrphanedFiles] = useState([]);
    const [tab, setTab] = useState('all'); // all | orphaned
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cleanupConfirm, setCleanupConfirm] = useState(false);

    useEffect(() => { loadFiles(); }, []);

    const loadFiles = async () => {
        setLoading(true);
        try {
            const [allRes, orphanRes] = await Promise.all([
                adminService.getS3Files(),
                adminService.getOrphanedFiles(),
            ]);
            setFiles(Array.isArray(allRes.data) ? allRes.data : []);
            setOrphanedFiles(Array.isArray(orphanRes.data) ? orphanRes.data : []);
        } catch (e) {
            console.error('S3 파일 로딩 실패:', e);
            setFiles([]);
            setOrphanedFiles([]);
        } finally {
            setLoading(false);
        }
    };

    const displayFiles = tab === 'orphaned' ? orphanedFiles : files;
    const orphanedKeys = new Set(orphanedFiles.map(f => f.key));

    const handleDeleteSelected = async () => {
        if (selected.length === 0) return;
        try {
            await adminService.deleteS3Files(selected);
            setSelected([]);
            loadFiles();
        } catch (e) {
            console.error('삭제 실패:', e);
        }
    };

    const handleCleanup = async () => {
        try {
            const res = await adminService.cleanupOrphaned();
            setCleanupConfirm(false);
            loadFiles();
            alert(`${res.data.deletedCount}개 파일 정리 완료`);
        } catch (e) {
            console.error('정리 실패:', e);
        }
    };

    const toggleSelect = (key) => {
        setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">S3 파일 관리</h1>

            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <Button variant={tab === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTab('all')}>
                        전체 ({files.length})
                    </Button>
                    <Button variant={tab === 'orphaned' ? 'default' : 'outline'} size="sm" onClick={() => setTab('orphaned')}>
                        미사용 파일 ({orphanedFiles.length})
                    </Button>
                </div>
                <div className="flex gap-2">
                    {selected.length > 0 && (
                        <Button size="sm" variant="destructive" onClick={handleDeleteSelected}>
                            <Trash2 className="h-4 w-4 mr-1" /> 선택 삭제 ({selected.length})
                        </Button>
                    )}
                    {orphanedFiles.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setCleanupConfirm(true)}>
                            미사용 파일 일괄 정리
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={loadFiles} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead className="w-10">
                                        <Checkbox
                                            checked={selected.length === displayFiles.length && displayFiles.length > 0}
                                            onCheckedChange={(checked) => {
                                                setSelected(checked ? displayFiles.map(f => f.key) : []);
                                            }}
                                        />
                                    </TableHead>
                                    <TableHead>S3 Key</TableHead>
                                    <TableHead className="w-24 text-right">크기</TableHead>
                                    <TableHead className="w-32">수정일</TableHead>
                                    <TableHead className="w-20 text-center">상태</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {displayFiles.map(f => (
                                    <TableRow key={f.key}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selected.includes(f.key)}
                                                onCheckedChange={() => toggleSelect(f.key)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs truncate max-w-[400px]" title={f.key}>
                                            {f.key}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">{formatFileSize(f.size)}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {f.lastModified ? new Date(f.lastModified).toLocaleDateString() : '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {orphanedKeys.has(f.key) ? (
                                                <Badge variant="destructive">미사용</Badge>
                                            ) : (
                                                <Badge variant="outline">등록됨</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {displayFiles.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            파일이 없습니다
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={cleanupConfirm} onOpenChange={setCleanupConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>미사용 파일 일괄 정리</DialogTitle>
                        <DialogDescription>
                            세션에 연결되지 않은 {orphanedFiles.length}개의 파일을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCleanupConfirm(false)}>취소</Button>
                        <Button onClick={handleCleanup} className="bg-red-500 hover:bg-red-600 text-white">
                            정리
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
