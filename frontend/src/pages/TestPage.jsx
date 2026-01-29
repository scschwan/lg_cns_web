import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export default function TestPage() {
    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="container mx-auto max-w-4xl">
                <h1 className="text-4xl font-bold mb-2">shadcn/ui 컴포넌트 테스트</h1>
                <p className="text-gray-600 mb-8">모든 컴포넌트가 정상적으로 작동하는지 확인합니다.</p>

                {/* 섹션 1: Buttons */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Button 컴포넌트</CardTitle>
                        <CardDescription>다양한 버튼 스타일</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2 flex-wrap">
                            <Button>Default</Button>
                            <Button variant="secondary">Secondary</Button>
                            <Button variant="destructive">Destructive</Button>
                            <Button variant="outline">Outline</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="link">Link</Button>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Button size="sm">Small</Button>
                            <Button size="default">Default</Button>
                            <Button size="lg">Large</Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 섹션 2: Form */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Form 컴포넌트</CardTitle>
                        <CardDescription>Input과 Label을 사용한 폼</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">이메일</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="example@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">비밀번호</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">이름</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder="홍길동"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="outline">취소</Button>
                        <Button>제출</Button>
                    </CardFooter>
                </Card>

                {/* 섹션 3: Badges */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Badge 컴포넌트</CardTitle>
                        <CardDescription>상태 표시용 뱃지</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2 flex-wrap">
                            <Badge>Default</Badge>
                            <Badge variant="secondary">Secondary</Badge>
                            <Badge variant="destructive">Destructive</Badge>
                            <Badge variant="outline">Outline</Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* 섹션 4: 통합 예제 */}
                <Card>
                    <CardHeader>
                        <CardTitle>통합 예제</CardTitle>
                        <CardDescription>여러 컴포넌트를 조합한 실제 사용 예시</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">프로젝트 상태</p>
                                <p className="text-sm text-gray-500">현재 진행 중인 프로젝트</p>
                            </div>
                            <Badge variant="secondary">진행중</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">파일 업로드</p>
                                <p className="text-sm text-gray-500">5개 파일 처리 완료</p>
                            </div>
                            <Badge>완료</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">데이터 분석</p>
                                <p className="text-sm text-gray-500">클러스터링 진행중</p>
                            </div>
                            <Badge variant="outline">대기중</Badge>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full">상세 보기</Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}