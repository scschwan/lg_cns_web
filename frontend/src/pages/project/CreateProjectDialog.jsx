import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export default function CreateProjectDialog({ open, onClose, onCreate }) {
    const [formData, setFormData] = useState({
        name: '',
        description: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.name.trim()) {
            setError('프로젝트 이름을 입력해주세요.');
            return;
        }

        setLoading(true);

        try {
            await onCreate(formData);
            setFormData({ name: '', description: '' });
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || '프로젝트 생성에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setFormData({ name: '', description: '' });
            setError('');
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>새 프로젝트 만들기</DialogTitle>
                    <DialogDescription>
                        프로젝트 정보를 입력하고 생성하세요
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="project-name">
                            프로젝트 이름 <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="project-name"
                            name="name"
                            placeholder="예: 2025년 재무 데이터 분석"
                            value={formData.name}
                            onChange={handleChange}
                            disabled={loading}
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="project-description">
                            설명 (선택)
                        </Label>
                        <textarea
                            id="project-description"
                            name="description"
                            placeholder="프로젝트에 대한 간단한 설명을 입력하세요"
                            value={formData.description}
                            onChange={handleChange}
                            disabled={loading}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            취소
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    생성 중...
                                </>
                            ) : (
                                '프로젝트 생성'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}