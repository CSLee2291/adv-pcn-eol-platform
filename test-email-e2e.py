from playwright.sync_api import sync_playwright
import os

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
MSG_FILE = os.path.join(os.path.dirname(__file__),
    "test-fixtures", "vendor-emails",
    "【ProductProcess Change】Vishay Product Notification - PCN-OPT-1484-2026-REV-0.msg")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    print("1. Go to upload page, click Email tab...")
    page.goto("http://localhost:5173/pcn/upload")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)

    # Click Email tab
    tabs = page.locator('[role="tab"]').all()
    for t in tabs:
        if "Email" in t.inner_text():
            t.click()
            break
    page.wait_for_timeout(500)

    print("2. Upload .msg file...")
    file_input = page.locator('input[type="file"]')
    file_input.set_input_files(MSG_FILE)

    print("3. Waiting for parse result...")
    page.wait_for_timeout(8000)
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "email_e2e_01_parsed.png"), full_page=True)

    # Click Approve & Analyze if visible
    print("4. Click Approve & Analyze...")
    approve_btn = page.locator('button:has-text("Approve")')
    if approve_btn.count() > 0:
        approve_btn.click()
        print("5. Waiting for AI analysis...")
        page.wait_for_timeout(5000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "email_e2e_02_approved.png"), full_page=True)
    else:
        print("   No approve button found")
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "email_e2e_02_no_approve.png"), full_page=True)

    browser.close()
    print("Done!")
