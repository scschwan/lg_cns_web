import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';

function NotFoundPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="text-center max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                        <FileQuestion className="h-10 w-10 text-gray-400" />
                    </div>
                </div>
                <h1 className="text-6xl font-bold text-gray-300 mb-2">404</h1>
                <h2 className="text-xl font-semibold text-gray-700 mb-2">페이지를 찾을 수 없습니다</h2>
                <p className="text-gray-500 mb-8">
                    요청하신 페이지가 존재하지 않거나, 이동되었거나, 삭제되었을 수 있습니다.
                </p>
                <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        뒤로 가기
                    </Button>
                    <Button onClick={() => navigate('/projects')}>
                        <Home className="h-4 w-4 mr-2" />
                        프로젝트 목록
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default NotFoundPage;
