import json
import re
from google import genai
from google.genai import types

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
            return json.loads(text)
        except json.JSONDecodeError:
            # Fallback cleanup for common unescaped quote issues in AI responses
            # This is a basic heuristic if the model still failed
            text = text.replace('\n', ' ')
            return json.loads(text)
        
    except Exception as e:
        return {"error": str(e)}
