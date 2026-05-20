"""
한국 프랜차이즈 신메뉴 뉴스 크롤러 + Gmail 발송 스크립트

환경변수 필요:
  - NAVER_CLIENT_ID: 네이버 개발자센터 Client ID
  - NAVER_CLIENT_SECRET: 네이버 개발자센터 Client Secret
  - GMAIL_ADDRESS: 발신 Gmail 주소
  - GMAIL_APP_PASSWORD: Gmail 앱 비밀번호 (2단계 인증 필요)
  - RECIPIENT_EMAIL: 수신 이메일 주소
"""

import os
import sys
import json
import smtplib
import urllib.request
import urllib.parse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from html import unescape
import re


BRANDS = {
    "햄버거": [
        "맥도날드", "버거킹", "롯데리아", "맘스터치", "쉐이크쉑",
        "파이브가이즈", "노브랜드버거", "KFC버거",
    ],
    "치킨": [
        "BBQ치킨", "교촌치킨", "BHC", "굽네치킨", "네네치킨",
        "페리카나", "푸라닭", "KFC",
    ],
    "피자": [
        "도미노피자", "피자헛", "파파존스", "미스터피자",
        "피자알볼로", "7번가피자", "피자마루",
    ],
}


def fetch_naver_news(query: str, display: int = 5) -> list[dict]:
    client_id = os.environ["NAVER_CLIENT_ID"]
    client_secret = os.environ["NAVER_CLIENT_SECRET"]

    encoded_query = urllib.parse.quote(query)
    url = (
        f"https://openapi.naver.com/v1/search/news.json"
        f"?query={encoded_query}&display={display}&sort=date"
    )

    req = urllib.request.Request(url)
    req.add_header("X-Naver-Client-Id", client_id)
    req.add_header("X-Naver-Client-Secret", client_secret)

    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    articles = []
    for item in data.get("items", []):
        title = strip_html(item.get("title", ""))
        description = strip_html(item.get("description", ""))
        link = item.get("link", "")
        pub_date = item.get("pubDate", "")
        articles.append({
            "title": title,
            "description": description,
            "link": link,
            "pub_date": pub_date,
        })
    return articles


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).strip()


def collect_news() -> dict[str, list[dict]]:
    results = {}
    for category, brands in BRANDS.items():
        category_articles = []
        for brand in brands:
            query = f"{brand} 신메뉴"
            try:
                articles = fetch_naver_news(query, display=3)
                for article in articles:
                    article["brand"] = brand
                category_articles.extend(articles)
            except Exception as e:
                print(f"[WARNING] '{brand}' 검색 실패: {e}")
        results[category] = deduplicate(category_articles)
    return results


def deduplicate(articles: list[dict]) -> list[dict]:
    seen_titles = set()
    unique = []
    for article in articles:
        normalized = article["title"].lower().strip()
        if normalized not in seen_titles:
            seen_titles.add(normalized)
            unique.append(article)
    return unique


def build_html_email(news: dict[str, list[dict]]) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    total = sum(len(v) for v in news.values())

    html_parts = [
        f"""
        <html><body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #e74c3c; border-bottom: 3px solid #e74c3c; padding-bottom: 10px;">
            프랜차이즈 신메뉴 뉴스 ({today})
        </h1>
        <p style="color: #7f8c8d;">총 <strong>{total}</strong>건의 뉴스가 수집되었습니다.</p>
        """
    ]

    category_icons = {"햄버거": "🍔", "치킨": "🍗", "피자": "🍕"}

    for category, articles in news.items():
        icon = category_icons.get(category, "📰")
        html_parts.append(
            f'<h2 style="color: #2c3e50; margin-top: 30px;">'
            f'{icon} {category} ({len(articles)}건)</h2>'
        )

        if not articles:
            html_parts.append('<p style="color: #95a5a6;">수집된 뉴스가 없습니다.</p>')
            continue

        for article in articles:
            html_parts.append(
                f"""
                <div style="border-left: 4px solid #3498db; padding: 10px 15px; margin: 10px 0; background: #f8f9fa;">
                    <p style="margin: 0 0 5px 0; font-size: 11px; color: #95a5a6;">
                        [{article['brand']}] {article['pub_date']}
                    </p>
                    <a href="{article['link']}" style="font-weight: bold; color: #2c3e50; text-decoration: none; font-size: 15px;">
                        {article['title']}
                    </a>
                    <p style="margin: 8px 0 0 0; color: #555; font-size: 13px; line-height: 1.5;">
                        {article['description']}
                    </p>
                </div>
                """
            )

    html_parts.append("</body></html>")
    return "".join(html_parts)


def send_email(subject: str, html_body: str) -> None:
    sender = os.environ["GMAIL_ADDRESS"]
    password = os.environ["GMAIL_APP_PASSWORD"]
    recipient = os.environ.get("RECIPIENT_EMAIL", sender)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, password)
        server.sendmail(sender, recipient, msg.as_string())

    print(f"[OK] 이메일 발송 완료 → {recipient}")


def main():
    print("=== 프랜차이즈 신메뉴 뉴스 크롤러 시작 ===")
    print(f"실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    news = collect_news()

    total = sum(len(v) for v in news.values())
    for cat, articles in news.items():
        print(f"  {cat}: {len(articles)}건")
    print(f"  합계: {total}건")

    if total == 0:
        print("[INFO] 수집된 뉴스가 없어 이메일을 발송하지 않습니다.")
        return

    today = datetime.now().strftime("%Y-%m-%d")
    subject = f"[신메뉴 뉴스] 프랜차이즈 신메뉴 소식 - {today}"
    html_body = build_html_email(news)

    send_email(subject, html_body)
    print("=== 완료 ===")


if __name__ == "__main__":
    main()
