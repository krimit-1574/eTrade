from fpdf import FPDF
import tempfile

def create_pdf_report(data):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # Fonts
    pdf.set_font("Arial", 'B', 24)
    pdf.set_text_color(184, 150, 46) # Gold
    
    company = data.get('companyName', 'Stock')
    symbol = data.get('symbol', 'SYM')
    
    # Title
    pdf.cell(0, 10, f"eTA Research: {company} ({symbol})", ln=True, align='L')
    pdf.ln(5)
    
    pdf.set_font("Arial", '', 12)
    pdf.set_text_color(100, 100, 100)
    sector = data.get('sector', '')
    exchange = data.get('exchange', '')
    mcap = data.get('financials', {}).get('mktCap', '')
    pdf.cell(0, 10, f"{sector} . {exchange} . {mcap}", ln=True, align='L')
    pdf.ln(5)
    
    pdf.set_font("Arial", 'I', 11)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 8, data.get('description', ''))
    pdf.ln(5)
    
    # AI Score
    pdf.set_font("Arial", 'B', 16)
    score = data.get('aiScore', 0)
    color = (22, 163, 74) if score >= 70 else ((201, 168, 76) if score >= 50 else (220, 38, 38))
    pdf.set_text_color(*color)
    pdf.cell(0, 10, f"AI Score: {score}/100", ln=True)
    pdf.set_font("Arial", '', 11)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 8, data.get('scoreReason', ''))
    pdf.ln(5)
    
    # Bull Case
    pdf.set_font("Arial", 'B', 14)
    pdf.set_text_color(22, 163, 74)
    pdf.cell(0, 10, "Bull Case", ln=True)
    pdf.set_text_color(0, 0, 0)
    for b in data.get('bullCase', []):
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(0, 8, b.get('title', ''), ln=True)
        pdf.set_font("Arial", '', 11)
        pdf.multi_cell(0, 8, b.get('detail', ''))
    pdf.ln(5)
    
    # Bear Case
    pdf.set_font("Arial", 'B', 14)
    pdf.set_text_color(220, 38, 38)
    pdf.cell(0, 10, "Bear Case", ln=True)
    pdf.set_text_color(0, 0, 0)
    for b in data.get('bearCase', []):
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(0, 8, b.get('title', ''), ln=True)
        pdf.set_font("Arial", '', 11)
        pdf.multi_cell(0, 8, b.get('detail', ''))
    pdf.ln(5)
    
    # Financials
    pdf.set_font("Arial", 'B', 14)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 10, "Key Financials", ln=True)
    pdf.set_font("Arial", '', 11)
    fins = data.get('financials', {})
    for k, v in fins.items():
        pdf.cell(60, 8, str(k).upper(), border=1)
        pdf.cell(0, 8, str(v), border=1, ln=True)
    pdf.ln(5)
    
    # Advice
    pdf.set_font("Arial", 'B', 14)
    pdf.cell(0, 10, "Portfolio Recommendation", ln=True)
    advice = data.get('advice', {})
    add = advice.get('add', False)
    pdf.set_text_color(22, 163, 74) if add else pdf.set_text_color(220, 38, 38)
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(0, 8, "✓ RECOMMENDED TO ADD" if add else "✗ AVOID / HOLD OFF", ln=True)
    pdf.set_font("Arial", '', 11)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 8, advice.get('reasoning', ''))
    
    # Write to temp file
    temp = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
    pdf.output(temp.name)
    return temp.name
