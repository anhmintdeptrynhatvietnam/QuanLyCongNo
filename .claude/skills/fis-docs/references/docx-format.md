# OOXML Format Reference

## Structure
```
file.docx (ZIP)
├── word/
│   ├── document.xml
│   ├── styles.xml
│   ├── numbering.xml
│   └── media/
└── docProps/
```

## python-docx tips

```python
import docx
doc = docx.Document("file.docx")

for p in doc.paragraphs:
    print(p.style.name, p.text)

for t in doc.tables:
    for row in t.rows:
        for cell in row.cells:
            print(cell.text)

# Iterate in order (paragraphs + tables interleaved)
def iter_block_items(parent):
    from docx.document import Document as _Doc
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P
    from docx.text.paragraph import Paragraph
    from docx.table import Table
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)
```

## Common issues

| Issue | Reason | Fix |
|---|---|---|
| Heading not detected | Bold paragraph thay vì Heading style | Scan all + check `is_bold` |
| Auto-numbering missing | Roman numeral từ numbering.xml | Match keyword không expect "I." prefix |
| Table cell text concat | python-docx joins runs với \n | `.replace("\n", " ")` |
| Image extraction | Stored separately word/media/ | Find inline images, copy from ZIP |
| Embedded Visio | OLE object | Extract image only |

## Generating

```python
from docx import Document
from docx.shared import Pt

doc = Document()
doc.add_heading("Title", 0)
doc.add_paragraph("Body")

table = doc.add_table(rows=2, cols=3)
table.style = "Light Grid Accent 1"
table.rows[0].cells[0].text = "Header 1"

doc.save("output.docx")
```

## Cowork
Đọc .docx native — không cần Python script. Skill body hướng dẫn Claude scan headings.
