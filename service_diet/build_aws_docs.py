# -*- coding: utf-8 -*-
"""
AWS 비용절감 결재 문서 생성 스크립트

산출물:
  - AWS_비용절감_개선보고서_20260811.docx  : As-Is 대비 개선 내용 및 결과
  - AWS_비용절감_기안서_20260811.docx      : 결재 상신용 기안서

방침: 서비스는 상시 가동을 유지하고 실사용이 없는 유휴 리소스만 정리한다.
실행: python build_aws_docs.py
"""

import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

FONT = "맑은 고딕"
ACCENT = RGBColor(0x1F, 0x4E, 0x79)
MUTED = RGBColor(0x59, 0x59, 0x59)
DANGER = RGBColor(0xC0, 0x00, 0x00)


# ---------------------------------------------------------------- 공통 유틸

def set_kr_font(run, size=10, bold=False, color=None):
    """python-docx 는 eastAsia 폰트를 별도 지정해야 한글이 적용된다."""
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def setup_base_style(doc):
    style = doc.styles["Normal"]
    style.font.name = FONT
    style.font.size = Pt(10)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    pf = style.paragraph_format
    pf.space_after = Pt(4)
    pf.line_spacing = 1.4


def add_title(doc, text, subtitle=None):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_kr_font(p.add_run(text), size=20, bold=True, color=ACCENT)
    if subtitle:
        sp = doc.add_paragraph()
        sp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_kr_font(sp.add_run(subtitle), size=10, color=MUTED)
    doc.add_paragraph()


def add_heading(doc, text, level=1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14 if level == 1 else 10)
    p.paragraph_format.space_after = Pt(6)
    size = 14 if level == 1 else 11
    set_kr_font(p.add_run(text), size=size, bold=True, color=ACCENT if level == 1 else None)
    return p


def add_body(doc, text, size=10, bold=False, color=None, indent=0.0):
    p = doc.add_paragraph()
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    set_kr_font(p.add_run(text), size=size, bold=bold, color=color)
    return p


def add_bullet(doc, text, indent=0.5, size=10):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(indent)
    set_kr_font(p.add_run("· " + text), size=size)
    return p


def shade_cell(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def add_table(doc, headers, rows, widths=None, highlight_last=False):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER

    hdr = t.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = ""
        p = hdr[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_kr_font(p.add_run(str(h)), size=9, bold=True)
        shade_cell(hdr[i], "DCE6F1")

    for r_idx, row in enumerate(rows):
        cells = t.add_row().cells
        is_last = highlight_last and r_idx == len(rows) - 1
        for i, val in enumerate(row):
            cells[i].text = ""
            p = cells[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i > 0 else WD_ALIGN_PARAGRAPH.LEFT
            set_kr_font(p.add_run(str(val)), size=9, bold=is_last)
            if is_last:
                shade_cell(cells[i], "FFF2CC")

    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


def add_note(doc, text, color=MUTED):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.3)
    set_kr_font(p.add_run(text), size=9, color=color)
    return p


# ---------------------------------------------------------------- 개선보고서

def build_report(path):
    doc = Document()
    setup_base_style(doc)

    add_title(doc,
              "AWS 인프라 비용 절감 개선 보고서",
              "LG CNS Finance Tool  |  작성일 2026-08-11  |  AWS 계정 659002796326 (ap-northeast-2)")

    # ---------------- 요약 ----------------
    add_heading(doc, "요 약")

    add_heading(doc, "현황", level=2)
    add_table(doc,
              ["항목", "값"],
              [["현재 월 비용", "$589 (연환산 $7,069)"],
               ["하루 평균 정상 요청", "12건 (30일간 356건)"],
               ["60일간 실사용일", "8일"],
               ["애플리케이션 서버 CPU", "평균 0.13%"],
               ["봇 · 스캐너 트래픽 비중", "99.7% (146,743건)"]],
              widths=[6.0, 10.0])
    add_body(doc, "월 $545(세전)를 투입하여 하루 12건을 처리하고 있다.", bold=True)

    add_heading(doc, "개선 방침", level=2)
    add_body(doc, "서비스는 현행대로 상시 가동하고, 실사용이 없는 리소스만 정리한다.", bold=True)
    add_body(doc, "미사용 시 서버를 정지하는 방식도 검토하였으나 채택하지 않았다. "
                  "이용자 대기 시간이 발생하고 운영 복잡도가 크게 증가하는 반면, "
                  "유휴 리소스 정리만으로도 상당한 절감이 가능하기 때문이다. "
                  "검토 결과는 8장에 정리하였다.")

    add_heading(doc, "결과", level=2)
    add_table(doc,
              ["구분", "As-Is", "To-Be"],
              [["월 비용", "$589", "$422"],
               ["연 환산", "$7,069", "$5,062"],
               ["절감률", "-", "28%"],
               ["연 절감액", "-", "약 $2,007"],
               ["공수", "-", "1.5일"]],
              widths=[5.0, 5.5, 5.5], highlight_last=True)

    add_heading(doc, "이용자 체감 변화 — 사실상 없음", level=2)
    add_table(doc,
              ["항목", "변화"],
              [["첫 접속 대기", "없음 (상시 가동 유지)"],
               ["접속 흐름 · 조작", "변화 없음"],
               ["조회 · 처리 성능", "변화 없음"],
               ["자원 확보 실패", "없음"],
               ["장애 복구 시간", "1~2분 증가 ← 유일한 변화"]],
              widths=[6.0, 10.0])
    add_body(doc, "애플리케이션 서버가 2대에서 1대가 되므로, 해당 서버에 장애가 발생하면 "
                  "자동 재기동까지 1~2분간 이용이 불가하다. 다만 하루 정상 요청이 12건 수준이라 "
                  "장애와 사용 시점이 겹칠 확률은 매우 낮다.")
    add_note(doc, "※ 전환 작업 중에는 보안 조치(인증 키 교체)로 전체 사용자 재로그인이 1회 "
                  "발생한다. 기술적으로 회피 불가하며 사전 공지로 대응한다.")

    add_heading(doc, "조치 항목", level=2)
    add_table(doc,
              ["#", "조치", "절감/월", "근거"],
              [["1", "애플리케이션 서버 2대 → 1대", "$84.5", "CPU 평균 0.13%, 실사용 하루 12건"],
               ["2", "네트워크 게이트웨이 제거", "$34.7", "요금의 97%가 유휴 시간 요금"],
               ["3", "캐시 서버 사양 축소", "$17.5", "메모리 사용률 0.88%"],
               ["4", "공인 IP 반납", "$3.6", "게이트웨이 제거에 따름"],
               ["5", "검증용 서버 삭제 (완료)", "$10.7", "서비스와 무관"],
               ["6", "보안 조치 (인증 키 · 자격증명)", "-", "비용 무관, 시급도 높음"],
               ["", "합계 (세전)", "$151", ""]],
              widths=[1.2, 6.0, 2.4, 6.4], highlight_last=True)

    add_heading(doc, "단계별 누적", level=2)
    add_table(doc,
              ["시점", "월 비용", "절감률", "누적 소요"],
              [["현행", "$589", "-", "-"],
               ["검증용 서버 삭제 (완료)", "$577", "2%", "-"],
               ["1단계 (서버 단일화, 캐시 축소)", "$467", "21%", "1시간"],
               ["2단계 (보안 조치)", "$467", "21%", "1일"],
               ["3단계 (게이트웨이 제거)", "$422", "28%", "1.5일"]],
              widths=[6.0, 3.2, 3.2, 3.6], highlight_last=True)
    add_note(doc, "※ 1단계는 1시간 소요로 21% 절감이 가능하므로, "
                  "결재 일정과 무관하게 선행 적용을 검토할 수 있다.")

    doc.add_page_break()

    # 1
    add_heading(doc, "1. 분석 개요")
    add_table(doc,
              ["구분", "내용"],
              [["분석 대상", "LG CNS Finance Tool 전체 AWS 리소스"],
               ["분석 기간", "2026년 1월 ~ 7월 (비용) / 최근 60일 (사용량)"],
               ["분석 방법", "AWS Cost Explorer + CloudWatch 지표 직접 조회"],
               ["데이터 성격", "실측값 (추정치는 본문에 '추정'으로 명시)"],
               ["개선 방침", "상시 가동 유지, 유휴 리소스만 정리"]],
              widths=[4.0, 12.0])

    # 2
    add_heading(doc, "2. As-Is 현황")
    add_heading(doc, "2.1 월별 비용 추이", level=2)
    add_table(doc,
              ["1월", "2월", "3월", "4월", "5월", "6월", "7월"],
              [["$334", "$520", "$769", "$575", "$590", "$570", "$589"]],
              widths=[2.3] * 7)
    add_body(doc, "3월 급증($769)은 데이터베이스 실험 인스턴스 미삭제 건으로 4월에 정리되었다. "
                  "이후 월 $570~590 수준에 고착되어 있다.")

    add_heading(doc, "2.2 7월 항목별 내역 및 실측 사용률", level=2)
    add_table(doc,
              ["항목", "월 비용", "실측 사용률"],
              [["데이터베이스 (2vCPU/16GB)", "$247.64", "평상시 CPU 8.3% / 최대 100%, 연결 12 / 최대 287"],
               ["애플리케이션 서버 CPU (2대)", "$138.57", "CPU 평균 0.13%, 최대 52%"],
               ["애플리케이션 서버 메모리 (2대)", "$30.42", "메모리 9.3% (약 372MB)"],
               ["네트워크 게이트웨이", "$43.90", "요금의 97%가 유휴 시간 요금"],
               ["캐시 서버", "$34.97", "CPU 2.2%, 메모리 0.88%"],
               ["로드밸런서", "$16.76", "-"],
               ["공인 IP (3개)", "$14.89", "-"],
               ["검증용 서버", "$10.71", "상시 가동 (삭제 완료)"],
               ["저장 공간 / 기타", "$7.55", "-"],
               ["세금", "$43.64", "-"],
               ["합계", "$589.05", "-"]],
              widths=[6.8, 2.6, 6.6], highlight_last=True)

    # 3
    add_heading(doc, "3. 문제점 분석")

    add_heading(doc, "3.1 실사용량 대비 과다한 고정비", level=2)
    add_table(doc,
              ["구분", "건수", "비율"],
              [["정상 응답 (2XX)", "356", "0.24%"],
               ["오류 응답 4XX (봇 · 취약점 스캐너)", "146,743", "99.7%"],
               ["오류 응답 5XX", "8", "-"]],
              widths=[7.0, 4.0, 4.0])
    add_body(doc, "최근 30일 기준 정상 요청은 하루 평균 12건에 불과하다.", bold=True)
    add_body(doc, "60일간 일별 분포를 확인한 결과 실질적인 사용일은 8일에 그쳤으며, "
                  "사용 시간대도 새벽 2시, 저녁 7시 등으로 불규칙하였다.")

    add_heading(doc, "3.2 유휴 리소스", level=2)
    add_table(doc,
              ["리소스", "월 비용", "문제점"],
              [["애플리케이션 서버", "$168.99", "CPU 평균 0.13%. 이중화 2대가 사실상 유휴 상주"],
               ["네트워크 게이트웨이", "$43.90", "요금의 97%가 유휴 시간 요금"],
               ["캐시 서버", "$34.97", "메모리 사용률 0.88% (1.37GB 중 약 12MB)"],
               ["검증용 서버", "$10.71", "데이터베이스 접속 검증 용도이나 상시 가동"]],
              widths=[4.0, 2.6, 9.4])

    add_heading(doc, "3.3 보안 취약점 (비용과 별개, 시급도 높음)", level=2)
    add_body(doc, "분석 과정에서 운영 환경의 보안 취약점이 확인되었다.", color=DANGER, bold=True)
    add_bullet(doc, "인증 토큰 서명 키가 소스코드의 기본값 그대로 운영 중 — 토큰 위조가 가능한 상태")
    add_bullet(doc, "접근 키 및 데이터베이스 비밀번호가 저장소에 평문으로 관리됨")

    # 4
    add_heading(doc, "4. To-Be 개선 방안")

    add_heading(doc, "4.1 개선 원칙", level=2)
    add_bullet(doc, "서비스는 상시 가동을 유지한다 — 이용자 영향을 만들지 않는다")
    add_bullet(doc, "데이터베이스는 사양과 가동 방식 모두 현행을 유지한다")
    add_bullet(doc, "신규 구성요소를 만들지 않는다 — 기존 운영 방식을 그대로 둔다")
    add_bullet(doc, "실사용이 없는 리소스만 정리한다")

    add_heading(doc, "4.2 데이터베이스를 현행 유지하는 이유", level=2)
    add_bullet(doc, "6개월 지표상 CPU 최대 100%, 연결 최대 287건, 메모리 16GB 중 12.8GB 사용")
    add_bullet(doc, "대용량(100MB) 엑셀 처리 시 자원 소요가 크므로 사양 축소는 처리 실패 위험을 수반")
    add_bullet(doc, "미사용 시 정지할 경우 재기동에 5~10분이 소요되어 이용자 대기 발생")

    add_heading(doc, "4.3 리소스별 조치", level=2)
    add_table(doc,
              ["리소스", "조치", "비고"],
              [["애플리케이션 서버", "이중화(2대) → 단일화(1대), 상시 가동 유지", "실사용량 대비 이중화 실익 없음"],
               ["데이터베이스", "현행 유지 (사양 · 가동 모두)", "이용자 영향 회피"],
               ["네트워크 게이트웨이", "전용 연결로 대체 후 제거", "선행 작업 필수 (7.2 참조)"],
               ["캐시 서버", "사양 축소", "메모리 사용률 0.88% 근거"],
               ["공인 IP", "미사용분 반납", "게이트웨이 제거 시 1개 반납"],
               ["검증용 서버", "삭제", "조치 완료"],
               ["로드밸런서", "유지", "서비스 진입점으로 필수"]],
              widths=[3.6, 6.4, 6.0])

    # 5
    add_heading(doc, "5. 개선 결과")
    add_heading(doc, "5.1 항목별 비용 비교", level=2)
    add_table(doc,
              ["항목", "As-Is", "To-Be", "절감액"],
              [["데이터베이스 인스턴스", "$247.64", "$247.64", "$0"],
               ["데이터베이스 저장 공간 / I/O", "$4.94", "$4.94", "$0"],
               ["애플리케이션 서버", "$168.99", "$84.50", "$84.49"],
               ["네트워크 게이트웨이", "$43.90", "$0.00", "$43.90"],
               ["캐시 서버", "$34.97", "$17.50", "$17.47"],
               ["로드밸런서", "$16.76", "$16.70", "$0.06"],
               ["공인 IP", "$14.89", "$7.50", "$7.39"],
               ["검증용 서버", "$10.71", "$0.00", "$10.71"],
               ["전용 연결 (신규)", "$0.00", "$9.20", "-$9.20"],
               ["저장소 / 기타", "$2.61", "$2.61", "$0"],
               ["소계 (세전)", "$545.41", "$390.59", "$154.82"],
               ["세금", "$43.64", "$31.25", "$12.39"],
               ["월 합계", "$589.05", "$421.84", "$167.21"]],
              widths=[5.4, 3.2, 3.2, 3.2], highlight_last=True)
    add_table(doc,
              ["구분", "As-Is", "To-Be", "절감"],
              [["월 비용", "$589", "$422", "28% 절감"],
               ["연 환산", "$7,069", "$5,062", "약 $2,007"]],
              widths=[3.6, 4.0, 4.0, 4.4], highlight_last=True)

    add_heading(doc, "5.2 부수 효과", level=2)
    add_bullet(doc, "운영 환경 보안 취약점(토큰 위조 가능, 자격증명 평문) 조치")
    add_bullet(doc, "미사용 리소스 정리를 통한 인프라 구성 단순화")
    add_note(doc, "※ 분석 과정에서 확인된 작업 진행률 유실 결함(서버 이중화 환경에서 재현)은 "
                  "서버 단일화로 증상이 해소되나, 근본 수정은 별도 개선 과제로 분리하였다.")

    # 6
    add_heading(doc, "6. 실행 계획")
    add_heading(doc, "6.1 단계별 로드맵", level=2)
    add_table(doc,
              ["단계", "내용", "소요", "월 절감"],
              [["1", "즉시 조치 (서버 단일화, 캐시 사양 축소, 정상 종료 설정)", "1시간", "$110"],
               ["2", "보안 조치 (인증 키 교체, 자격증명 이관)", "1일", "-"],
               ["3", "네트워크 게이트웨이 제거 및 구성 변경", "0.5일", "$45"],
               ["", "합계", "1.5일", "$155"]],
              widths=[1.6, 8.4, 3.0, 3.0], highlight_last=True)

    add_heading(doc, "6.2 단계별 서비스 영향", level=2)
    add_body(doc, "배포 설정상 신규 서버를 먼저 기동하여 정상 확인 후 기존 서버를 제거하므로, "
                  "모든 단계에서 서비스 접속 중단은 발생하지 않는다.")
    add_table(doc,
              ["단계", "접속 중단", "서비스 영향"],
              [["1", "없음", "이중화 해제로 가용성 저하 (2대 → 1대). 캐시 교체로 진행률 정보 초기화"],
               ["2", "없음", "인증 키 교체로 전체 사용자 재로그인 필요"],
               ["3", "없음", "없음 (서버 주소 변경은 로드밸런서가 자동 반영)"]],
              widths=[1.6, 2.4, 12.0])
    add_body(doc, "완화 방안", bold=True)
    add_bullet(doc, "서버 재기동을 수반하는 작업은 비사용일에 수행 (실사용일 월 4일 수준)")
    add_bullet(doc, "정상 종료 설정을 1단계에 포함하여 이후 재기동 시 진행 중 작업 보호")
    add_bullet(doc, "2단계 재로그인은 사전 공지로 대응 (기술적 회피 불가)")
    add_bullet(doc, "각 단계 롤백 절차 사전 확보 (최대 5분 내 원복)")

    add_heading(doc, "6.3 조치 완료 및 보류 항목", level=2)
    add_table(doc,
              ["항목", "상태", "비고"],
              [["검증용 서버 삭제", "완료", "인스턴스 및 저장 공간 정리 완료"],
               ["저장소 전용 연결 생성", "완료", "무료. 게이트웨이 제거 선행 작업"],
               ["컨테이너 이미지 정리", "보류", "삭제가 비가역적이며 절감액이 미미하여 승인 후 진행"],
               ["네트워크 게이트웨이 제거", "차단", "선행 작업 없이 제거 시 서비스 복구 불가 (7.2)"]],
              widths=[5.0, 2.4, 8.6])

    # 7
    doc.add_page_break()
    add_heading(doc, "7. 리스크 관리")
    add_table(doc,
              ["리스크", "영향", "대응 방안"],
              [["서버 단일화로 가용성 저하",
                "장애 시 1~2분 이용 불가",
                "자동 재기동 설정 유지. 실사용 빈도가 낮아 장애와 겹칠 확률 낮음"],
               ["인증 키 교체",
                "전체 사용자 재로그인 필요",
                "사전 공지. 기술적 회피 불가"],
               ["게이트웨이 제거 시 통신 차단",
                "재배포 및 서버 재시작 실패",
                "선행 조치 완료 후 측정으로 검증한 뒤 제거 (7.2)"],
               ["캐시 교체 시 진행률 정보 초기화",
                "진행 중 작업 표시 유실",
                "임시 데이터이므로 무해. 비사용일에 수행"]],
              widths=[4.0, 4.0, 8.0])

    add_heading(doc, "7.2 네트워크 게이트웨이 제거 시 유의사항", level=2)
    add_body(doc, "해당 게이트웨이는 요금의 97%가 유휴 시간 요금이나, 즉시 제거는 불가하다.", bold=True)
    add_body(doc, "현재 애플리케이션 서버가 사설 구간에 배치되어 있어 외부 통신 경로가 이 게이트웨이 "
                  "단일 경로다. 실제로 서버 재기동이 발생한 날마다 292~302MB 가 수신되었으며, "
                  "이는 컨테이너 이미지 용량(155MB)에 서버 대수(2대)를 곱한 값과 정확히 일치한다. "
                  "즉 이미지 수신 경로로 실제 사용되고 있음이 측정으로 확인된다.")
    add_body(doc, "선행 조치 없이 제거할 경우 컨테이너 이미지 수신과 로그 전송이 차단되어 "
                  "재배포 및 서버 재시작 시 기동이 실패한다.")
    add_table(doc,
              ["통신 경로", "현재", "조치 후"],
              [["서버 → 컨테이너 이미지 저장소", "게이트웨이 경유", "공용 구간 재배치 → 인터넷 게이트웨이"],
               ["서버 → 로그 수집", "게이트웨이 경유", "공용 구간 재배치 → 인터넷 게이트웨이"],
               ["파일 처리 → 저장소", "게이트웨이 경유", "전용 연결 (조치 완료, 무료)"],
               ["파일 처리 → 대기열", "게이트웨이 경유", "전용 연결 (신규, 월 $9.2)"],
               ["파일 처리 → 데이터베이스", "내부 통신", "변경 없음"]],
              widths=[5.0, 3.6, 7.4])
    add_note(doc, "※ 제거 안전 여부는 측정으로 판정한다. 선행 조치 후 재배포를 1회 수행하고 "
                  "수신 데이터량이 0 으로 유지되면 통과 트래픽이 없다는 의미이므로 안전하게 삭제한다.")
    add_note(doc, "※ 공용 구간 재배치 후에도 외부 접근은 차단된다. 방화벽 규칙이 "
                  "로드밸런서 경유만 허용하도록 설정되어 있음을 사전 재확인한다.")

    # 8
    add_heading(doc, "8. 검토 후 제외한 방안")
    add_heading(doc, "8.1 미사용 시 자동 정지 (온디맨드 전환)", level=2)
    add_body(doc, "세 가지 방식을 설계 · 검증하였으나 모두 채택하지 않았다.")
    add_table(doc,
              ["구분", "데이터베이스", "월 비용", "절감률", "첫 접속 대기", "공수"],
              [["전체 정지", "정지", "$111", "81%", "7~13분", "5.5일"],
               ["서버만 정지", "유지", "$343", "42%", "30~60초", "4.5일"],
               ["서버만 정지 + 로그인 분리", "유지", "$343", "42%", "거의 없음", "7일"]],
              widths=[4.4, 2.2, 2.2, 2.0, 2.6, 2.6])
    add_body(doc, "제외 사유", bold=True)
    add_bullet(doc, "이용자 대기 발생 — 사용 시간대가 새벽 2시, 저녁 7시로 불규칙하여 부담이 큼")
    add_bullet(doc, "운영 복잡도 급증 — 기동 트리거, 유휴 판정, 자동 정지, 진행 중 작업 보호 등 "
                    "신규 구성요소 다수 필요")
    add_bullet(doc, "신규 장애 요인 — 자원 확보 실패, 기동 순서 문제, 판정 오탐 등 기존에 없던 리스크")
    add_bullet(doc, "절감 대비 효용 — 유휴 리소스 정리만으로 28%를 확보 가능하며, "
                    "추가 절감은 위 세 가지를 감수해야 함")
    add_note(doc, "※ 상세 설계와 검증 결과는 별도 문서에 보존하였으며, 향후 필요 시 재검토할 수 있다.")

    add_heading(doc, "8.2 예약 할인 (약정 방식)", level=2)
    add_body(doc, "상시 가동이 확정되면 1년 약정으로 할인을 받을 수 있으나, "
                  "중도 해지가 불가하여 이번 범위에서 제외하였다.")
    add_table(doc,
              ["대상", "현재", "1년 약정", "절감/월", "확인 상태"],
              [["캐시 서버", "$17.50", "$11.70", "$5.8", "확인 완료"],
               ["애플리케이션 서버", "$84.50", "약 $67.60", "약 $17", "요율 확인 필요"],
               ["데이터베이스", "$247.64", "약 $161", "약 $86", "제공 여부 확인 필요"]],
              widths=[3.4, 2.8, 3.0, 2.8, 4.0])
    add_note(doc, "※ 모두 적용 시 월 약 $320(46% 절감)으로 추정되며, 이용자 영향은 없다. "
                  "서비스 존속 기간이 1년 이상 확정되면 우선 검토할 가치가 있다.")

    # 부록
    add_heading(doc, "부록. 실측 데이터 근거")
    add_table(doc,
              ["측정 항목", "측정값", "출처"],
              [["월별 AWS 비용", "1월 $334 ~ 7월 $589", "Cost Explorer"],
               ["정상 응답 (30일)", "356건", "CloudWatch ALB"],
               ["오류 응답 4XX (30일)", "146,743건", "CloudWatch ALB"],
               ["실사용일 (60일)", "8일", "일별 정상응답 30건 이상 기준"],
               ["사용 시간대", "새벽 2시 / 저녁 7시", "시간대별 정상응답 분포"],
               ["서버 CPU (30일)", "평균 0.13% / 최대 52%", "CloudWatch ECS"],
               ["서버 메모리 (30일)", "평균 9.3%", "CloudWatch ECS"],
               ["데이터베이스 CPU (6개월)", "평균 8.3% / 최대 100%", "CloudWatch DocDB"],
               ["데이터베이스 연결 (6개월)", "평균 12 / 최대 287", "CloudWatch DocDB"],
               ["데이터 용량", "14.6GB", "CloudWatch DocDB"],
               ["게이트웨이 수신량 (재기동일)", "292~302MB", "이미지(155MB)×2대와 일치"],
               ["캐시 메모리 사용률", "0.88%", "CloudWatch ElastiCache"],
               ["애플리케이션 기동 시간", "17~23초", "CloudWatch Logs (8회 샘플)"]],
              widths=[5.6, 4.6, 5.8])
    add_note(doc, "※ 모든 수치는 AWS 관리 콘솔 API 를 통해 직접 조회한 실측값이다.")

    doc.save(path)
    return path


# ---------------------------------------------------------------- 기안서

def build_draft(path):
    doc = Document()
    setup_base_style(doc)

    add_title(doc, "기 안 서")

    add_table(doc,
              ["제목", "AWS 인프라 유휴 리소스 정리를 통한 운영비 절감 추진의 건"],
              [["기안일", "2026년 08월 11일"],
               ["기안 부서", "(기입 필요)"],
               ["기안자", "(기입 필요)"],
               ["관련 문서", "AWS 비용절감 개선보고서 (2026-08-11)"]],
              widths=[3.4, 12.6])

    # 1
    add_heading(doc, "1. 기안 개요")
    add_body(doc,
             "AWS 인프라 운영비 절감을 위해 실사용이 없는 유휴 리소스를 정리하고자 합니다. "
             "금번 조치는 서비스를 현행대로 상시 가동한 상태에서 진행하므로 이용자 영향이 없으며, "
             "연간 약 $2,007(약 270만원)의 비용을 절감하는 것을 목적으로 합니다.",
             indent=0.5)

    # 2
    add_heading(doc, "2. 추진 배경")
    add_body(doc, "1) 26년 월평균 AWS 비용 $589 고정 지출 (연환산 $7,069)", indent=0.5)
    add_body(doc, "2) 실측 결과 최근 30일 정상 요청 356건(일평균 12건), 서버 CPU 평균 0.13%로 "
                  "자원 대부분이 유휴 상태", indent=0.5)
    add_body(doc, "3) 네트워크 게이트웨이 요금의 97%가 유휴 시간 요금, 캐시 메모리 사용률 0.88% 등 "
                  "실사용이 없는 리소스에 고정비 발생", indent=0.5)
    add_body(doc, "4) 서비스 이용일이 60일 중 8일 수준으로 이중화 구성의 실익이 없음", indent=0.5)
    add_body(doc, "5) 운영 환경 보안 취약점(인증 토큰 서명 키 기본값 사용, 자격증명 평문 관리) 조치 필요", indent=0.5)
    add_body(doc, "이에 따라 서비스 가동 방식은 유지한 채 유휴 리소스만 정리하여 "
                  "운영비를 절감하고 보안 수준을 개선하고자 함", indent=0.5)

    # 3
    add_heading(doc, "3. 추진 내용")
    add_body(doc, "1) 주요 내용", indent=0.5)
    add_bullet(doc, "애플리케이션 서버 이중화 해제 (2대 → 1대, 상시 가동 유지)", indent=1.0)
    add_bullet(doc, "네트워크 게이트웨이 제거 및 전용 연결로 대체", indent=1.0)
    add_bullet(doc, "캐시 서버 사양 축소 및 미사용 공인 IP 반납", indent=1.0)
    add_bullet(doc, "보안 취약점 조치 (인증 키 교체, 자격증명 보안 저장소 이관)", indent=1.0)
    add_body(doc, "2) 수행 방식 : 3단계 점진 조치 "
                  "(즉시 조치 → 보안 조치 → 네트워크 구성 변경)", indent=0.5)
    add_body(doc, "3) 일정 : 2026년 08월 XX일 ~ 08월 XX일 (약 2 영업일)", indent=0.5)
    add_body(doc, "4) 대상 시스템 : LG CNS Finance Tool (AWS 계정 659002796326, 서울 리전)", indent=0.5)
    add_body(doc, "5) 담당 조직 : (기입 필요)", indent=0.5)
    add_body(doc, "6) 기 조치 사항 : 서비스와 무관한 검증용 서버 삭제 및 "
                  "네트워크 전용 연결 선행 구성 완료", indent=0.5)
    add_body(doc, "7) 검토 후 제외 : 미사용 시 자동 정지 방식 (추가 절감 가능하나 이용자 대기 "
                  "발생 및 운영 복잡도 증가로 제외), 1년 약정 할인 (중도 해지 불가로 제외)", indent=0.5)

    # 4
    add_heading(doc, "4. 기대 효과")
    add_body(doc, "1) 정량적 효과", indent=0.5)
    add_bullet(doc, "월 운영비 $589 → $422 (28% 절감), 연간 약 $2,007 (약 270만원) 절감", indent=1.0)
    add_bullet(doc, "1단계(1시간 소요) 조치만으로 월 $110(21%) 즉시 절감", indent=1.0)
    add_body(doc, "2) 정성적 효과", indent=0.5)
    add_bullet(doc, "운영 환경 보안 수준 개선 (토큰 위조 위험 및 자격증명 노출 해소)", indent=1.0)
    add_bullet(doc, "미사용 리소스 정리를 통한 인프라 구성 단순화", indent=1.0)
    add_bullet(doc, "이용자 영향 없이 절감 — 서비스 가동 방식 및 접속 절차 변경 없음", indent=1.0)

    # 5
    add_heading(doc, "5. 리스크 및 대응")
    add_body(doc, "1) 예상 리스크", indent=0.5)
    add_bullet(doc, "서버 이중화 해제에 따른 가용성 저하 (장애 시 1~2분 이용 불가)", indent=1.0)
    add_bullet(doc, "보안 조치(인증 키 교체)에 따른 전체 사용자 재로그인 필요", indent=1.0)
    add_bullet(doc, "네트워크 구성 변경 시 통신 경로 차단 가능성", indent=1.0)
    add_body(doc, "2) 대응 방안", indent=0.5)
    add_bullet(doc, "전 단계 무중단 배포 적용 — 신규 서버 정상 확인 후 기존 서버 제거하므로 "
                    "접속 중단 없음", indent=1.0)
    add_bullet(doc, "서버 장애 시 자동 재기동 설정 유지. 실사용 빈도가 낮아 장애와 "
                    "사용 시점이 겹칠 확률 낮음", indent=1.0)
    add_bullet(doc, "재로그인은 사전 공지로 대응. 서버 재기동을 수반하는 작업은 비사용일에 수행", indent=1.0)
    add_bullet(doc, "네트워크 구성 변경은 선행 조치 완료 후 측정으로 안전을 검증한 뒤 진행", indent=1.0)
    add_bullet(doc, "각 단계별 롤백 절차 사전 확보 (최대 5분 내 원복)", indent=1.0)

    doc.add_paragraph()
    add_note(doc, "※ 상세 분석 내용 및 비용 산출 근거는 첨부 「AWS 인프라 비용 절감 개선 보고서」 참조")

    doc.save(path)
    return path


# ---------------------------------------------------------------- main

if __name__ == "__main__":
    r = build_report(os.path.join(BASE_DIR, "AWS_비용절감_개선보고서_20260811.docx"))
    d = build_draft(os.path.join(BASE_DIR, "AWS_비용절감_기안서_20260811.docx"))
    print("[OK] report ->", os.path.basename(r))
    print("[OK] draft  ->", os.path.basename(d))
