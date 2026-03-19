/**
 * 관리자 프로필 페이지 컴포넌트
 *
 * 관리자 비밀번호 변경 기능을 제공한다.
 * 현재 비밀번호 확인 후 새 비밀번호로 변경할 수 있다.
 *
 * @component
 */
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2 } from 'lucide-react';
import adminService from '@/services/adminService';

export default function AdminProfile() {
    const [form, setForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    /** 비밀번호 변경 폼 제출 핸들러 - 유효성 검증 후 adminService를 통해 변경 API 호출 */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        if (form.newPassword.length < 4) {
            setError('새 비밀번호는 최소 4자 이상이어야 합니다.');
            return;
        }
        if (form.newPassword !== form.confirmPassword) {
            setError('새 비밀번호가 일치하지 않습니다.');
            return;
        }

        setLoading(true);
        try {
            await adminService.changePassword(form.currentPassword, form.newPassword);
            setSuccess(true);
            setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (e) {
            setError(e.response?.data?.message || '비밀번호 변경에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 max-w-md">
            <h1 className="text-2xl font-bold">프로필</h1>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">비밀번호 변경</CardTitle>
                </CardHeader>
                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className="mb-4 bg-green-50 text-green-800 border-green-200">
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertDescription>비밀번호가 변경되었습니다.</AlertDescription>
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>현재 비밀번호</Label>
                            <Input
                                type="password"
                                value={form.currentPassword}
                                onChange={(e) => setForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>새 비밀번호</Label>
                            <Input
                                type="password"
                                value={form.newPassword}
                                onChange={(e) => setForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>새 비밀번호 확인</Label>
                            <Input
                                type="password"
                                value={form.confirmPassword}
                                onChange={(e) => setForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                required
                            />
                        </div>
                        <Button type="submit" disabled={loading} className="w-full">
                            {loading ? '처리 중...' : '비밀번호 변경'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
