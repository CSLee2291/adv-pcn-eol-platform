from playwright.sync_api import sync_playwright
import os

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(page, name):
    path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  Screenshot saved: {path}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # 1. Dashboard
    print("1. Dashboard...")
    page.goto("http://localhost:5173/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    screenshot(page, "01_dashboard")

    # 2. PCN Events list
    print("2. PCN Events list...")
    page.goto("http://localhost:5173/pcn")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    screenshot(page, "02_pcn_events")

    # 3. PCN Upload page
    print("3. PCN Upload page...")
    page.goto("http://localhost:5173/pcn/upload")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "03_pcn_upload")

    # 4. PCN Detail (the TI PCN with AI analysis)
    print("4. PCN Detail...")
    page.goto("http://localhost:5173/pcn/8e58d13a-a071-4cd4-85ed-8255993f4186")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    screenshot(page, "04_pcn_detail")

    # 5. AI Analysis list
    print("5. AI Analysis list...")
    page.goto("http://localhost:5173/analysis")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    screenshot(page, "05_ai_analysis")

    # 6. Where-Used page
    print("6. Where-Used page...")
    page.goto("http://localhost:5173/where-used")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "06_where_used")

    # 7. Cases page
    print("7. Cases page...")
    page.goto("http://localhost:5173/cases")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "07_cases")

    browser.close()
    print("\nDone! All screenshots saved to screenshots/")
