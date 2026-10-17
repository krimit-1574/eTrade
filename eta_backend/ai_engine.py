import json
import math
import re
from google import genai
from google.genai import types


_TEXT_FIELDS = (
    "companyName", "symbol", "sector", "exchange", "description",
    "mgmtCommentary", "scoreReason",
)
_SECTION_FIELDS = {
    "investOrWait": ("action", "recommendation", "reasoning"),
    "stockQuality": ("verdict", "rating", "details"),
    "currentScenario": ("verdict", "status", "details"),
    "longTermSuitability": ("verdict", "suitability", "details"),
}
_FINANCIAL_FIELDS = (
    "roe", "roce", "pe", "pbv", "dte", "revGrowth", "margin",
    "eps", "divYield", "mktCap",
)
_SCORE_FIELDS = ("fundamentals", "growth", "management", "valuation", "risk")


def _safe_text(value, max_length=4000):
    """Return a bounded render-safe scalar instead of arbitrary model JSON."""
    if value is None:
        return ""
    if not isinstance(value, (str, int, float, bool)):
        return ""
    text = str(value).strip()
    return text[:max_length]


def _bounded_number(value, default=0.0, minimum=0.0, maximum=100.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    number = min(maximum, max(minimum, number))
    return int(number) if number.is_integer() else round(number, 2)


def _text_mapping(value, fields):
    source = value if isinstance(value, dict) else {}
    return {field: _safe_text(source.get(field)) for field in fields}


def _case_items(value):
    if not isinstance(value, list):
        return []
    items = []
    for raw_item in value[:10]:
        if not isinstance(raw_item, dict):
            continue
        title = _safe_text(raw_item.get("title"), 300)
        detail = _safe_text(raw_item.get("detail"))
        if title or detail:
            items.append({"title": title, "detail": detail})
    return items


def _validate_analysis_payload(payload):
    """Normalize untrusted model output to the schema rendered by the client."""
    if not isinstance(payload, dict):
        raise ValueError("AI analysis response must be a JSON object.")

    result = {field: _safe_text(payload.get(field)) for field in _TEXT_FIELDS}
    result["symbol"] = result["symbol"].upper()[:64]

    for section, fields in _SECTION_FIELDS.items():
        result[section] = _text_mapping(payload.get(section), fields)

    result["financials"] = _text_mapping(payload.get("financials"), _FINANCIAL_FIELDS)

    quarterly = _text_mapping(
        payload.get("quarterly"), ("quarter", "revenue", "netProfit", "summary")
    )
    raw_quarterly = payload.get("quarterly")
    raw_highlights = raw_quarterly.get("highlights") if isinstance(raw_quarterly, dict) else []
    quarterly["highlights"] = (
        [_safe_text(item, 1000) for item in raw_highlights[:10] if _safe_text(item, 1000)]
        if isinstance(raw_highlights, list)
        else []
    )
    result["quarterly"] = quarterly

    result["shareholding"] = _text_mapping(
        payload.get("shareholding"), ("promoter", "fii", "dii", "public", "recentChange")
    )

    raw_red_flags = payload.get("redFlags")
    result["redFlags"] = (
        [_safe_text(item, 1000) for item in raw_red_flags[:20] if _safe_text(item, 1000)]
        if isinstance(raw_red_flags, list)
        else []
    )
    result["bullCase"] = _case_items(payload.get("bullCase"))
    result["bearCase"] = _case_items(payload.get("bearCase"))

    result["aiScore"] = _bounded_number(payload.get("aiScore"), 0)
    score_source = payload.get("scoreBreak") if isinstance(payload.get("scoreBreak"), dict) else {}
    result["scoreBreak"] = {
        field: _bounded_number(score_source.get(field), 0) for field in _SCORE_FIELDS
    }

    bullish = _bounded_number(payload.get("bullishPct"), 50)
    bearish = _bounded_number(payload.get("bearishPct"), 100 - bullish)
    sentiment_total = bullish + bearish
    if sentiment_total <= 0:
        bullish, bearish = 50, 50
    elif sentiment_total != 100:
        bullish = round((bullish / sentiment_total) * 100, 1)
        bearish = round(100 - bullish, 1)
    result["bullishPct"] = bullish
    result["bearishPct"] = bearish

    raw_advice = payload.get("advice") if isinstance(payload.get("advice"), dict) else {}
    raw_add = raw_advice.get("add", False)
    result["advice"] = {
        "add": raw_add if isinstance(raw_add, bool) else str(raw_add).strip().lower() == "true",
        "reasoning": _safe_text(raw_advice.get("reasoning")),
        "position": _safe_text(raw_advice.get("position"), 300),
        "horizon": _safe_text(raw_advice.get("horizon"), 300),
    }
    return result

def analyze_stock(name, holdings, api_key, include_comparison=False):
    if not api_key:
        return {"error": "Gemini API Key is missing. Please add it in Settings."}

    client = genai.Client(api_key=api_key)
    
    port_ctx = ""
    if holdings:
        h_strs = [f"{h['name']} ({h['symbol']})" for h in holdings]
        port_ctx = f"User holds: {', '.join(h_strs)}."
    else:
        port_ctx = "User has no current holdings."

    prompt = f"""Analyze the stock "{name}". {port_ctx}
Note: A separate Quantitative Machine Learning model is analyzing technical indicators and providing a "quantScore". Please focus this analysis on fundamentals, news, management, valuation, and market scenario.

Return ONLY valid JSON (no markdown, no backticks, no explanation):
{{
"companyName":"",
"symbol":"",
"sector":"",
"exchange":"",
"description":"1 sentence about the business",
"investOrWait":{{"action":"INVEST","recommendation":"INVEST NOW","reasoning":"2 sentences explaining why to invest or wait"}},
"stockQuality":{{"verdict":"GOOD STOCK","rating":"Good Quality","details":"2 sentences on business fundamentals, debt, moat, and leadership"}},
"currentScenario":{{"verdict":"GOOD SCENARIO","status":"Favorable Entry","details":"2 sentences on current market conditions and entry opportunity"}},
"longTermSuitability":{{"verdict":"GOOD FOR LONG TERM","suitability":"Highly Recommended","details":"2 sentences on 3-5 year growth prospects and compounding ability"}},
"bullishPct":72,
"bearishPct":28,
"bullCase":[{{"title":"","detail":"2 sentences"}},{{"title":"","detail":"2 sentences"}},{{"title":"","detail":"2 sentences"}}],
"bearCase":[{{"title":"","detail":"2 sentences"}},{{"title":"","detail":"2 sentences"}},{{"title":"","detail":"2 sentences"}}],
"financials":{{"roe":"","roce":"","pe":"","pbv":"","dte":"","revGrowth":"","margin":"","eps":"","divYield":"","mktCap":""}},
"quarterly":{{"quarter":"","revenue":"","netProfit":"","summary":"2 sentences","highlights":["","",""]}},
"mgmtCommentary":"3 sentences on latest earnings call themes",
"shareholding":{{"promoter":"","fii":"","dii":"","public":"","recentChange":"1 sentence"}},
"redFlags":["","",""],
"aiScore":75,
"scoreReason":"3 sentences explaining the score",
"scoreBreak":{{"fundamentals":70,"growth":75,"management":70,"valuation":65,"risk":70}},
"advice":{{"add":true,"reasoning":"2 sentences","position":"3-5% of portfolio","horizon":"Long term"}}
}}"""

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are an elite equity research analyst. Respond ONLY with compact, valid JSON. No markdown, no backticks, no preamble. Be specific with numbers. VERY IMPORTANT: Ensure all internal double quotes inside strings are properly escaped (e.g., \\\"word\\\").",
                temperature=0.2,
                response_mime_type="application/json"
            )
        )
        
        # Parse the JSON response robustly
        text = response.text.strip()
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            # Fallback cleanup for common unescaped quote issues in AI responses
            # This is a basic heuristic if the model still failed
            text = text.replace('\n', ' ')
            payload = json.loads(text)

        return _validate_analysis_payload(payload)
        
    except Exception as e:
        return {"error": str(e)}
