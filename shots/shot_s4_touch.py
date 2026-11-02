from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 700}, has_touch=True, is_mobile=True)
    pt = ctx.new_page()
    pt.goto('http://127.0.0.1:5173/', wait_until='networkidle')
    pt.wait_for_timeout(900)
    box = pt.evaluate("() => { const c = document.getElementById('game'); const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }")

    def gclick(gx, gy):
        pt.mouse.click(box['x'] + gx / 960 * box['w'], box['y'] + gy / 600 * box['h'])

    gclick(480, 267)
    pt.wait_for_timeout(700)
    pt.screenshot(path='shots/s4-setup-touch.png')
    gclick(480, 452)
    pt.wait_for_timeout(2500)
    pt.screenshot(path='shots/s4-game-touch.png')
    print('touch recapture ok')
    ctx.close()
    b.close()
