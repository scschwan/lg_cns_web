import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Save,
  Trash2,
  UserPlus,
  Upload,
  Loader2,
  FileText,
  Users,
  Settings,
  AlertCircle,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';

import projectService from '../../services/projectService';
import uploadService from '../../services/uploadService';

const ProjectSettingsPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  // State
  const [project, setProject] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [members, setMembers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Dialog State
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('VIEWER');

  // Upload State
  const [uploadProgressOpen, setUploadProgressOpen] = useState(false);
  const [uploadProgressValue, setUploadProgressValue] = useState(0);
  const [uploadProgressMessage, setUploadProgressMessage] = useState('');

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      setError(null);

      const projectData = await projectService.getProject(projectId);
      setProject(projectData);
      setProjectName(projectData.projectName);
      setProjectDescription(projectData.description || '');

      await Promise.all([loadProjectFiles(), loadProjectMembers()]);
    } catch (err) {
      console.error('프로젝트 정보 로드 실패:', err);
      setError('프로젝트 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadProjectFiles = async () => {
    try {
      setFilesLoading(true);
      const filesData = await projectService.getProjectFiles(projectId);
      setFiles(filesData);
    } catch (err) {
      console.error('파일 목록 로드 실패:', err);
    } finally {
      setFilesLoading(false);
    }
  };

  const loadProjectMembers = async () => {
    try {
      const membersData = await projectService.getProjectMembers(projectId);
      setMembers(membersData);
    } catch (err) {
      console.error('멤버 목록 로드 실패:', err);
      setMembers([]);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage('');

      await projectService.updateProject(projectId, {
        name: projectName,
        description: projectDescription
      });

      setSuccessMessage('프로젝트 정보가 저장되었습니다.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('프로젝트 저장 실패:', err);
      setError('프로젝트 정보 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm(
      '프로젝트를 삭제하시겠습니까?\n\n' +
      '⚠️ 경고:\n' +
      '- 프로젝트에 포함된 모든 파일이 삭제됩니다.\n' +
      '- 이 작업은 되돌릴 수 없습니다.\n\n' +
      '계속하시겠습니까?'
    )) return;

    try {
      await projectService.deleteProject(projectId);
      alert('프로젝트가 삭제되었습니다.');
      navigate('/projects');
    } catch (err) {
      console.error('프로젝트 삭제 실패:', err);
      setError('프로젝트 삭제에 실패했습니다.');
    }
  };

  const handleInviteMember = async () => {



    try {

      // role 값이 "EDITOR" (대문자)여야 안전합니다.
      // 만약 "Editor"나 "editor"로 보내고 있다면 위의 application.yml 설정이 필수입니다.
      if (!inviteEmail || !inviteRole) {
          alert("이메일과 역할을 모두 입력해주세요.");
          return;
      }

      console.log("Sending Invite:", { inviteEmail, inviteRole }); // 로그 확인

      // ✅ 수정: inviteEmail과 inviteRole 두 개의 인자를 모두 전달
      await projectService.inviteMember(projectId, inviteEmail, inviteRole);

      // 성공 처리
      setInviteEmail("");
      setInviteRole("VIEWER");
      await loadProjectMembers();
      setSuccessMessage('멤버 초대가 완료되었습니다.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('멤버 초대 실패:', err);
      setError('멤버 초대에 실패했습니다.');
    }
  };

  const handleDeleteMember = async (memberId) => {
    if (!window.confirm('정말로 이 멤버를 삭제하시겠습니까?')) return;

    try {
      await projectService.removeMember(projectId, memberId);
      await loadProjectMembers();
      setSuccessMessage('멤버가 삭제되었습니다.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('멤버 삭제 실패:', err);
      setError('멤버 삭제에 실패했습니다.');
    }
  };

  const handleRoleChange = async (memberId, newRole) => {
    try {
      await projectService.updateMemberRole(projectId, memberId, newRole);
      await loadProjectMembers();
      setSuccessMessage('역할이 변경되었습니다.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('역할 변경 실패:', err);
      setError('역할 변경에 실패했습니다.');
    }
  };

  const handleFileUpload = async (event) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const selectedFiles = Array.from(event.target.files);
    const excelFiles = selectedFiles.filter(
      (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );

    if (excelFiles.length === 0) {
      setError('Excel 파일(.xlsx, .xls)만 업로드할 수 있습니다.');
      return;
    }

    setUploadProgressOpen(true);
    setUploadProgressValue(0);
    setUploadProgressMessage('파일 업로드 시작...');

    try {
      for (let i = 0; i < excelFiles.length; i++) {
        const file = excelFiles[i];

        setUploadProgressValue(((i + 1) / excelFiles.length) * 80);
        setUploadProgressMessage(`파일 처리 중... (${i + 1}/${excelFiles.length})`);

        const { presignedUrl, uploadId, sessionId, s3Key } =
          await uploadService.getPresignedUrl(projectId, file.name, file.size);

        await uploadService.uploadToS3(presignedUrl, file);

        await uploadService.completeFileUpload(projectId, {
          uploadId,
          sessionId,
          fileName: file.name,
          fileSize: file.size,
          s3Key,
        });
      }

      setUploadProgressValue(100);
      setUploadProgressMessage('완료');
      setTimeout(() => setUploadProgressOpen(false), 500);

      setSuccessMessage(`${excelFiles.length}개의 파일이 업로드되었습니다.`);
      setTimeout(() => setSuccessMessage(''), 3000);
      loadProjectFiles();
    } catch (err) {
      console.error('파일 업로드 실패:', err);
      setError('파일 업로드 중 오류가 발생했습니다.');
      setUploadProgressOpen(false);
    }

    // input 초기화
    event.target.value = '';
  };

  const handleDeleteFile = async (fileId, fileName) => {
    if (!window.confirm(`"${fileName}" 파일을 삭제하시겠습니까?`)) return;

    try {
      await uploadService.deleteFile(projectId, fileId);
      setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
      setSuccessMessage('파일이 삭제되었습니다.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('파일 삭제 실패:', err);
      setError('파일 삭제에 실패했습니다.');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'OWNER': return 'default';
      case 'EDITOR': return 'secondary';
      case 'VIEWER': return 'outline';
      default: return 'outline';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'OWNER': return '소유자';
      case 'EDITOR': return '편집자';
      case 'VIEWER': return '뷰어';
      default: return role;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              onClick={() => navigate('/projects')}
              className="cursor-pointer flex items-center gap-1"
            >
              <FolderOpen className="w-4 h-4" />
              프로젝트 목록
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project?.projectName}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>설정</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/projects')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            뒤로가기
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-8 h-8" />
            프로젝트 설정
          </h1>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="animate-in fade-in slide-in-from-top-2 border-green-500 text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
          <TabsTrigger value="info" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            기본 정보
          </TabsTrigger>
          <TabsTrigger value="files" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            업로드된 파일
            <Badge variant="secondary" className="ml-1">{files.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            프로젝트 멤버
            <Badge variant="secondary" className="ml-1">{members.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 기본 정보 */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
              <CardDescription>
                프로젝트의 이름과 설명을 수정할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">프로젝트 이름</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="프로젝트 이름을 입력하세요"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectDescription">프로젝트 설명</Label>
                <Textarea
                  id="projectDescription"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="프로젝트 설명을 입력하세요 (선택사항)"
                  rows={4}
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="destructive"
                  onClick={handleDeleteProject}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  프로젝트 삭제
                </Button>

                <Button
                  onClick={handleSave}
                  disabled={saving || !projectName.trim()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      저장
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: 업로드된 파일 */}
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    업로드된 파일
                    <Badge variant="secondary">{files.length}개</Badge>
                  </CardTitle>
                  <CardDescription>
                    프로젝트에 업로드된 Excel 파일 목록입니다.
                  </CardDescription>
                </div>
                <Button asChild>
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    파일 업로드
                    <input
                      type="file"
                      hidden
                      multiple
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                    />
                  </label>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">업로드된 파일이 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>파일명</TableHead>
                        <TableHead className="w-[100px]">크기</TableHead>
                        <TableHead className="w-[100px]">컬럼 수</TableHead>
                        <TableHead className="w-[150px]">계정명 컬럼</TableHead>
                        <TableHead className="w-[150px]">금액 컬럼</TableHead>
                        <TableHead className="w-[180px]">업로드 시간</TableHead>
                        <TableHead className="w-[80px]">삭제</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow key={file.fileId}>
                          <TableCell className="font-medium">
                            {file.fileName}
                          </TableCell>
                          <TableCell>
                            {formatFileSize(file.fileSize)}
                          </TableCell>
                          <TableCell className="text-center">
                            {file.detectedColumns?.length || 0}
                          </TableCell>
                          <TableCell>
                            {(file.uploadStatus === 'PROCESSING' || (!file.detectedColumns?.length && !file.rowCount)) ? (
                              <div className="flex items-center gap-2 text-sm text-amber-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>데이터 업로드 중</span>
                              </div>
                            ) : (
                              file.accountColumnName || '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {(file.uploadStatus === 'PROCESSING' || (!file.detectedColumns?.length && !file.rowCount)) ? (
                              <div className="flex items-center gap-2 text-sm text-amber-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>데이터 업로드 중</span>
                              </div>
                            ) : (
                              file.amountColumnName || '-'
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(file.uploadedAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteFile(file.fileId, file.fileName)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: 프로젝트 멤버 */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    프로젝트 멤버
                    <Badge variant="secondary">{members.length}명</Badge>
                  </CardTitle>
                  <CardDescription>
                    프로젝트에 참여 중인 멤버를 관리합니다.
                  </CardDescription>
                </div>
                <Button onClick={() => setInviteDialogOpen(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  멤버 초대
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>이메일</TableHead>
                      <TableHead className="w-[150px]">이름</TableHead>
                      <TableHead className="w-[150px]">역할</TableHead>
                      <TableHead className="w-[180px]">참여일</TableHead>
                      <TableHead className="w-[80px]">삭제</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell className="font-medium">
                          {member.email || '-'}
                        </TableCell>
                        <TableCell>{member.name || '-'}</TableCell>
                        <TableCell>
                          {member.role === 'OWNER' ? (
                            <Badge variant={getRoleBadgeVariant(member.role)}>
                              {getRoleLabel(member.role)}
                            </Badge>
                          ) : (
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                handleRoleChange(member.userId, value)
                              }
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="EDITOR">편집자</SelectItem>
                                <SelectItem value="VIEWER">뷰어</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(member.joinedAt)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMember(member.userId)}
                            disabled={member.role === 'OWNER'}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 업로드 진행 Dialog */}
      <Dialog open={uploadProgressOpen} onOpenChange={setUploadProgressOpen}>
        <DialogContent className="sm:max-w-[400px]" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>파일 업로드</DialogTitle>
            <DialogDescription>{uploadProgressMessage}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Progress value={uploadProgressValue} className="w-full" />
            <p className="text-sm text-muted-foreground text-center mt-2">
              {Math.round(uploadProgressValue)}%
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 멤버 초대 Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>멤버 초대</DialogTitle>
            <DialogDescription>
              새로운 멤버를 프로젝트에 초대합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inviteEmail">이메일</Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inviteRole">역할</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="inviteRole">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EDITOR">편집자</SelectItem>
                  <SelectItem value="VIEWER">뷰어</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteDialogOpen(false)}
            >
              취소
            </Button>
            <Button onClick={handleInviteMember}>
              <UserPlus className="w-4 h-4 mr-2" />
              초대
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectSettingsPage;