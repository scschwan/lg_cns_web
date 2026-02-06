import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Users, Trash2, Plus } from 'lucide-react';
import adminService from '@/services/adminService';

export default function ProjectManagement() {
    const [projects, setProjects] = useState([]);
    const [detail, setDetail] = useState(null);
    const [addMemberOpen, setAddMemberOpen] = useState(false);
    const [newMember, setNewMember] = useState({ userId: '', role: 'VIEWER' });
    const [allUsers, setAllUsers] = useState([]);

    useEffect(() => { loadProjects(); }, []);

    const loadProjects = async () => {
        try {
            const res = await adminService.getProjects();
            setProjects(res.data);
        } catch (e) {
            console.error('프로젝트 로딩 실패:', e);
        }
    };

    const openDetail = async (projectId) => {
        try {
            const [projRes, usersRes] = await Promise.all([
                adminService.getProjectDetail(projectId),
                adminService.getUsers(),
            ]);
            setDetail(projRes.data);
            setAllUsers(usersRes.data);
        } catch (e) {
            console.error('프로젝트 상세 로딩 실패:', e);
        }
    };

    const handleRoleChange = async (userId, role) => {
        if (!detail) return;
        try {
            await adminService.updateMemberRole(detail.projectId, userId, role);
            openDetail(detail.projectId);
        } catch (e) {
            console.error('역할 변경 실패:', e);
        }
    };

    const handleRemoveMember = async (userId) => {
        if (!detail) return;
        try {
            await adminService.removeProjectMember(detail.projectId, userId);
            openDetail(detail.projectId);
        } catch (e) {
            console.error('멤버 제거 실패:', e);
        }
    };

    const handleAddMember = async () => {
        if (!detail || !newMember.userId) return;
        try {
            await adminService.addProjectMember(detail.projectId, newMember.userId, newMember.role);
            setAddMemberOpen(false);
            setNewMember({ userId: '', role: 'VIEWER' });
            openDetail(detail.projectId);
        } catch (e) {
            alert(e.response?.data?.message || '멤버 추가 실패');
        }
    };

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">프로젝트 관리</h1>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>프로젝트명</TableHead>
                                <TableHead>소유자</TableHead>
                                <TableHead className="text-center">멤버수</TableHead>
                                <TableHead className="text-center">세션수</TableHead>
                                <TableHead>생성일</TableHead>
                                <TableHead className="text-center">액션</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projects.map(p => (
                                <TableRow key={p.projectId}>
                                    <TableCell className="font-medium">{p.projectName}</TableCell>
                                    <TableCell>{p.ownerName}</TableCell>
                                    <TableCell className="text-center">{p.memberCount}</TableCell>
                                    <TableCell className="text-center">{p.totalSessions || 0}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button size="sm" variant="outline" onClick={() => openDetail(p.projectId)}>
                                            <Users className="h-4 w-4 mr-1" />
                                            멤버 관리
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {projects.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        프로젝트가 없습니다
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* 멤버 관리 다이얼로그 */}
            <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{detail?.projectName} - 멤버 관리</DialogTitle>
                    </DialogHeader>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>이름</TableHead>
                                <TableHead>이메일</TableHead>
                                <TableHead>역할</TableHead>
                                <TableHead className="text-center">액션</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {detail?.members?.map(m => (
                                <TableRow key={m.userId}>
                                    <TableCell>{m.name}</TableCell>
                                    <TableCell>{m.email}</TableCell>
                                    <TableCell>
                                        <Select
                                            value={m.role}
                                            onValueChange={(val) => handleRoleChange(m.userId, val)}
                                        >
                                            <SelectTrigger className="w-28 h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="OWNER">소유자</SelectItem>
                                                <SelectItem value="EDITOR">편집자</SelectItem>
                                                <SelectItem value="VIEWER">뷰어</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button size="icon" variant="ghost" onClick={() => handleRemoveMember(m.userId)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddMemberOpen(true)}>
                            <Plus className="h-4 w-4 mr-1" /> 멤버 추가
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 멤버 추가 다이얼로그 */}
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>멤버 추가</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Select
                            value={newMember.userId}
                            onValueChange={(val) => setNewMember(prev => ({ ...prev, userId: val }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="사용자 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                {allUsers.filter(u => u.isApproved && !detail?.members?.find(m => m.userId === u.id))
                                    .map(u => (
                                        <SelectItem key={u.id} value={u.id}>
                                            {u.name} ({u.email})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={newMember.role}
                            onValueChange={(val) => setNewMember(prev => ({ ...prev, role: val }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="OWNER">소유자</SelectItem>
                                <SelectItem value="EDITOR">편집자</SelectItem>
                                <SelectItem value="VIEWER">뷰어</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddMemberOpen(false)}>취소</Button>
                        <Button onClick={handleAddMember} disabled={!newMember.userId}>추가</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
