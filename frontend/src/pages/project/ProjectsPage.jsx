import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import projectService from '../../services/projectService';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
    Plus,
    Folder,
    Users,
    Calendar,
    Settings,
    FolderOpen,
    Loader2,
    TrendingDown,
    BarChart3,
} from 'lucide-react';
import CreateProjectDialog from './CreateProjectDialog';

export default function ProjectsPage() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [creatingDashboard, setCreatingDashboard] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            setLoading(true);
            const data = await projectService.getMyProjects();
            setProjects(Array.isArray(data) ? data : []);
            setError('');
        } catch (err) {
            setError('프로젝트 목록을 불러오는데 실패했습니다.');
            setProjects([]);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateDashboardProject = async () => {
        const name = window.prompt('대시보드 프로젝트 이름을 입력하세요:');
        if (!name || !name.trim()) return;

        setCreatingDashboard(true);
        try {
            const project = await projectService.createProject({
                name: name.trim(),
                description: '대시보드 전용 프로젝트',
                projectType: 'DASHBOARD',
            });
            navigate(`/projects/${project.projectId}/upload`);
        } catch (err) {
            console.error('대시보드 프로젝트 생성 실패:', err);
            setError(err?.response?.data?.message || '프로젝트 생성에 실패했습니다.');
            setCreatingDashboard(false);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const isDashboardProject = (project) => project.projectType === 'DASHBOARD';

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="container mx-auto px-6 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">내 프로젝트</h1>
                            <p className="text-gray-600 mt-1">
                                프로젝트를 관리하고 데이터를 분석하세요
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={handleCreateDashboardProject}
                                size="lg"
                                className="gap-2"
                                disabled={creatingDashboard}
                            >
                                {creatingDashboard ? <Loader2 className="h-5 w-5 animate-spin" /> : <BarChart3 className="h-5 w-5" />}
                                대시보드 프로젝트
                            </Button>
                            <Button
                                onClick={() => setOpenDialog(true)}
                                size="lg"
                                className="gap-2"
                            >
                                <Plus className="h-5 w-5" />
                                새 프로젝트
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto px-6 py-8">
                {error && (
                    <Alert variant="destructive" className="mb-6">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        <span className="ml-3 text-gray-600">로딩 중...</span>
                    </div>
                ) : projects.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-16">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <Folder className="h-10 w-10 text-gray-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                아직 프로젝트가 없습니다
                            </h3>
                            <p className="text-gray-600 mb-6 text-center max-w-md">
                                일반 프로젝트를 생성하여 데이터 분석 파이프라인을 시작하거나,
                                대시보드 프로젝트로 클러스터링된 엑셀 데이터를 바로 활용하세요.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={handleCreateDashboardProject}
                                    size="lg"
                                    className="gap-2"
                                    disabled={creatingDashboard}
                                >
                                    <BarChart3 className="h-5 w-5" />
                                    대시보드 프로젝트
                                </Button>
                                <Button
                                    onClick={() => setOpenDialog(true)}
                                    size="lg"
                                    className="gap-2"
                                >
                                    <Plus className="h-5 w-5" />
                                    일반 프로젝트
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(Array.isArray(projects) ? projects : []).map((project) => (
                            <Card
                                key={project.projectId}
                                className="hover:shadow-lg transition-shadow cursor-pointer group"
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">
                                                    {project.name}
                                                </CardTitle>
                                                {isDashboardProject(project) && (
                                                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">대시보드</Badge>
                                                )}
                                            </div>
                                            <CardDescription className="mt-2 line-clamp-2">
                                                {project.description || '설명 없음'}
                                            </CardDescription>
                                        </div>
                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ml-3 ${isDashboardProject(project) ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                                            {isDashboardProject(project)
                                                ? <BarChart3 className="h-6 w-6 text-emerald-600" />
                                                : <FolderOpen className="h-6 w-6 text-blue-600" />
                                            }
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-3 min-h-[120px]">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Calendar className="h-4 w-4" />
                                        <span>{formatDate(project.createdAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Users className="h-4 w-4" />
                                        <span>멤버 {project.memberCount || 1}명</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!isDashboardProject(project) && (
                                            <Badge variant="outline">
                                                세션: {project.completedSessions || 0}/{project.totalSessions || 0}
                                            </Badge>
                                        )}
                                        {isDashboardProject(project) ? (
                                            <Badge className="bg-emerald-500 text-white">대시보드</Badge>
                                        ) : project.isCompleted ? (
                                            <Badge className="bg-sky-500 text-white">프로젝트 완료</Badge>
                                        ) : project.completedSessions > 0 ? (
                                            <Badge variant="secondary">활성</Badge>
                                        ) : null}
                                    </div>
                                </CardContent>

                                <CardFooter className="flex gap-2">
                                    <Button
                                        className={`flex-1 gap-1 ${isDashboardProject(project) ? '' : ''}`}
                                        onClick={() => navigate(`/projects/${project.projectId}/upload`)}
                                    >
                                        {isDashboardProject(project) ? <BarChart3 className="h-4 w-4" /> : null}
                                        열기
                                    </Button>
                                    {isDashboardProject(project) ? (
                                        <Button
                                            variant="secondary"
                                            className="flex-1 gap-1"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/projects/${project.projectId}/longlist`);
                                            }}
                                        >
                                            <TrendingDown className="h-4 w-4" />
                                            대시보드
                                        </Button>
                                    ) : project.isCompleted ? (
                                        <Button
                                            variant="secondary"
                                            className="flex-1 gap-1"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/projects/${project.projectId}/longlist`);
                                            }}
                                        >
                                            <TrendingDown className="h-4 w-4" />
                                            비용 절감 수행
                                        </Button>
                                    ) : null}
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/projects/${project.projectId}/settings`);
                                        }}
                                    >
                                        <Settings className="h-4 w-4" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <CreateProjectDialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                onSuccess={async (projectData) => {
                    const createdProject = await projectService.createProject(projectData);
                    await loadProjects();
                    return createdProject;
                }}
            />
        </div>
    );
}
