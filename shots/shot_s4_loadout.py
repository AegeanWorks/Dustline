from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:5173/'

def box_of(pg):
    return pg.evaluate("() => { const c = document.getElementById('game'); const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }")

def gclick(pg, box, gx, gy):
    pg.mouse.click(box['x'] + gx / 960 * box['w'], box['y'] + gy / 600 * box['h'])

with sync_playwright() as p:
    b = p.chromium.launch()
    # desktop states
    pg = b.new_page(viewport={'width': 1100, 'height': 750})
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_timeout(900)
    box = box_of(pg)
    gclick(pg, box, 480, 267)  # play -> setup
    pg.wait_for_timeout(700)
    pg.screenshot(path='shots/s4-setup-default.png')
    # weapon: RAILGUN is 5th card: x=36+4*178=748 center 748+85=833, y=74+24=98
    gclick(pg, box, 833, 98)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-weapon.png')
    # operator: ARCANIST 6th: x=36+5*148=776 center 776+71=847, y=204+16=220
    gclick(pg, box, 847, 220)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-operator.png')
    # map: GLASS WASTES 7th: mapStart=(960-(7*124+6*6))/2=28, x=28+6*130=808 center 808+62=870, y=140+24=164
    gclick(pg, box, 870, 164)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-map.png')
    # mutators: GLASS (1st) + SWARM (2nd): x=36 / 184, center 107/255, y=348+15=363
    gclick(pg, box, 107, 363)
    pg.wait_for_timeout(250)
    gclick(pg, box, 255, 363)
    pg.wait_for_timeout(250)
    # mutation: OVERCLOCK 4th: x=36+3*178=570 center 570+86=656, y=390+15=405
    gclick(pg, box, 656, 405)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-mutators.png')
    print('desktop states ok')
    pg.close()
    # small screen
    ps = b.new_page(viewport={'width': 390, 'height': 700})
    ps.goto(URL, wait_until='networkidle')
    ps.wait_for_timeout(900)
    box = box_of(ps)
    ps.mouse.click(box['x'] + 480 / 960 * box['w'], box['y'] + 267 / 600 * box['h'])
    ps.wait_for_timeout(700)
    ps.screenshot(path='shots/s4-setup-small.png')
    print('small ok')
    ps.close()
    # touch / mobile in-run controls
    ctx = b.new_context(viewport={'width': 390, 'height': 700}, has_touch=True, is_mobile=True)
    pt = ctx.new_page()
    pt.goto(URL, wait_until='networkidle')
    pt.wait_for_timeout(900)
    box = box_of(pt)
    pt.touchscreen.tap(box['x'] + 480 / 960 * box['w'], box['y'] + 267 / 600 * box['h'])
    pt.wait_for_timeout(700)
    pt.screenshot(path='shots/s4-setup-touch.png')
    # deploy via tap
    pt.touchscreen.tap(box['x'] + 480 / 960 * box['w'], box['y'] + 452 / 600 * box['h'])
    pt.wait_for_timeout(2500)
    pt.screenshot(path='shots/s4-game-touch.png')
    print('touch ok')
    ctx.close()
    b.close()
