/**
 * 로그인 페이지 컴포넌트
 *
 * 사용자 인증을 처리하는 페이지로, 이메일/비밀번호 입력 폼을 제공한다.
 * 로그인 성공 시 JWT 토큰을 저장하고 역할(ADMIN/USER)에 따라 적절한 페이지로 리다이렉트한다.
 *
 * @component
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import SessionExpiredToast from '../../components/SessionExpiredToast';

export default function LoginPage() {
    /** 이메일 입력값 */
    const [email, setEmail] = useState('');
    /** 비밀번호 입력값 */
    const [password, setPassword] = useState('');
    /** 로그인 실패 시 에러 메시지 */
    const [error, setError] = useState('');
    /** 로그인 API 호출 중 로딩 상태 */
    const [loading, setLoading] = useState(false);

    const { login, isAuthenticated, loading: authLoading, user } = useAuth();
    const navigate = useNavigate();

    // 이미 인증된 사용자는 자동으로 프로젝트 페이지로 리다이렉트
    useEffect(() => {
        if (!authLoading && isAuthenticated && user) {
            navigate(user.role === 'ADMIN' ? '/admin' : '/projects', { replace: true });
        }
    }, [authLoading, isAuthenticated, user, navigate]);

    /** 로그인 폼 제출 핸들러 - AuthContext의 login 함수를 호출하여 인증 처리 */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const data = await login({ email, password });
            navigate(data.role === 'ADMIN' ? '/admin' : '/projects');
        } catch (err) {
            setError(err.response?.data?.message || '로그인에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
            <SessionExpiredToast />
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-2xl font-bold">F</span>
                        </div>
                    </div>
                    <CardTitle className="text-3xl font-bold">Finance Tool</CardTitle>
                    <CardDescription className="text-base">
                        이메일과 비밀번호로 로그인하세요
                    </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">이메일</Label>
                            <Input
                                id="email"
                                type="text"
                                placeholder="이메일 또는 아이디"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">비밀번호</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>

                        <Button 
                            type="submit" 
                            className="w-full" 
                            disabled={loading}
                            size="lg"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    로그인 중...
                                </>
                            ) : (
                                '로그인'
                            )}
                        </Button>
                    </form>
                </CardContent>

                <CardFooter className="flex justify-center">
                    <p className="text-sm text-gray-600">
                        계정이 없으신가요?{' '}
                        <Link 
                            to="/register" 
                            className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
                        >
                            회원가입
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}