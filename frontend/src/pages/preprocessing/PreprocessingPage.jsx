// frontend/src/pages/preprocessing/PreprocessingPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Plus, Trash2 } from 'lucide-react';

// shadcn/ui components
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';

// API 서비스 (추후 구현)
// import preprocessingAPI from '@/services/preprocessingAPI';

function PreprocessingPage() {
  const { projectId, sessionId } = useParams();
  const navigate = useNavigate();

  // ===== 상태 관리 =====
  const [sessionInfo] = useState({
    sessionName: '지급수수료_sample1_2025-10-11',
  });

  // 데이터
  const [targetData, setTargetData] = useState([]);
  const [resultData, setResultData] = useState([]);

  // 구분자 변환
  const [newSeparator, setNewSeparator] = useState('');
  const [separatorList, setSeparatorList] = useState([
    { id: 1, value: '_', checked: false },
    { id: 2, value: ' ', checked: false },
    { id: 3, value: ',', checked: false },
    { id: 4, value: '/', checked: false },
    { id: 5, value: '&', checked: false },
    { id: 6, value: '*', checked: false },
  ]);
  const [selectAllSeparator, setSelectAllSeparator] = useState(false);

  // 불용어 제거
  const [newStopword, setNewStopword] = useState('');
  const [stopwordList, setStopwordList] = useState([
    { id: 1, value: '12월', checked: false },
    { id: 2, value: '11월', checked: false },
    { id: 3, value: '10월', checked: false },
    { id: 4, value: '9월', checked: false },
  ]);
  const [selectAllStopword, setSelectAllStopword] = useState(false);

  // NLP 설정
  const [minKeywordLength, setMinKeywordLength] = useState(4);

  // ===== Mock 데이터 생성 =====
  const generateTargetData = () => {
    const data = [];
    for (let i = 1; i <= 50; i++) {
      data.push({
        id: i,
        이름: '이커머스 실비 안분_지급수수료',
      });
    }
    return data;
  };

  const generateResultData = () => {
    const companies = [
      '더데이걸', '로엠', '포인포인트', '오휴', '핸트메이드',
      '쓰리엔', '지크', '엘본', '이즈백', '트루',
      'CMC', '모스트', '쓰시에', '오스본', '보보',
      '일로', '리틀', '밀리밤', '펠릭스', '스탭',
      '신디파크', '인디안', '엠아이', '란찌', 'SAP',
      '트렌비', '알토', '데이텀', '신드롬', '비욘드',
    ];

    return companies.map((company, idx) => ({
      id: idx + 1,
      'CO 오브젝트이름': `인터넷몰 ${company}`,
      상계계정이름: '지급수수료(물류용역)',
      Column0: '이커머스',
      Column1: '실비',
      Column2: '안분',
      Column3: '지급수수료',
    }));
  };

  // ===== useEffect =====
  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      setTargetData(generateTargetData());
      setResultData(generateResultData());
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    }
  };

  // ===== 핸들러 함수 =====
  const handleAddSeparator = () => {
    if (newSeparator.trim()) {
      setSeparatorList([
        ...separatorList,
        { id: Date.now(), value: newSeparator.trim(), checked: false },
      ]);
      setNewSeparator('');
    }
  };

  const handleRemoveSeparator = () => {
    const checkedCount = separatorList.filter((item) => item.checked).length;
    if (checkedCount === 0) {
      alert('제거할 항목을 선택해주세요.');
      return;
    }
    setSeparatorList(separatorList.filter((item) => !item.checked));
    setSelectAllSeparator(false);
  };

  const handleAddStopword = () => {
    if (newStopword.trim()) {
      setStopwordList([
        ...stopwordList,
        { id: Date.now(), value: newStopword.trim(), checked: false },
      ]);
      setNewStopword('');
    }
  };

  const handleRemoveStopword = () => {
    const checkedCount = stopwordList.filter((item) => item.checked).length;
    if (checkedCount === 0) {
      alert('제거할 항목을 선택해주세요.');
      return;
    }
    setStopwordList(stopwordList.filter((item) => !item.checked));
    setSelectAllStopword(false);
  };

  const handleKeywordExtract = () => {
    alert('구분자 기반 키워드 추출을 시작합니다.');
  };

  const handleRemoveSingleChar = () => {
    alert('1글자 키워드를 제거합니다.');
  };

  const handleNlpExtract = () => {
    alert(`NLP 기반 키워드 추출 (${minKeywordLength}글자 이상)`);
  };

  const handleComplete = () => {
    navigate(`/projects/${projectId}/sessions/${sessionId}/transform`);
  };

  return (
    // [중요] h-screen 대신 h-full 사용
    // DashboardLayout의 main 영역을 100% 채우기 위함입니다.
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4 py-4 h-full flex flex-col min-h-0 max-w-[98vw]">

        {/* 상단 헤더 (고정 높이) */}
        <div className="flex-shrink-0 space-y-4 mb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects">
                  <Home className="h-4 w-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}/upload`}>
                  프로젝트
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold">
                  Step 3: Preprocessing
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg">
                📂 {sessionInfo.sessionName}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 메인 콘텐츠 그리드 (남은 높이 채움) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* 좌측: 데이터 테이블 영역 (8/12) */}
          <div className="xl:col-span-8 h-full flex flex-col min-h-0 gap-4">

            {/* 내부 그리드: 대상 테이블(5) + 결과 테이블(7) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">

              {/* 키워드 추출 대상 */}
              <div className="lg:col-span-5 h-full min-h-0">
                <Card className="h-full flex flex-col overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                    <CardTitle className="text-base">키워드 추출 대상</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 relative min-h-0">
                    {/* absolute inset-0으로 부모 크기에 강제 고정 후 스크롤 생성 */}
                    <div className="absolute inset-0 overflow-auto custom-scrollbar">
                      <Table>
                        <TableHeader className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                          <TableRow>
                            <TableHead className="font-semibold text-xs w-[60px] text-center bg-gray-100">No</TableHead>
                            <TableHead className="font-semibold text-xs bg-gray-100">이름</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {targetData.map((row) => (
                            <TableRow key={row.id} className="hover:bg-muted/50">
                              <TableCell className="text-xs text-center">{row.id}</TableCell>
                              <TableCell className="text-xs">{row.이름}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 키워드 추출 결과 */}
              <div className="lg:col-span-7 h-full min-h-0">
                <Card className="h-full flex flex-col overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b bg-white flex-shrink-0">
                    <CardTitle className="text-base">키워드 추출 결과</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 relative min-h-0">
                    <div className="absolute inset-0 overflow-auto custom-scrollbar">
                      <Table>
                        <TableHeader className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                          <TableRow>
                            <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">CO 오브젝트이름</TableHead>
                            <TableHead className="font-semibold text-xs whitespace-nowrap bg-gray-100">상계계정이름</TableHead>
                            <TableHead className="font-semibold text-xs text-center bg-gray-100">C0</TableHead>
                            <TableHead className="font-semibold text-xs text-center bg-gray-100">C1</TableHead>
                            <TableHead className="font-semibold text-xs text-center bg-gray-100">C2</TableHead>
                            <TableHead className="font-semibold text-xs text-center bg-gray-100">C3</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultData.map((row) => (
                            <TableRow key={row.id} className="hover:bg-muted/50">
                              <TableCell className="text-xs whitespace-nowrap">{row['CO 오브젝트이름']}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{row.상계계정이름}</TableCell>
                              <TableCell className="text-xs text-center">{row.Column0}</TableCell>
                              <TableCell className="text-xs text-center">{row.Column1}</TableCell>
                              <TableCell className="text-xs text-center">{row.Column2}</TableCell>
                              <TableCell className="text-xs text-center">{row.Column3}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          </div>

          {/* 우측: 컨트롤 및 버튼 영역 (4/12) */}
          <div className="xl:col-span-4 h-full flex flex-col min-h-0">

            {/* 설정 패널 (스크롤 가능) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-2">

              {/* 구분자 변환 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">구분자 변환</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-sm"
                      placeholder="신규 변환 대상 입력"
                      value={newSeparator}
                      onChange={(e) => setNewSeparator(e.target.value)}
                      onKeyPress={(e) => {
                         if (e.key === 'Enter') handleAddSeparator();
                       }}
                    />
                    <Button onClick={handleAddSeparator} className="bg-pink-600 hover:bg-pink-700 h-8 whitespace-nowrap">
                      <Plus className="h-3 w-3 mr-1" />
                      추가
                    </Button>
                  </div>
                  <div className="border rounded-md p-2 space-y-1 max-h-[150px] overflow-y-auto bg-white">
                    <div className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                      <Checkbox
                        id="sep-all"
                        checked={selectAllSeparator}
                        onCheckedChange={(checked) => {
                          setSelectAllSeparator(!!checked);
                          setSeparatorList(separatorList.map(item => ({ ...item, checked: !!checked })));
                        }}
                      />
                      <label htmlFor="sep-all" className="text-xs font-semibold cursor-pointer w-full">전체 선택</label>
                    </div>
                    {separatorList.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                        <Checkbox
                          id={`sep-${item.id}`}
                          checked={item.checked}
                          onCheckedChange={(checked) => {
                            setSeparatorList(separatorList.map(s => s.id === item.id ? { ...s, checked: !!checked } : s));
                          }}
                        />
                        <label htmlFor={`sep-${item.id}`} className="text-xs cursor-pointer w-full">
                          {item.value === ' ' ? '(공백)' : item.value}
                        </label>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemoveSeparator}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    선택 항목 제거
                  </Button>
                </CardContent>
              </Card>

              {/* 불용어 제거 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">불용어 제거</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-sm"
                      placeholder="신규 불용어 입력"
                      value={newStopword}
                      onChange={(e) => setNewStopword(e.target.value)}
                      onKeyPress={(e) => {
                         if (e.key === 'Enter') handleAddStopword();
                       }}
                    />
                    <Button onClick={handleAddStopword} className="h-8 whitespace-nowrap">
                      <Plus className="h-3 w-3 mr-1" />
                      추가
                    </Button>
                  </div>
                  <div className="border rounded-md p-2 space-y-1 max-h-[150px] overflow-y-auto bg-white">
                    <div className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                      <Checkbox
                        id="stop-all"
                        checked={selectAllStopword}
                        onCheckedChange={(checked) => {
                          setSelectAllStopword(!!checked);
                          setStopwordList(stopwordList.map(item => ({ ...item, checked: !!checked })));
                        }}
                      />
                      <label htmlFor="stop-all" className="text-xs font-semibold cursor-pointer w-full">전체 선택</label>
                    </div>
                    {stopwordList.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                        <Checkbox
                          id={`stop-${item.id}`}
                          checked={item.checked}
                          onCheckedChange={(checked) => {
                            setStopwordList(stopwordList.map(s => s.id === item.id ? { ...s, checked: !!checked } : s));
                          }}
                        />
                        <label htmlFor={`stop-${item.id}`} className="text-xs cursor-pointer w-full">
                          {item.value}
                        </label>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemoveStopword}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    선택 항목 제거
                  </Button>
                </CardContent>
              </Card>

              {/* 구분자 기반 키워드 추출 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">구분자 기반 키워드 추출</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" className="h-8" onClick={handleKeywordExtract}>키워드 추출</Button>
                    <Button size="sm" variant="secondary" className="h-8" onClick={handleRemoveSingleChar}>1글자 제거</Button>
                  </div>
                </CardContent>
              </Card>

              {/* NLP 기반 키워드 추출 */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-bold">NLP 기반 키워드 추출</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="text-[11px] text-pink-600 bg-pink-50 p-2 rounded">
                    * 구분자 기반으로 키워드 추출 후<br />
                    AI가 추가적으로 키워드를 분할합니다.
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={minKeywordLength}
                      onChange={(e) => setMinKeywordLength(parseInt(e.target.value) || 4)}
                      min="1"
                      max="10"
                      className="w-16 h-8 text-sm"
                    />
                    <Label className="text-xs text-muted-foreground">글자 이상 키워드 자동 분할</Label>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-purple-600 hover:bg-purple-700 h-8"
                    onClick={handleNlpExtract}
                  >
                    키워드 추출
                  </Button>
                </CardContent>
              </Card>

            </div>

            {/* 완료 버튼 (하단 고정) */}
            <div className="pt-3 mt-auto flex-shrink-0 z-20 bg-gray-50 pb-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg h-12 text-base font-semibold"
                onClick={handleComplete}
              >
                완료 → Step 4: Transform
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default PreprocessingPage;