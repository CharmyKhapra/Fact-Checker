from pathlib import Path

import pymupdf


def extract_pdf(pdf_path: Path):
    """
    Extract PDF text and per-page text.

    Returns:
        text: Complete PDF text
        page_count: Number of pages
        pages: List containing text for each page
    """

    doc = pymupdf.open(str(pdf_path))

    try:
        pages = []

        for page_number, page in enumerate(doc):
            pages.append({
                "page": page_number + 1,
                "text": page.get_text(),
            })

        text = "\n".join(p["text"] for p in pages).strip()

        return {
            "text": text,
            "page_count": len(pages),
            "pages": pages,
        }

    finally:
        doc.close()


def render_pdf_pages(pdf_path: Path, output_dir: Path):
    """
    Render PDF pages as PNG images using PyMuPDF.
    """

    output_dir.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(str(pdf_path))

    try:
        for page_number, page in enumerate(doc):
            pix = page.get_pixmap(
                matrix=pymupdf.Matrix(2, 2),
                alpha=False,
            )

            output_path = (
                output_dir / f"page_{page_number + 1}.png"
            )

            pix.save(str(output_path))

    finally:
        doc.close()