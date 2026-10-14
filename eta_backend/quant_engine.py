import yfinance as yf
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

def calculate_technical_indicators(df):
    df = df.copy()
    # RSI (Relative Strength Index)
    delta = df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-9)
    df['RSI'] = 100 - (100 / (1 + rs))

    # MACD
    exp1 = df['Close'].ewm(span=12, adjust=False).mean()
    exp2 = df['Close'].ewm(span=26, adjust=False).mean()
    df['MACD'] = exp1 - exp2
    df['Signal_Line'] = df['MACD'].ewm(span=9, adjust=False).mean()

    # Moving Averages
    df['SMA_20'] = df['Close'].rolling(window=20).mean()
    df['SMA_50'] = df['Close'].rolling(window=50).mean()

    # Bollinger Bands
    df['BB_std'] = df['Close'].rolling(window=20).std()
    df['BB_upper'] = df['SMA_20'] + (df['BB_std'] * 2)
    df['BB_lower'] = df['SMA_20'] - (df['BB_std'] * 2)
    
    # Target: 1 if close price 5 days from now is higher than today, else 0
    df['Target'] = (df['Close'].shift(-5) > df['Close']).astype(int)

    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.dropna(inplace=True)
    return df

def fetch_and_prepare_data(symbol, period="2y"):
    sym_list = [symbol]
    if "." not in symbol:
        sym_list.extend([f"{symbol}.NS", f"{symbol}.BO"])

    for s in sym_list:
        try:
            ticker = yf.Ticker(s)
            df = ticker.history(period=period)
            if not df.empty and len(df) >= 100:
                df = calculate_technical_indicators(df)
                if len(df) >= 55:
                    return df
        except Exception:
            continue
    return None

def train_and_predict(df):
    features = ['RSI', 'MACD', 'Signal_Line', 'SMA_20', 'SMA_50', 'BB_upper', 'BB_lower', 'Volume']
    X = df[features]
    y = df['Target']
    
    # We train on everything except the last 5 days (which don't have valid targets)
    X_train = X[:-5]
    y_train = y[:-5]
    
    if len(X_train) < 50:
        return None

    # Train a lightweight model on the fly
    model = RandomForestClassifier(n_estimators=50, random_state=42, max_depth=5)
    model.fit(X_train, y_train)

    # Predict probability for the most recent day
    latest_features = X.iloc[[-1]]
    probabilities = model.predict_proba(latest_features)[0]
    classes = list(model.classes_)
    # A strongly one-directional history can contain only one target class.
    # sklearn then returns a single probability column rather than class 0/1.
    prob_up = float(probabilities[classes.index(1)]) if 1 in classes else 0.0
    
    # Technical Indicator Scoring for Bullish vs Bearish Run Scale
    latest = df.iloc[-1]
    bull_points = 0
    total_points = 0
    signals = []

    # 1. RSI Signal
    rsi = latest['RSI']
    total_points += 1
    if rsi < 30:
        bull_points += 0.8
        signals.append({"indicator": "RSI (14)", "bias": "Bullish (Oversold)", "detail": f"RSI at {rsi:.1f} indicates strong oversold bounce potential."})
    elif 50 <= rsi <= 70:
        bull_points += 0.7
        signals.append({"indicator": "RSI (14)", "bias": "Bullish Momentum", "detail": f"RSI at {rsi:.1f} shows positive upward momentum."})
    elif rsi > 70:
        bull_points += 0.3
        signals.append({"indicator": "RSI (14)", "bias": "Bearish (Overbought)", "detail": f"RSI at {rsi:.1f} indicates overbought risk."})
    else:
        bull_points += 0.4
        signals.append({"indicator": "RSI (14)", "bias": "Neutral", "detail": f"RSI at {rsi:.1f} is in neutral consolidation territory."})

    # 2. MACD Signal
    macd = latest['MACD']
    sig = latest['Signal_Line']
    total_points += 1
    if macd > sig:
        bull_points += 0.9
        signals.append({"indicator": "MACD", "bias": "Bullish Crossover", "detail": "MACD line is above signal line indicating upward trend momentum."})
    else:
        bull_points += 0.1
        signals.append({"indicator": "MACD", "bias": "Bearish Crossover", "detail": "MACD line is below signal line indicating downward pressure."})

    # 3. SMA 20 & SMA 50
    close_price = latest['Close']
    sma20 = latest['SMA_20']
    sma50 = latest['SMA_50']
    total_points += 1
    if close_price > sma20 and sma20 > sma50:
        bull_points += 1.0
        signals.append({"indicator": "Moving Averages", "bias": "Strong Bullish Trend", "detail": f"Price (₹{close_price:.2f}) is above SMA 20 (₹{sma20:.2f}) and SMA 50."})
    elif close_price > sma20:
        bull_points += 0.65
        signals.append({"indicator": "Moving Averages", "bias": "Bullish Above SMA 20", "detail": f"Price is trading above 20-day average."})
    else:
        bull_points += 0.15
        signals.append({"indicator": "Moving Averages", "bias": "Bearish Below SMA 20", "detail": f"Price is trading below 20-day moving average."})

    # 4. Bollinger Bands
    bb_upper = latest['BB_upper']
    bb_lower = latest['BB_lower']
    total_points += 1
    if close_price >= bb_upper:
        bull_points += 0.4
        signals.append({"indicator": "Bollinger Bands", "bias": "Upper Band Breakout", "detail": "Price testing upper band resistance."})
    elif close_price <= bb_lower:
        bull_points += 0.8
        signals.append({"indicator": "Bollinger Bands", "bias": "Lower Band Support", "detail": "Price at lower band support level."})
    else:
        mid_band = (bb_upper + bb_lower) / 2
        if close_price > mid_band:
            bull_points += 0.6
            signals.append({"indicator": "Bollinger Bands", "bias": "Upper Half Zone", "detail": "Trading in upper half of Bollinger Band."})
        else:
            bull_points += 0.35
            signals.append({"indicator": "Bollinger Bands", "bias": "Lower Half Zone", "detail": "Trading in lower half of Bollinger Band."})

    # Combine ML probability and Technical Indicator points
    tech_pct = (bull_points / total_points) * 100
    blended_bull = int((prob_up * 100 * 0.4) + (tech_pct * 0.6))
    bullish_pct = max(5, min(95, blended_bull))
    bearish_pct = 100 - bullish_pct

    quant_score = blended_bull

    # Determine top drivers
    importances = model.feature_importances_
    feature_importance_map = sorted(zip(features, importances), key=lambda x: x[1], reverse=True)
    top_drivers = [f[0] for f in feature_importance_map[:3]]

    reasoning = [s["detail"] for s in signals[:3]]

    return {
        "score": quant_score,
        "bullishPct": bullish_pct,
        "bearishPct": bearish_pct,
        "signals": signals,
        "drivers": top_drivers,
        "reasoning": reasoning
    }

def get_quant_analysis(symbol):
    try:
        df = fetch_and_prepare_data(symbol)
        if df is None:
            return {"error": "Not enough data to calculate quantitative score."}
        
        result = train_and_predict(df)
        if not result:
            return {"error": "Failed to train quantitative model."}
            
        return result
    except Exception as e:
        return {"error": str(e)}
