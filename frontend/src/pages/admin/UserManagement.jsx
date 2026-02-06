import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import adminService from '@/services/adminService';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [filter, setFilter] = useState('all'); // all | pending | approved
    const [selected, setSelected] = useState([]);
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => { loadUsers(); }, []);

    const loadUsers = async () => {
        try {
            const res = await adminService.getUsers();
            setUsers(res.data.filter(u => u.role !== 'ADMIN'));
        } catch (e) {
            console.error('사용자 목록 로딩 실패:', e);
        }
    };

    const filtered = users.filter(u => {
        if (filter === 'pending') return !u.isApproved;
        if (filter === 'approved') return u.isApproved;
        return true;
    });

    const handleApprove = async (userId) => {
        await adminService.approveUser(userId);
        loadUsers();
    };

    const handleRevoke = async (userId) => {
        await adminService.revokeUser(userId);
        loadUsers();
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await adminService.deleteUser(deleteTarget);
        setDeleteTarget(null);
        setSelected(prev => prev.filter(id => id !== deleteTarget));
        loadUsers();
    };

    const handleBulkApprove = async () => {
        if (selected.length === 0) return;
        await adminService.bulkApprove(selected);
        setSelected([]);
        loadUsers();
    };

    const handleBulkRevoke = async () => {
        if (selected.length === 0) return;
        await adminService.bulkRevoke(selected);
        setSelected([]);
        loadUsers();
    };

    const toggleSelect = (id) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleAll = (checked) => {
        setSelected(checked ? filtered.map(u => u.id) : []);
    };

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">사용자 관리</h1>

            {/* 필터 + 일괄 액션 */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    {[
                        { key: 'all', label: '전체' },
                        { key: 'pending', label: '승인대기' },
                        { key: 'approved', label: '승인됨' },
                    ].map(f => (
                        <Button
                            key={f.key}
                            variant={filter === f.key ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                            {f.key === 'pending' && users.filter(u => !u.isApproved).length > 0 && (
                                <Badge variant="destructive" className="ml-1">
                                    {users.filter(u => !u.isApproved).length}
                                </Badge>
                            )}
                        </Button>
                    ))}
                </div>
                {selected.length > 0 && (
                    <div className="flex gap-2">
                        <Button size="sm" onClick={handleBulkApprove}>
                            선택 승인 ({selected.length})
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleBulkRevoke}>
                            선택 취소 ({selected.length})
                        </Button>
                    </div>
                )}
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <Checkbox
                                        checked={selected.length === filtered.length && filtered.length > 0}
                                        onCheckedChange={toggleAll}
                                    />
                                </TableHead>
                                <TableHead>이메일</TableHead>
                                <TableHead>이름</TableHead>
                                <TableHead className="text-center">승인상태</TableHead>
                                <TableHead>가입일</TableHead>
                                <TableHead>최종로그인</TableHead>
                                <TableHead className="text-center">액션</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map(user => (
                                <TableRow key={user.id} className={!user.isApproved ? 'bg-yellow-50' : ''}>
                                    <TableCell>
                                        <Checkbox
                                            checked={selected.includes(user.id)}
                                            onCheckedChange={() => toggleSelect(user.id)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{user.email}</TableCell>
                                    <TableCell>{user.name}</TableCell>
                                    <TableCell className="text-center">
                                        {user.isApproved ? (
                                            <Badge className="bg-green-500">승인됨</Badge>
                                        ) : (
                                            <Badge variant="outline" className="border-yellow-500 text-yellow-700">대기중</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center gap-1">
                                            {!user.isApproved ? (
                                                <Button size="icon" variant="ghost" onClick={() => handleApprove(user.id)} title="승인">
                                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                </Button>
                                            ) : (
                                                <Button size="icon" variant="ghost" onClick={() => handleRevoke(user.id)} title="승인취소">
                                                    <XCircle className="h-4 w-4 text-yellow-600" />
                                                </Button>
                                            )}
                                            <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(user.id)} title="삭제">
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filtered.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        사용자가 없습니다
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>사용자 삭제</AlertDialogTitle>
                        <AlertDialogDescription>
                            이 사용자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
                            삭제
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
