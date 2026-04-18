from playwright.sync_api import sync_playwright
import os

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    print("1. Upload page - PDF tab (default)...")
    page.goto("http://localhost:5173/pcn/upload")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "email_01_pdf_tab.png"), full_page=True)

    # Find and click the Email tab
    print("2. Clicking Email tab...")
    tabs = page.locator('[role="tab"]').all()
    print(f"   Found {len(tabs)} tabs")
    for t in tabs:
        text = t.inner_text()
        print(f"   Tab: '{text}'")
        if "Email" in text or "Outlook" in text:
            t.click()
            page.wait_for_timeout(500)
            break

    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "email_02_email_tab.png"), full_page=True)

    browser.close()
    print("Done!")
