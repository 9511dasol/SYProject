# -*- coding: utf-8 -*-
import sys
sys.path.insert(0, './libs')
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

from content_q1q2 import build_q1, build_q2
from content_q3q4 import build_q3, build_q4, build_appendix

FONT = '맑은 고딕'
GREY = RGBColor(0x59, 0x59, 0x59)
doc = Document()

s = doc.sections[0]
s.page_width, s.page_height = Cm(21.0), Cm(29.7)
s.top_margin = s.bottom_margin = Cm(2.0)
s.left_margin = s.right_margin = Cm(2.0)

st = doc.styles['Normal']
st.font.name = FONT
st.font.size = Pt(12)
st.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
pf = st.paragraph_format
pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
pf.line_spacing = 1.5
pf.space_after = Pt(6)


def setfont(run, size=12, bold=False, color=None):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.bold = bold
    run._element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
    if color is not None:
        run.font.color.rgb = color


def P(text='', size=12, bold=False, align=None, sb=0, sa=4, color=None):
    p = doc.add_paragraph()
    if align:
        p.alignment = align
    p.paragraph_format.space_before = Pt(sb)
    p.paragraph_format.space_after = Pt(sa)
    if text:
        setfont(p.add_run(text), size, bold, color)
    return p


def R(parts, size=12, sa=4):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(sa)
    for t, b in parts:
        setfont(p.add_run(t), size, b)
    return p


def H(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(13)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.25
    setfont(p.add_run(text), 15, True)
    pbdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '12')
    bottom.set(qn('w:color'), '2F5496')
    pbdr.append(bottom)
    p._p.get_or_add_pPr().append(pbdr)
    return p


def NOTE(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(7)
    p.paragraph_format.line_spacing = 1.2
    setfont(p.add_run(text), 10, False, GREY)
    return p


def SH(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(9)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.3
    setfont(p.add_run(text), 12.5, True)
    return p


def shade(cell, hexfill):
    el = OxmlElement('w:shd')
    el.set(qn('w:fill'), hexfill)
    cell._tc.get_or_add_tcPr().append(el)


def T(headers, rows, widths=None, fontsize=10):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]
        c.text = ''
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = 1.25
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.space_before = Pt(2)
        setfont(p.add_run(h), fontsize, True)
        shade(c, 'E8EEF7')
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = ''
            lines = str(v).split('\n')
            for li, line in enumerate(lines):
                p = cells[i].paragraphs[0] if li == 0 else cells[i].add_paragraph()
                p.paragraph_format.line_spacing = 1.25
                p.paragraph_format.space_after = Pt(1)
                p.paragraph_format.space_before = Pt(2) if li == 0 else Pt(0)
                setfont(p.add_run(line), fontsize)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                if i < len(row.cells):
                    row.cells[i].width = Cm(w)
    sp = doc.add_paragraph()
    sp.paragraph_format.space_after = Pt(0)
    sp.paragraph_format.space_before = Pt(0)
    sp.paragraph_format.line_spacing = 1.0
    setfont(sp.add_run(''), 4)
    return t


# ══════════════ 표지 ══════════════
for _ in range(5):
    P('', sa=0)
P('2026년 2차 모두의 창업 프로젝트', 16, True, WD_ALIGN_PARAGRAPH.CENTER, sa=4)
P('1R 사업계획서', 26, True, WD_ALIGN_PARAGRAPH.CENTER, sa=24)
P('매체별로 흩어진 광고 데이터를 모아', 13, False, WD_ALIGN_PARAGRAPH.CENTER, sa=2)
P('틀린 숫자가 들어갈 수 없는 성과 리포트를', 13, False, WD_ALIGN_PARAGRAPH.CENTER, sa=2)
P('자동으로 만들어 보내는 서비스', 13, False, WD_ALIGN_PARAGRAPH.CENTER, sa=36)
for _ in range(4):
    P('', sa=0)
P('2026. 11.', 13, False, WD_ALIGN_PARAGRAPH.CENTER, sa=28)

t = doc.add_table(rows=3, cols=2)
t.style = 'Table Grid'
t.alignment = WD_TABLE_ALIGNMENT.CENTER
for i, (k, v) in enumerate([('멘토기관', '광운대학교'), ('이  름', ''), ('닉네임', '')]):
    for j, val in enumerate((k, v)):
        c = t.rows[i].cells[j]
        c.text = ''
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = 1.4
        setfont(p.add_run(val), 12, j == 0)
        if j == 0:
            shade(c, 'E8EEF7')
    t.rows[i].cells[0].width = Cm(4)
    t.rows[i].cells[1].width = Cm(8)

doc.add_page_break()

# ══════════════ 본문 ══════════════
build_q1(H, SH, P, R, T, NOTE)
build_q2(H, SH, P, R, T, NOTE)
build_q3(H, SH, P, R, T, NOTE)
build_q4(H, SH, P, R, T, NOTE)
build_appendix(H, SH, P, R, T, NOTE, doc, Pt, WD_ALIGN_PARAGRAPH)

out = r'D:/Program/SYProject/docs/제출본/한다솔_1R 사업계획서.docx'
doc.save(out)
print('saved:', out)
