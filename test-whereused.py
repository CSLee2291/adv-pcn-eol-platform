from playwright.sync_api import sync_playwright
import os

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    print("1. Navigate to Where-Used page...")
    page.goto("http://localhost:5173/where-used")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    print("2. Type MPN and search...")
    page.fill('input[placeholder*="MPN"]', "AMC1100DWVR")
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "wu_01_input.png"), full_page=True)

    page.click('button:has-text("Search")')
    print("3. Waiting for Denodo response...")
    # Wait for loading to finish (search button text changes back)
    page.wait_for_timeout(20000)  # Denodo can be slow
    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "wu_02_results.png"), full_page=True)

    # Click Parts Info tab
    print("4. Parts Info tab...")
    parts_tab = page.locator('button:has-text("Parts Info")')
    if parts_tab.count() > 0:
        parts_tab.click()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "wu_03_parts_info.png"), full_page=True)

    # Click MPN Mapping tab
    print("5. MPN Mapping tab...")
    mpn_tab = page.locator('button:has-text("MPN Mapping")')
    if mpn_tab.count() > 0:
        mpn_tab.click()
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "wu_04_mpn_mapping.png"), full_page=True)

    browser.close()
    print("Done! Screenshots saved to screenshots/")
